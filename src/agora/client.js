// -----------------------------------------------------------------------------
// The HTTP client of one Agora Famille account.
//
// It talks to the API the portal pages use (`<commune>.agoraplus.fr/InternalApi`,
// see src/agora/endpoints.js): sign in with the login and the password, keep
// the session id the API answers and send it back in the `session_id` header
// of every request, the way the pages do. An expired session answers 401/403
// (or, on older portals, a login page or a redirect): sign in again, once, and
// repeat the request.
//
// The password only ever leaves this module in the body of the login request,
// over HTTPS. It is never logged, and neither are the session id nor cookies.
// -----------------------------------------------------------------------------

import { createLogger } from '../logging.js';
import { API_ACCESS, ENDPOINTS } from './endpoints.js';
import { parseChildren, parseInvoices, parsePlanning } from './parse.js';

const logger = createLogger({ name: 'agora' });

/** The language the portal pages ask in (a French portal, French texts). */
export const ACCEPT_LANGUAGE = 'fr-FR,fr;q=0.9';

/** Who is asking: this integration, not a browser it would pretend to be. */
export const USER_AGENT =
  'gladys-calendar-agorafamille (Gladys Assistant integration; +https://github.com/prohand/gladys-calendar-agorafamille)';

/** A slow portal is common at 8 a.m. on a school day; past this, it is down. */
export const REQUEST_TIMEOUT_MS = 20_000;

/** What went wrong, in terms a status message can explain. */
export const ERROR_CODES = {
  CONFIG: 'config', // nothing to sign in with yet
  AUTH: 'auth', // the portal refused the credentials
  NETWORK: 'network', // no answer (DNS, timeout, connection refused)
  HTTP: 'http', // an answer, but an error status
  FORMAT: 'format', // an answer the integration cannot read
  UNMAPPED: 'unmapped', // a request of the portal not captured yet (endpoints.js)
};

export class AgoraError extends Error {
  /**
   * @param {string} code a value of ERROR_CODES
   * @param {string} message English, for the logs
   * @param {object} [details] `{ status, step }`
   */
  constructor(code, message, details = {}) {
    super(message);
    this.name = 'AgoraError';
    this.code = code;
    this.status = details.status ?? null;
    this.step = details.step ?? null;
    // What the portal itself said, when it said something (ERROR.MESSAGE).
    this.portalMessage = details.portalMessage ?? null;
  }
}

/**
 * Thrown internally when the portal answers its login page instead of data,
 * or a read with a negative TYPE_RESULT (`answer` then holds it).
 */
class SessionExpired extends Error {
  constructor(answer = null) {
    super('Session expired');
    this.answer = answer;
  }
}

export class AgoraClient {
  /**
   * @param {object} options
   * @param {string} options.apiBase API of the municipality, e.g. https://opb.agoraplus.fr
   * @param {string} [options.origin] origin of the portal pages, sent as `Origin`
   * @param {string} options.username
   * @param {string} options.password
   * @param {typeof fetch} [options.fetch] injected by the tests
   * @param {number} [options.timeoutMs]
   */
  constructor({ apiBase, origin, username, password, fetch = globalThis.fetch, timeoutMs }) {
    this.base = apiBase;
    this.origin = origin ?? null;
    this.username = username;
    this.password = password;
    this.fetch = fetch;
    this.timeoutMs = timeoutMs ?? REQUEST_TIMEOUT_MS;
    this.cookies = new Map();
    this.sessionId = null;
    this.refYear = null;
    this.targets = [];
    this.menuChildren = [];
    this.signedIn = false;
  }

