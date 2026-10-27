import { after, before, test } from 'node:test';
import assert from 'node:assert/strict';
import {
  AgoraClient,
  ERROR_CODES,
  childrenOfMenus,
  encodePassword,
  frenchDate,
} from '../src/agora/client.js';
import { ENDPOINTS } from '../src/agora/endpoints.js';
import { BASE, createFakePortal, useTestPaths } from './helpers/fakePortal.js';

let restorePaths;
before(() => {
  restorePaths = useTestPaths();
});
after(() => restorePaths());

/** A fetch answering `answer()` to everything but the password encryption. */
function passEncryption(portal, answer) {
  return async (url, options) =>
    String(url).endsWith(ENDPOINTS.encryptPassword.path) ? portal.fetch(url, options) : answer();
}

function clientFor(portal, overrides = {}) {
  return new AgoraClient({
    apiBase: BASE,
    origin: 'https://portalssl.agoraplus.fr',
    username: portal.username,
    password: portal.password,
    fetch: portal.fetch,
    ...overrides,
  });
}

test('signs in once, the way the portal pages do, then sends the session id', async () => {
  const portal = createFakePortal();
  const client = clientFor(portal);

  const children = await client.getChildren();
  await client.getInvoices();

  assert.deepEqual(
    children.map((child) => child.name),
    ['Léa', 'Tom'],
  );
  const logins = portal.requests.filter((request) => request.path === ENDPOINTS.login.path);
  assert.equal(logins.length, 1);
  const [encrypt, login] = portal.requests;
  assert.equal(encrypt.method, 'POST');
  assert.equal(encrypt.path, ENDPOINTS.encryptPassword.path);
  // `btoa('s3cret')`, as the portal pages send it.
  assert.equal(encrypt.path, 'InternalApi/API_DASHBOARD/encryptText');
  assert.deepEqual(JSON.parse(encrypt.body), { text: 'czNjcmV0' });
  assert.equal(login.method, 'POST');
  assert.equal(login.path, 'InternalApi/API_DASHBOARD/authentication');
  // The password as the API encrypted it, never as typed.
  assert.deepEqual(JSON.parse(login.body), { LOGIN: portal.username, PASSWORD: 'enc(s3cret)' });
  assert.equal(login.headers['content-type'], 'application/json');
  assert.equal(login.headers.session_id, 'null');
  assert.equal(login.headers.ref_year, 'null');
  assert.equal(login.headers.a_access, 'agora');
  assert.equal(login.headers.origin, 'https://portalssl.agoraplus.fr');
  assert.equal(portal.requests.at(-1).headers.session_id, 's1');
  assert.equal(portal.requests.at(-1).headers.ref_year, '2026');
});

test('an expired session is renewed once, transparently', async () => {
  const portal = createFakePortal();
  const client = clientFor(portal);
  await client.getChildren();

  portal.expireSessions();
  const children = await client.getChildren();

  assert.equal(children.length, 2);
  assert.equal(portal.requests.filter((r) => r.path === ENDPOINTS.login.path).length, 2);
});

test('a refused login says why in the logs, secrets masked', async (t) => {
  const portal = createFakePortal();
  const client = clientFor(portal, { password: 'wrong' });
  const lines = [];
  t.mock.method(console, 'error', (...args) => lines.push(args.join(' ')));
  const level = process.env.LOG_LEVEL;
  process.env.LOG_LEVEL = 'info';
  t.after(() => {
    if (level === undefined) {
      delete process.env.LOG_LEVEL;
    } else {
      process.env.LOG_LEVEL = level;
    }
  });
  await assert.rejects(client.getChildren(), { code: ERROR_CODES.AUTH });
  const line = lines.find((entry) => entry.includes('Login refused'));
  assert.match(
    line,
    /TYPE_RESULT=-2, ERROR\.ID=12, ERROR\.MESSAGE="Identifiant ou mot de passe incorrect"|ERROR\.ID=12, ERROR\.MESSAGE="Identifiant ou mot de passe incorrect", TYPE_RESULT=-2/,
  );
  assert.match(line, /login: 18 characters, password: 5 characters/);
  assert.ok(!line.includes('wrong'));
});

