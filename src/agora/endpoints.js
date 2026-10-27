// -----------------------------------------------------------------------------
// The requests of the Agora Famille portal the integration makes.
//
// Agora Plus publishes no API for its family portal: these are the requests
// the portal's own pages make. The pages live on
// `https://portalssl.agoraplus.fr/<commune>/`, and fetch their data from the
// API of the municipality, `https://<commune>.agoraplus.fr/InternalApi/…`, in
// JSON, the session travelling in a `session_id` header. Paths below are
// relative to that API.
//
// They live here, and only here, so that adapting the integration to a portal
// update is a change to this file alone (src/agora/parse.js reads the answers
// tolerantly, whatever the field names).
//
// A request whose `path` is `null` is not known yet: it was not captured from
// a real session. The integration signs in, then says which one is missing
// instead of guessing an address. To capture one: open the portal in a
// browser, developer tools (F12), Network tab, "Fetch/XHR" filter, sign in
// and visit the page; right-click the request, "Copy as cURL".
// -----------------------------------------------------------------------------

/** Sent in the `a_access` header of every request, as the portal pages do. */
export const API_ACCESS = 'agora';

export const ENDPOINTS = {
  /**
   * Sign in. Captured from the portal (October 2026):
   * POST /InternalApi/API_DASHBOARD/authentication, JSON {"LOGIN", "PASSWORD"},
   * headers `session_id: null`, `ref_year: null`, `a_access: agora`.
   */
  // The answer carries the session in `DATA.session`: `session_id` goes
  // back in the `session_id` header, `school_year` in `ref_year`
  // (`setSessionDataAndRedirect` of the portal's code).
  login: {
    method: 'POST',
    path: 'InternalApi/API_DASHBOARD/authentication',
    // PASSWORD is the password as `encryptPassword` (below) gave it back,
    // never as typed: sent as typed, the API answers "Exception detected".
    fields: { username: 'LOGIN', password: 'PASSWORD' },
  },
  /**
   * First step of the sign-in, read in the portal's code (October 2026,
   * `pck_home.home_login_service`): `HomeLoginService.encryptPassword` posts
   * `{ text: btoa(password) }` to API_DASHBOARD/encryptText, and the API
   * answers the encrypted password in `DATA` (`TYPE_RESULT: 1`), which
   * `login` then sends.
   */
  encryptPassword: {
    method: 'POST',
    path: 'InternalApi/API_DASHBOARD/encryptText',
    field: 'text',
    passwordEncoding: 'base64',
  },
  /**
   * The children of the family, as the reservation calendar lists them
   * (pck_calendar_comp.agoraplus_calendar_service.getTargets, October 2026):
   * GET /InternalApi/API_CALENDAR_COMPONENT/target/?idContext=1&idFamily=
   * Answers `{ DATA: { TARGETS: [{ ID: "<id>$0", NAME, LAST_NAME,
   * HAS_SCHOOL_REG, IS_ACTIVE }] } }`. When it gives nothing, the children
   * are read in the menu of the sign-in answer (`kids/<id>` links).
   */
  children: {
    method: 'GET',
    path: 'InternalApi/API_CALENDAR_COMPONENT/target/',
    params: { idContext: '1', idFamily: '' },
  },
  /**
   * The planning of the children over a window of days. Captured from the
   * portal (October 2026):
   * GET /InternalApi/API_CALENDAR_COMPONENT/events/?idContext=1
   *     &targets=1001$0,1002$0&startDate=26/10/2026&endDate=01/11/2026
   * `targets` are the children (`<person id>$0`), dates are dd/mm/yyyy.
   * Answers `{ DATA: { EVENTS: [...] } }` (see src/agora/parse.js).
   */
  planning: {
    method: 'GET',
    path: 'InternalApi/API_CALENDAR_COMPONENT/events/',
    query: { context: 'idContext', targets: 'targets', from: 'startDate', to: 'endDate' },
    context: '1',
  },
  /**
   * The invoices, paid and to pay. Captured from the portal (October 2026):
   * GET /InternalApi/API_DASHBOARD/invoicesAgpGrid?state=all
   * Answers `{ DATA: { count, data: [{ idInvoice, FACT_DESC, total,
   * TOTAL_PAID, limitDatePayment, STATUS }] } }` (see src/agora/parse.js).
   */
  // The portal's code (pck_transversal_objects.pay_invoices_comp_service)
  // POSTs it, with the list query of its invoice grid.
  invoices: {
    method: 'POST',
    path: 'InternalApi/API_DASHBOARD/invoicesAgpGrid',
    params: { state: 'all' },
    body: { order: 'ID_INVOICE DESC', limit: 20, page: 1, filter: '%' },
  },
};

/** The portal pages a person opens, for the links of the events and the docs. */
export const PAGES = {
  home: 'pck_home.home_view#/',
};