  /** Sign in, and keep the session id for the next requests. */
  async login() {
    if (!this.base || !this.username || !this.password) {
      throw new AgoraError(ERROR_CODES.CONFIG, 'Portal address, login or password missing', {
        step: 'login',
      });
    }
    this.cookies.clear();
    this.sessionId = null;
    this.refYear = null;
    this.signedIn = false;
    const encrypted = await this.encryptPassword();
    // It signs in as well as the password: masked in the logs like it.
    this.encryptedPassword = encrypted;
    const { fields } = ENDPOINTS.login;
    const response = await this.send(ENDPOINTS.login, {
      body: JSON.stringify({ [fields.username]: this.username, [fields.password]: encrypted }),
      contentType: 'application/json',
      step: 'login',
    });
    if (response.status === 401 || response.status === 403) {
      await this.logAnswer(ENDPOINTS.login, response);
      logger.warn(`Login refused: ${this.describeCredentials()}`);
      throw new AgoraError(ERROR_CODES.AUTH, 'The portal refused the login or password', {
        status: response.status,
        step: 'login',
      });
    }
    if (response.status >= 400) {
      await this.logAnswer(ENDPOINTS.login, response);
      throw new AgoraError(ERROR_CODES.HTTP, `Login answered HTTP ${response.status}`, {
        status: response.status,
        step: 'login',
      });
    }
    // A refused login may answer 200 too, with a message: read it when it is JSON.
    const answer = await readJson(response).catch(() => null);
    if (answer && isFailure(answer)) {
      // What made it a refusal, for whoever adapts the integration: the
      // status fields and the message, never the rest of the answer.
      logger.warn(
        `Login refused (HTTP ${response.status}): ${this.mask(describeStatus(answer))}; ` +
          `answer fields: ${keyPaths(answer).join(', ') || 'none'}; ${this.describeCredentials()}`,
      );
      const portalMessage = this.mask(failureMessage(answer) ?? '') || null;
      // "Exception detected" is the portal failing on the request, not a
      // verdict on the password: saying "wrong password" sent the user
      // checking a password that was right.
      const aboutCredentials =
        !portalMessage ||
        /identifiant|mot de passe|login|password|incorrect|invalide|invalid|compte|account/i.test(
          portalMessage,
        );
      throw new AgoraError(
        aboutCredentials ? ERROR_CODES.AUTH : ERROR_CODES.FORMAT,
        aboutCredentials
          ? 'The portal refused the login or password'
          : `The portal failed on the login: ${portalMessage}`,
        { status: response.status, step: 'login', portalMessage },
      );
    }
    // The names of the answer's fields, never their values: what is needed to
    // adapt the integration to the portal, and nothing of the family's data.
    const fieldNames = answer && typeof answer === 'object' ? keyPaths(answer).join(', ') : '';
    this.sessionId =
      response.headers.get('session_id') ??
      response.headers.get('session-id') ??
      findValue(answer, /^(session_?id|sessionid|id_?session|token|access_?token)$/i);
    this.refYear = findValue(
      answer,
      /^(school_?year|ref_?year|annee_?ref(erence)?|current_?year)$/i,
    );
    // The portal pages turn away a user of type 1 (an account of the
    // municipality's staff, not a family) right after a successful login.
    const userType = findValue(answer, /^user_?type_?id$/i);
    if (userType === '1') {
      throw new AgoraError(ERROR_CODES.AUTH, 'This account is not a family account', {
        step: 'login',
        portalMessage: 'USER_TYPE_ID 1',
      });
    }
    // The children of the account, as the planning names them (`1001$0`),
    // when the login answer carries them.
    this.menuChildren = childrenOfMenus(answer);
    this.targets = collectTargets(answer);
    for (const child of this.menuChildren) {
      if (!this.targets.includes(`${child.id}$0`)) {
        this.targets.push(`${child.id}$0`);
      }
    }
    if (!this.sessionId && this.cookies.size === 0) {
      throw new AgoraError(
        ERROR_CODES.FORMAT,
        `The login answer carries no session id (fields: ${fieldNames || 'none'})`,
        { status: response.status, step: 'login' },
      );
    }
    this.signedIn = true;
    logger.info(
      `Signed in to the portal (answer fields: ${fieldNames || 'none'}; ` +
        `${this.targets.length} child target(s) found, ${this.menuChildren.length} in the menu)`,
    );
  }

  /**
   * The password the way the sign-in takes it: Base64-encoded, then
   * encrypted by the API itself (the portal pages do the same, see
   * endpoints.js). Never logged: it signs in as well as the password.
   */
  async encryptPassword() {
    const endpoint = ENDPOINTS.encryptPassword;
    if (!endpoint.path) {
      throw new AgoraError(
        ERROR_CODES.UNMAPPED,
        'The portal request encrypting the password is not known yet (src/agora/endpoints.js)',
        { step: 'encrypt' },
      );
    }
    const response = await this.send(endpoint, {
      body: JSON.stringify({
        [endpoint.field]: encodePassword(this.password, endpoint.passwordEncoding),
      }),
      contentType: 'application/json',
      step: 'encrypt',
    });
    if (response.status >= 400) {
      await this.logAnswer(endpoint, response);
      throw new AgoraError(
        ERROR_CODES.HTTP,
        `Encrypting the password answered HTTP ${response.status}`,
        {
          status: response.status,
          step: 'encrypt',
        },
      );
    }
    const answer = await readJson(response).catch(() => null);
    const encrypted = field(answer, 'data');
    if (!answer || isFailure(answer) || typeof encrypted !== 'string' || !encrypted) {
      const portalMessage = answer ? this.mask(failureMessage(answer) ?? '') || null : null;
      logger.warn(
        `Encrypting the password failed (HTTP ${response.status}): ` +
          `${answer ? this.mask(describeStatus(answer)) : 'not JSON'}; ` +
          `answer fields: ${answer ? keyPaths(answer).join(', ') || 'none' : 'none'}`,
      );
      throw new AgoraError(ERROR_CODES.FORMAT, 'The portal did not encrypt the password', {
        status: response.status,
        step: 'encrypt',
        portalMessage,
      });
    }
    return encrypted;
  }