test('wrong credentials are an auth error, without retrying forever', async () => {
  const portal = createFakePortal();
  const client = clientFor(portal, { password: 'wrong' });

  await assert.rejects(client.getChildren(), (err) => {
    assert.equal(err.code, ERROR_CODES.AUTH);
    assert.equal(err.step, 'login');
    // The password is in no error message.
    assert.ok(!err.message.includes('wrong'));
    return true;
  });
  // The encryption, then the refused login: no retry.
  assert.equal(portal.requests.length, 2);
});

test('a portal that does not answer is a network error', async () => {
  const portal = createFakePortal({ down: true });
  await assert.rejects(clientFor(portal).getChildren(), { code: ERROR_CODES.NETWORK });
});

test('a missing module is an HTTP error with its status', async () => {
  const portal = createFakePortal({ missing: new Set(['invoices']) });
  await assert.rejects(clientFor(portal).getInvoices(), {
    code: ERROR_CODES.HTTP,
    status: 404,
    step: 'invoices',
  });
});

test('nothing is asked of the portal without credentials', async () => {
  const portal = createFakePortal();
  await assert.rejects(clientFor(portal, { password: '' }).getChildren(), {
    code: ERROR_CODES.CONFIG,
  });
  assert.equal(portal.requests.length, 0);
});

test('the planning is asked the way the portal pages ask it', async () => {
  const portal = createFakePortal();
  await clientFor(portal).getPlanning('2026-11-04', '2026-11-18');
  const request = portal.requests.find((r) => r.path === ENDPOINTS.planning.path);
  assert.equal(request.path, 'InternalApi/API_CALENDAR_COMPONENT/events/');
  // The children come from the login answer here: no children list given.
  assert.deepEqual(request.query, {
    idContext: '1',
    targets: '101$0,102$0',
    startDate: '04/11/2026',
    endDate: '18/11/2026',
  });
  assert.match(request.url, /targets=101\$0,102\$0&startDate=04\/11\/2026&/);
  assert.equal(frenchDate('2026-01-09'), '09/01/2026');
});

test("the children are the calendar's targets", async () => {
  const portal = createFakePortal();
  const client = clientFor(portal);
  const children = await client.getChildren();
  assert.deepEqual(children, [
    { id: '101', firstName: 'Léa', lastName: 'Martin', name: 'Léa', target: '101$0' },
    { id: '102', firstName: 'Tom', lastName: 'Martin', name: 'Tom', target: '102$0' },
  ]);
  assert.equal(
    portal.requests.at(-1).url,
    `${BASE}/InternalApi/API_CALENDAR_COMPONENT/target/?idContext=1&idFamily=`,
  );
});

test('a refused login logs what the portal answered, secrets masked', async (t) => {
  const portal = createFakePortal();
  const client = clientFor(portal);
  client.fetch = passEncryption(
    portal,
    () =>
      new Response(
        `<html><body><h1>Bad Request</h1><p>p_login=${portal.username} p_password=${portal.password}</p></body></html>`,
        { status: 400, headers: { 'content-type': 'text/html' } },
      ),
  );
  const lines = [];
  t.mock.method(console, 'error', (...args) => lines.push(args.join(' ')));
  // Whatever level the test run was started with, warnings are shown.
  const level = process.env.LOG_LEVEL;
  process.env.LOG_LEVEL = 'info';
  t.after(() => {
    if (level === undefined) {
      delete process.env.LOG_LEVEL;
    } else {
      process.env.LOG_LEVEL = level;
    }
  });

  await assert.rejects(client.getChildren(), { code: ERROR_CODES.HTTP, status: 400 });

  const line = lines.find((entry) => entry.includes('HTTP 400'));
  assert.ok(line, 'the answer is logged');
  assert.match(line, new RegExp(`POST ${BASE}/${ENDPOINTS.login.path}`));
  assert.match(line, /Bad Request p_login=\*\*\* p_password=\*\*\*/);
  assert.ok(!line.includes(portal.password) && !line.includes(portal.username));
});

