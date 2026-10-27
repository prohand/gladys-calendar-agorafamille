// -----------------------------------------------------------------------------
// Configuration, on two levels.
//
// - The integration's own settings (`config_schema` of the manifest), set once
//   by an administrator: how often and how far the portal is read, what goes
//   into the calendars. The SDK fetches them (`gladys.getConfig()`) and
//   notifies every change (`gladys.onConfigUpdated()`).
// - Each user's account (`account_schema`): the portal of their municipality,
//   their login and password. A calendar is personal data: every Gladys user
//   enables the integration for themselves, with their own account
//   (`gladys.getCalendarAccounts()`).
//
// This module provides the defaults and normalizes both, so the rest of the
// code never deals with `undefined`, a number typed as a string or a portal
// address pasted in one of the many shapes users copy it in.
// -----------------------------------------------------------------------------

import { createHash } from 'node:crypto';
import { parseInvoiceNumbers } from './agora/parse.js';

// Defaults: they MUST stay consistent with the `default` values declared in the
// `config_schema` of the manifest (test/manifest.test.js checks it).
export const DEFAULT_CONFIG = {
  refresh_minutes: 60, // minutes between two reads of the portal
  days_ahead: 30, // how many days ahead go into the calendars
  days_back: 7, // how many past days are kept up to date
  full_day_events: false, // whole-day events instead of the portal's hours
  show_invoices: true, // a calendar of the invoices to pay, on their due date
  debug_logs: false, // raise the log level to debug, from the Configuration screen
};

/** The keys of the per-user account form (`account_schema` of the manifest). */
export const ACCOUNT_KEYS = ['portal_url', 'username', 'password', 'treasury_invoices'];

/** The portal never moves faster than this: a family checks it a few times a day. */
export const MIN_REFRESH_MINUTES = 15;
export const MAX_REFRESH_MINUTES = 1440;
export const MAX_DAYS_AHEAD = 90;
export const MAX_DAYS_BACK = 31;

/** Where every Agora Famille portal lives, one path per municipality. */
export const AGORA_HOST = 'https://portalssl.agoraplus.fr';

/** The domain of the API, one sub-domain per municipality: `<commune>.agoraplus.fr`. */
export const AGORA_DOMAIN = 'agoraplus.fr';

/**
 * Merge the integration settings with the defaults.
 *
 * @param {Record<string, unknown>} raw config returned by the SDK
 */
export function normalizeConfig(raw = {}) {
  return {
    ...DEFAULT_CONFIG,
    ...raw,
    refresh_minutes: clampInteger(
      raw.refresh_minutes,
      DEFAULT_CONFIG.refresh_minutes,
      MIN_REFRESH_MINUTES,
      MAX_REFRESH_MINUTES,
    ),
    days_ahead: clampInteger(raw.days_ahead, DEFAULT_CONFIG.days_ahead, 1, MAX_DAYS_AHEAD),
    days_back: clampInteger(raw.days_back, DEFAULT_CONFIG.days_back, 0, MAX_DAYS_BACK),
    full_day_events: toBoolean(raw.full_day_events, DEFAULT_CONFIG.full_day_events),
    show_invoices: toBoolean(raw.show_invoices, DEFAULT_CONFIG.show_invoices),
    debug_logs: toBoolean(raw.debug_logs, DEFAULT_CONFIG.debug_logs),
  };
}

/**
 * One user's account, from their `account_schema` values.
 *
 * @param {Record<string, unknown>} raw
 */
export function normalizeAccount(raw = {}) {
  const account = {
    username: String(raw.username ?? '').trim(),
    // Not trimmed: a password may end with a space, and it is the user's.
    password: String(raw.password ?? ''),
    // The invoices the municipality sent to the Trésor public: the portal
    // shows them unpaid forever, they stay out of the invoices calendar.
    treasuryInvoices: parseInvoiceNumbers(raw.treasury_invoices),
  };
  const portal = parsePortalUrl(raw.portal_url);
  account.portal_url = portal?.url ?? '';
  account.portalBase = portal?.base ?? null;
  account.apiBase = portal?.apiBase ?? null;
  account.commune = portal?.commune ?? null;
  account.configured = Boolean(account.apiBase && account.username && account.password);
  // What the calendar ids hang on: the commune and the login, hashed so the
  // e-mail address never ends up in a Gladys external id.
  account.accountId = account.configured
    ? `${account.commune}-${hash(account.username.toLowerCase())}`
    : null;
  return account;
}