  async getChildren() {
    if (!this.signedIn) {
      await this.login();
    }
    // The portal pages list the children in the menu of the sign-in answer
    // (`kids/<id>` links): no request of their own when it does.
    if (!ENDPOINTS.children.path && this.menuChildren.length > 0) {
      return this.menuChildren;
    }
    const children = parseChildren(await this.read(ENDPOINTS.children, 'children'));
    return children.length > 0 ? children : this.menuChildren;
  }

  /**
   * @param {string} from first day, `YYYY-MM-DD`
   * @param {string} to last day, `YYYY-MM-DD`
   * @param {Array<object>} [children] see parsePlanning
   */
  async getPlanning(from, to, children = []) {
    if (!this.signedIn) {
      await this.login();
    }
    // The planning is asked for the children it lists, `<person id>$0`.
    const targets =
      children.length > 0 ? children.map((child) => child.target ?? `${child.id}$0`) : this.targets;
    if (targets.length === 0) {
      throw new AgoraError(
        ERROR_CODES.UNMAPPED,
        'Signed in, but the children to ask the planning for are not known yet',
        { step: 'children' },
      );
    }
    const { query, context } = ENDPOINTS.planning;
    const payload = await this.call(ENDPOINTS.planning, {
      query: {
        [query.context]: context,
        [query.targets]: targets.join(','),
        [query.from]: frenchDate(from),
        [query.to]: frenchDate(to),
      },
      step: 'planning',
    });
    return parsePlanning(payload, children);
  }

  async getInvoices() {
    return parseInvoices(await this.read(ENDPOINTS.invoices, 'invoices'));
  }

  /** A read the portal pages make as a POST of a list query (order, page, filter). */
  async read(endpoint, step) {
    return this.call(endpoint, {
      query: endpoint.params,
      body: endpoint.body ? JSON.stringify(endpoint.body) : undefined,
      contentType: endpoint.body ? 'application/json' : undefined,
      read: true,
      step,
    });
  }

  /**
   * One JSON request, signed in first if needed, signed in again once if the
   * session expired on the way.
   */
  async call(endpoint, options) {
    if (!this.signedIn) {
      await this.login();
    }
    if (!endpoint.path) {
      throw new AgoraError(
        ERROR_CODES.UNMAPPED,
        `Signed in, but the portal request for "${options.step}" is not known yet ` +
          '(src/agora/endpoints.js)',
        { step: options.step },
      );
    }
    try {
      return await this.requestJson(endpoint, options);
    } catch (err) {
      if (!(err instanceof SessionExpired)) {
        throw err;
      }
      logger.debug(`Session expired during "${options.step}": signing in again`);
      await this.login();
      try {
        return await this.requestJson(endpoint, options);
      } catch (retryErr) {
        if (retryErr instanceof SessionExpired && retryErr.answer) {
          // Refused again with a fresh session: the portal's own error.
          const portalMessage = this.mask(failureMessage(retryErr.answer) ?? '') || null;
          logger.warn(
            `"${options.step}" refused by the portal: ${this.mask(describeStatus(retryErr.answer))}`,
          );
          throw new AgoraError(
            ERROR_CODES.FORMAT,
            `"${options.step}" refused by the portal${portalMessage ? `: ${portalMessage}` : ''}`,
            { step: options.step, portalMessage },
          );
        }
        if (retryErr instanceof SessionExpired) {
          throw new AgoraError(ERROR_CODES.AUTH, 'The portal keeps answering its login page', {
            step: options.step,
          });
        }
        throw retryErr;
      }
    }
  }