test('a request not captured yet is said as such, after a successful sign-in', async (t) => {
  // No menu to read the children from either.
  const portal = createFakePortal({ noMenu: true });
  const client = clientFor(portal);
  const path = ENDPOINTS.children.path;
  ENDPOINTS.children.path = null;
  t.after(() => {
    ENDPOINTS.children.path = path;
  });
  await assert.rejects(client.getChildren(), { code: ERROR_CODES.UNMAPPED, step: 'children' });
  assert.equal(client.signedIn, true);
  assert.equal(portal.requests.length, 2);
});

test('a login answer without a session names its fields, not their values', async () => {
  const portal = createFakePortal();
  const client = clientFor(portal);
  client.fetch = passEncryption(
    portal,
    () =>
      new Response(JSON.stringify({ RESULT: { NOM: 'Martin', CODE: 'secret-value' } }), {
        headers: { 'content-type': 'application/json' },
      }),
  );
  await assert.rejects(client.getChildren(), (err) => {
    assert.equal(err.code, ERROR_CODES.FORMAT);
    assert.match(err.message, /fields: RESULT\.NOM, RESULT\.CODE/);
    assert.ok(!err.message.includes('secret-value') && !err.message.includes('Martin'));
    return true;
  });
});

test('the invoices are asked the way the portal pages ask them', async () => {
  const portal = createFakePortal();
  await clientFor(portal).getInvoices();
  const request = portal.requests.at(-1);
  assert.equal(request.url, `${BASE}/InternalApi/API_DASHBOARD/invoicesAgpGrid?state=all`);
  // A POST of the grid's list query, as in the portal's code.
  assert.equal(request.method, 'POST');
  assert.deepEqual(JSON.parse(request.body), {
    order: 'ID_INVOICE DESC',
    limit: 20,
    page: 1,
    filter: '%',
  });
  assert.equal(request.headers.session_id, 's1');
});

test('the requests carry a French language and name the integration', async () => {
  const portal = createFakePortal();
  await clientFor(portal).getInvoices();
  for (const request of portal.requests) {
    assert.equal(request.headers['accept-language'], 'fr-FR,fr;q=0.9');
    assert.match(request.headers['user-agent'], /^gladys-calendar-agorafamille /);
  }
});

test('an exception of the portal is not called a wrong password', async () => {
  const portal = createFakePortal();
  const client = clientFor(portal);
  client.fetch = passEncryption(
    portal,
    () =>
      new Response(
        JSON.stringify({
          DATA: null,
          ERROR: { ID: '1', MESSAGE: 'Exception detected' },
          TYPE_RESULT: -2,
        }),
        { headers: { 'content-type': 'application/json' } },
      ),
  );
  await assert.rejects(client.getChildren(), {
    code: ERROR_CODES.FORMAT,
    step: 'login',
    portalMessage: 'Exception detected',
  });
});

test("the password is encoded like the browser's btoa, accents included", () => {
  assert.equal(encodePassword('s3cret', 'base64'), 'czNjcmV0');
  // btoa('Été2026!') in a browser.
  assert.equal(encodePassword('Été2026!', 'base64'), 'yXTpMjAyNiE=');
  assert.equal(encodePassword('s3cret', undefined), 's3cret');
});

test('without the encryption request, the sign-in says which request is missing', async (t) => {
  const portal = createFakePortal();
  const path = ENDPOINTS.encryptPassword.path;
  ENDPOINTS.encryptPassword.path = null;
  t.after(() => {
    ENDPOINTS.encryptPassword.path = path;
  });
  await assert.rejects(clientFor(portal).getChildren(), {
    code: ERROR_CODES.UNMAPPED,
    step: 'encrypt',
  });
  assert.equal(portal.requests.length, 0);
});