/**
 * The portal of one municipality, from what the user pasted.
 *
 * Accepted, all of them seen in municipal guides and browser bars:
 *   lognes
 *   portalssl.agoraplus.fr/lognes
 *   https://portalssl.agoraplus.fr/lognes/pck_home.home_view#/
 *   https://lognes.agoraplus.fr  (the address of the API itself)
 *   https://famille.ma-ville.fr/agora  (a municipality behind its own name)
 *
 * Two addresses come out of it. The pages a person opens live under
 * `portalssl.agoraplus.fr/<commune>`; the pages fetch their data from the API
 * of the municipality, `https://<commune>.agoraplus.fr/InternalApi/…` — that
 * one is what the integration talks to.
 *
 * @returns {{url: string, base: string, apiBase: string, commune: string}|null}
 */
export function parsePortalUrl(value) {
  const text = String(value ?? '').trim();
  if (!text) {
    return null;
  }
  // A bare name is the path of the municipality on the shared host.
  if (/^[a-z0-9][a-z0-9_-]*$/i.test(text)) {
    return agoraPortal(text.toLowerCase());
  }
  let url;
  try {
    url = new URL(/^[a-z]+:\/\//i.test(text) ? text : `https://${text}`);
  } catch {
    return null;
  }
  if (url.protocol !== 'https:' && url.protocol !== 'http:') {
    return null;
  }
  const host = url.hostname.toLowerCase();
  const segments = url.pathname
    .split('/')
    .filter(Boolean)
    // `pck_home.home_view`, `InternalApi` and their siblings are pages, not
    // the municipality.
    .filter(
      (segment) =>
        !/^pck_/i.test(segment) && !segment.includes('.') && !/^internalapi$/i.test(segment),
    );
  // The API address itself: the municipality is its sub-domain.
  const subdomain = new RegExp(`^([a-z0-9-]+)\\.${AGORA_DOMAIN.replace('.', '\\.')}$`).exec(host);
  if (subdomain && subdomain[1] !== 'portalssl' && subdomain[1] !== 'www') {
    return agoraPortal(subdomain[1]);
  }
  if (segments.length === 0) {
    return null;
  }
  const commune = segments[segments.length - 1].toLowerCase();
  if (host === new URL(AGORA_HOST).hostname) {
    return agoraPortal(commune);
  }
  // A municipality behind its own name: pages and API on the same host. The
  // portal speaks HTTPS only, and the password goes through it: an http://
  // link copied from an old guide is upgraded rather than followed.
  const base = `https://${url.host}/${segments.join('/')}`;
  return { url: base, base, apiBase: `https://${url.host}`, commune };
}

function agoraPortal(commune) {
  const base = `${AGORA_HOST}/${commune}`;
  return { url: base, base, apiBase: `https://${commune}.${AGORA_DOMAIN}`, commune };
}

function hash(text) {
  return createHash('sha256').update(text).digest('hex').slice(0, 12);
}

function clampInteger(value, fallback, min, max) {
  if (value === undefined || value === null || String(value).trim() === '') {
    return fallback;
  }
  const number = Number(value);
  if (!Number.isFinite(number)) {
    return fallback;
  }
  return Math.max(min, Math.min(max, Math.round(number)));
}

function toBoolean(value, fallback) {
  if (value === undefined || value === null || value === '') {
    return fallback;
  }
  if (typeof value === 'boolean') {
    return value;
  }
  return ['1', 'true', 'yes', 'on'].includes(String(value).trim().toLowerCase());
}