  async requestJson(endpoint, options) {
    const response = await this.send(endpoint, options);
    if (
      response.status === 401 ||
      response.status === 403 ||
      (response.status >= 300 && response.status < 400)
    ) {
      this.signedIn = false;
      throw new SessionExpired();
    }
    if (response.status >= 400) {
      await this.logAnswer(endpoint, response);
      throw new AgoraError(ERROR_CODES.HTTP, `"${options.step}" answered HTTP ${response.status}`, {
        status: response.status,
        step: options.step,
      });
    }
    const contentType = response.headers.get('content-type') ?? '';
    if (contentType.includes('text/html')) {
      // The login page, served in place of the data.
      this.signedIn = false;
      throw new SessionExpired();
    }
    let answer;
    try {
      answer = await readJson(response);
    } catch {
      throw new AgoraError(ERROR_CODES.FORMAT, `"${options.step}" did not answer JSON`, {
        status: response.status,
        step: options.step,
      });
    }
    // The API answers its errors with HTTP 200 and a negative TYPE_RESULT
    // (an expired session among them). Read as data, such an answer was an
    // empty planning: "nothing booked" shown for every child. A read is
    // tried again once with a fresh session.
    if (endpoint.method === 'GET' || options.read) {
      const raw = field(answer, 'type_result');
      const typeResult = Number(raw);
      if (raw !== undefined && raw !== null && raw !== '' && typeResult <= 0) {
        this.signedIn = false;
        throw new SessionExpired(answer);
      }
    }
    return answer;
  }

  async send(endpoint, { query, body, contentType, step }) {
    // The query is written the way the portal pages write it: `$`, `,` and
    // `/` as they are (`targets=1001$0,1002$0&startDate=26/10/2026`).
    const search = Object.entries(query ?? {})
      .map(([name, value]) => `${encodeQuery(name)}=${encodeQuery(value)}`)
      .join('&');
    const url = `${this.base}/${endpoint.path}${search ? `?${search}` : ''}`;
    // The headers the portal pages send: `null` (as text) before the login.
    const headers = {
      accept: 'application/json, text/plain, */*',
      // Node's fetch sends `accept-language: *` and `user-agent: node` by
      // default; the API answered "Exception detected" to the login with
      // them. The language is the one of the portal; the user agent says
      // honestly who is asking.
      'accept-language': ACCEPT_LANGUAGE,
      'user-agent': USER_AGENT,
      session_id: this.sessionId ?? 'null',
      ref_year: this.refYear ?? 'null',
      a_access: API_ACCESS,
    };
    if (this.origin) {
      headers.origin = this.origin;
    }
    if (contentType) {
      headers['content-type'] = contentType;
    }
    if (this.cookies.size > 0) {
      headers.cookie = [...this.cookies].map(([name, value]) => `${name}=${value}`).join('; ');
    }
    logger.debug(`${endpoint.method} ${endpoint.path} (${step})`);
    let response;
    try {
      response = await this.fetch(url, {
        method: endpoint.method,
        headers,
        body: endpoint.method === 'GET' ? undefined : body,
        // A redirect is how an older portal says "sign in": followed, it
        // would look like a successful page.
        redirect: 'manual',
        signal: AbortSignal.timeout(this.timeoutMs),
      });
    } catch (err) {
      throw new AgoraError(
        ERROR_CODES.NETWORK,
        `"${step}": no answer from the portal (${err.cause?.code ?? err.name})`,
        { step },
      );
    }
    this.keepCookies(response);
    return response;
  }

  /**
   * What the portal answered to a request it refused, for the logs: the URL
   * asked, the type and the start of the answer, tags and blanks removed. It
   * is what tells a wrong address (an error page of the server) from wrong
   * field names (a message of the portal) — the only way to adapt
   * src/agora/endpoints.js to a portal nobody documents. The login and the
   * password are masked, in case the page repeats what it was sent.
   */
  async logAnswer(endpoint, response) {
    let excerpt = '';
    try {
      excerpt = (await response.text())
        .replace(/<(script|style)[\s\S]*?<\/\1>/gi, ' ')
        .replace(/<[^>]+>/g, ' ')
        .replace(/\s+/g, ' ')
        .trim();
    } catch {
      // No body to show.
    }
    excerpt = this.mask(excerpt);
    logger.warn(
      `${endpoint.method} ${this.base}/${endpoint.path} -> HTTP ${response.status} ` +
        `(${response.headers.get('content-type') ?? 'no content type'}): ` +
        `${excerpt.slice(0, 300) || '(empty answer)'}`,
    );
  }