test('a staff account (USER_TYPE_ID 1) is turned away like the portal does', async () => {
  const portal = createFakePortal({ userType: 1 });
  await assert.rejects(clientFor(portal).getChildren(), {
    code: ERROR_CODES.AUTH,
    message: 'This account is not a family account',
  });
});

test('a read answered with a negative TYPE_RESULT signs in again, never reads as empty', async () => {
  const portal = createFakePortal({
    invoices: [{ numFacture: 'F1', libelle: 'Octobre', montant: 10 }],
  });
  const client = clientFor(portal);
  await client.getChildren();
  portal.failReads = 1;
  const invoices = await client.getInvoices();
  assert.equal(invoices.length, 1);
  assert.equal(portal.requests.filter((r) => r.path === ENDPOINTS.login.path).length, 2);
});

test("a read refused again after a fresh sign-in is the portal's error", async () => {
  const portal = createFakePortal();
  const client = clientFor(portal);
  await client.getChildren();
  portal.failReads = 5;
  await assert.rejects(client.getInvoices(), {
    code: ERROR_CODES.FORMAT,
    step: 'invoices',
    portalMessage: 'Session invalide',
  });
});

test('the children come from the menu of the sign-in answer', async (t) => {
  const portal = createFakePortal();
  const client = clientFor(portal);
  const path = ENDPOINTS.children.path;
  ENDPOINTS.children.path = null;
  t.after(() => {
    ENDPOINTS.children.path = path;
  });
  const children = await client.getChildren();
  assert.deepEqual(
    children.map((child) => [child.id, child.name]),
    [
      ['101', 'Léa'],
      ['102', 'Tom'],
    ],
  );
  // Only the two sign-in requests: no request for the children.
  assert.equal(portal.requests.length, 2);
});

test('only kids/<id> menu entries are children', () => {
  const answer = {
    DATA: {
      MENUS: [
        {
          MENU_ITEMS: [
            { NAME: 'Factures', HREF: 'client_home_view$#/invoices', PAGES: [] },
            { NAME: 'Inès', HREF: 'client_home_view$#/kids/77', PAGES: [] },
            { NAME: 'Inès', HREF: 'client_home_view$#/kids/77', PAGES: [] },
          ],
        },
      ],
    },
  };
  assert.deepEqual(childrenOfMenus(answer), [
    { id: '77', firstName: 'Inès', lastName: null, name: 'Inès' },
  ]);
  assert.deepEqual(childrenOfMenus({ DATA: null }), []);
});

test('a successful sign-in with an empty ERROR is a success (as the portal answers it)', async () => {
  const portal = createFakePortal();
  const client = clientFor(portal);
  const original = portal.fetch;
  client.fetch = async (url, options) => {
    const response = await original(url, options);
    if (!String(url).endsWith(ENDPOINTS.login.path)) {
      return response;
    }
    // The real answer, October 2026: TYPE_RESULT "1" (a string) and ERROR {}.
    const answer = await response.json();
    return new Response(JSON.stringify({ ...answer, TYPE_RESULT: '1', ERROR: {} }), {
      headers: { 'content-type': 'application/json' },
    });
  };
  const children = await client.getChildren();
  assert.equal(client.signedIn, true);
  assert.equal(children.length, 2);
});

test('TYPE_RESULT 0 with "Exception detected" is a failure of the portal', async () => {
  const portal = createFakePortal();
  const client = clientFor(portal);
  client.fetch = passEncryption(
    portal,
    () =>
      new Response(
        JSON.stringify({
          DATA: null,
          TYPE_RESULT: '0',
          ERROR: { ID: '-2', MESSAGE: 'Exception detected' },
        }),
        { headers: { 'content-type': 'application/json' } },
      ),
  );
  await assert.rejects(client.getChildren(), { code: ERROR_CODES.FORMAT, step: 'login' });
});