  /**
   * What was sent, without sending it to the logs: lengths, and whether the
   * values carry spaces at their ends or look like a mask (`****`). Enough
   * to see a password Gladys did not hand over, nothing to sign in with.
   */
  describeCredentials() {
    const describe = (value) =>
      `${value.length} characters` +
      (value !== value.trim() ? ', spaces at the ends' : '') +
      (/^[*•●]+$/.test(value) ? ', looks masked' : '');
    return `login: ${describe(this.username)}, password: ${describe(this.password)}`;
  }

  /** A text with the login and the password replaced by `***`. */
  mask(text) {
    let masked = String(text);
    for (const secret of [this.encryptedPassword, this.password, this.username]) {
      if (secret) {
        masked = masked.split(secret).join('***');
      }
    }
    return masked;
  }

  keepCookies(response) {
    const lines =
      typeof response.headers.getSetCookie === 'function'
        ? response.headers.getSetCookie()
        : [response.headers.get('set-cookie')].filter(Boolean);
    for (const line of lines) {
      const [pair, ...attributes] = line.split(';');
      const separator = pair.indexOf('=');
      if (separator <= 0) {
        continue;
      }
      const name = pair.slice(0, separator).trim();
      const value = pair.slice(separator + 1).trim();
      const expired = attributes.some((attribute) =>
        /^\s*max-age\s*=\s*(0|-\d+)\s*$/i.test(attribute),
      );
      if (expired || value === '') {
        this.cookies.delete(name);
      } else {
        this.cookies.set(name, value);
      }
    }
  }
}

async function readJson(response) {
  const text = await response.text();
  return JSON.parse(text);
}

/**
 * `{ success: false }`, `{ ERREUR: "…" }`, `{ status: "KO" }`: the portal said
 * no. Field names are compared whatever their case: the API writes them in
 * capitals (`LOGIN`, `PASSWORD`).
 */
function isFailure(answer) {
  if (!answer || typeof answer !== 'object' || Array.isArray(answer)) {
    return false;
  }
  const value = (name) => field(answer, name);
  // The API says how it went in TYPE_RESULT, and the portal's own code
  // reads nothing else: positive went well, 0 or negative did not. Its
  // successful sign-in carries an empty ERROR object, which the checks below
  // took for a refusal.
  const typeResult = Number(value('type_result'));
  if (
    value('type_result') !== undefined &&
    value('type_result') !== null &&
    Number.isFinite(typeResult)
  ) {
    return typeResult <= 0;
  }
  if ([value('success'), value('ok'), value('result')].includes(false)) {
    return true;
  }
  const status = value('status');
  if (typeof status === 'string' && /^(ko|error|erreur)$/i.test(status)) {
    return true;
  }
  return [value('erreur'), value('error'), value('errormessage')].some(isSaid);
}

/** An error worth the name: a text, or an object carrying one (not `{}`). */
function isSaid(error) {
  if (error === null || error === undefined || error === '' || error === false) {
    return false;
  }
  if (typeof error === 'object') {
    return Object.values(error).some(
      (part) => part !== null && part !== undefined && part !== '' && typeof part !== 'object',
    );
  }
  return true;
}

function failureMessage(answer) {
  // The API nests it: `{ ERROR: { ID, MESSAGE }, TYPE_RESULT: -2 }`.
  const error = field(answer, 'error');
  const message =
    field(answer, 'message') ??
    field(answer, 'erreur') ??
    (error && typeof error === 'object' ? field(error, 'message') : error) ??
    field(answer, 'errormessage');
  return typeof message === 'string' && message.trim() ? message.trim().slice(0, 200) : null;
}

/** The fields of an answer that say how it went, with their values. */
const STATUS_FIELDS =
  /^(success|ok|result|status|type_?result|error|erreur|errormessage|message|code)$/i;

function describeStatus(answer, prefix = '', depth = 0) {
  const parts = [];
  for (const [key, value] of Object.entries(answer)) {
    if (!STATUS_FIELDS.test(key) && !/^id$/i.test(key)) {
      continue;
    }
    if (value === null || typeof value !== 'object') {
      if (prefix || !/^id$/i.test(key)) {
        parts.push(`${prefix}${key}=${JSON.stringify(value)?.slice(0, 200)}`);
      }
    } else if (!Array.isArray(value) && depth === 0) {
      // `ERROR: { ID, MESSAGE }`: what the portal says is one level down.
      parts.push(describeStatus(value, `${key}.`, depth + 1));
    }
  }
  return parts.filter(Boolean).join(', ') || (depth === 0 ? 'no status field' : '');
}

/** A top-level field of an object, whatever the case of its name. */
function field(object, name) {
  if (!object || typeof object !== 'object') {
    return undefined;
  }
  const key = Object.keys(object).find((candidate) => candidate.toLowerCase() === name);
  return key === undefined ? undefined : object[key];
}

/** The first non-empty scalar under a key matching `pattern`, at any depth. */
function findValue(node, pattern, depth = 0) {
  if (!node || typeof node !== 'object' || depth > 4) {
    return null;
  }
  for (const [key, value] of Object.entries(node)) {
    if (pattern.test(key) && ['string', 'number'].includes(typeof value) && value !== '') {
      return String(value);
    }
  }
  for (const value of Object.values(node)) {
    const found = findValue(value, pattern, depth + 1);
    if (found !== null) {
      return found;
    }
  }
  return null;
}

/** The field names of an answer (`A`, `B.C`, `D[].E`), at most 40 of them. */
function keyPaths(node, prefix = '', depth = 0, paths = []) {
  if (depth > 3 || paths.length >= 40) {
    return paths;
  }
  if (Array.isArray(node)) {
    if (node.length > 0) {
      keyPaths(node[0], `${prefix}[]`, depth + 1, paths);
    }
    return paths;
  }
  if (node && typeof node === 'object') {
    for (const [key, value] of Object.entries(node)) {
      const path = prefix ? `${prefix}.${key}` : key;
      if (value && typeof value === 'object') {
        keyPaths(value, path, depth + 1, paths);
      } else if (paths.length < 40) {
        paths.push(path);
      }
    }
  }
  return paths;
}

function encodeQuery(value) {
  return encodeURIComponent(String(value))
    .replace(/%24/g, '$')
    .replace(/%2C/g, ',')
    .replace(/%2F/g, '/');
}

/**
 * The children of the menu of the sign-in answer. The portal pages build
 * their menu from `DATA.MENUS[].MENU_ITEMS[].PAGES[]`, each with a `NAME`
 * and an `HREF`; a child's page is the `kids/<id>` route (pck_home's
 * kids_controller reads `$routeParams.idKid`).
 *
 * @returns {Array<{id: string, firstName: string, lastName: null, name: string}>}
 */
export function childrenOfMenus(answer) {
  const children = [];
  const visit = (node, depth) => {
    if (!node || typeof node !== 'object' || depth > 6) {
      return;
    }
    if (Array.isArray(node)) {
      node.forEach((child) => visit(child, depth + 1));
      return;
    }
    const href = field(node, 'href');
    const name = field(node, 'name');
    const match = typeof href === 'string' ? /(?:^|[#/])kids\/(\d+)/i.exec(href) : null;
    if (match && typeof name === 'string' && name.trim()) {
      if (!children.some((child) => child.id === match[1])) {
        const firstName = name.trim();
        children.push({ id: match[1], firstName, lastName: null, name: firstName });
      }
    }
    Object.values(node).forEach((child) => visit(child, depth + 1));
  };
  visit(field(answer, 'data'), 0);
  return children;
}

/** Every `<id>$<n>` value of an answer, once each: the targets of the planning. */
function collectTargets(node, found = new Set(), depth = 0) {
  if (depth > 5 || node === null || node === undefined) {
    return [...found];
  }
  if (typeof node === 'string' && /^\d+\$\d+$/.test(node.trim())) {
    found.add(node.trim());
  } else if (typeof node === 'object') {
    for (const value of Object.values(node)) {
      collectTargets(value, found, depth + 1);
    }
  }
  return [...found];
}

/**
 * The password the way the portal pages send it. `base64` is the browser's
 * `btoa()`, which encodes each character as one Latin-1 byte: `Buffer`'s
 * `latin1` does exactly that, `utf8` would not for an accented password.
 */
export function encodePassword(password, encoding) {
  if (encoding === 'base64') {
    return Buffer.from(password, 'latin1').toString('base64');
  }
  return password;
}

/** `2026-11-05` → `05/11/2026`, the way the portal's forms write a day. */
export function frenchDate(day) {
  const [year, month, date] = day.split('-');
  return `${date}/${month}/${year}`;
}
