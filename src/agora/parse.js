// -----------------------------------------------------------------------------
// What the portal answers, turned into the few shapes the integration uses.
//
// Agora Famille publishes no API contract: the answers below are those of the
// portal's own web pages, and they differ from one municipality (and one
// version of the portal) to the next — `prenom` here, `firstName` there, a
// list at the root or under `data`, a date as `05/11/2026` or as an ISO string.
// So every reader is tolerant: it looks for each value under the names it is
// known by, and drops an entry it cannot read instead of guessing. A wrong
// guess is worse than a missing entry: it shows the wrong lunch, or announces
// an invoice that does not exist.
//
// Adding a spelling a portal uses is a one-word change in the lists below.
// Names are matched whatever their case: the API of the portal writes them in
// capitals (`DATA.EVENTS`, `START_DATE_TIME`), older pages in camelCase.
// -----------------------------------------------------------------------------

import { parseDay, parseTime } from './dates.js';

/** The reservation states of a day of activity, as the integration names them. */
export const RESERVATION_STATUS = {
  /** Registered for the activity over the period, but this day is not booked. */
  REGISTERED: 'registered',
  /** The family asked for the day; the municipality has not answered yet. */
  REQUESTED: 'requested',
  /** The child is expected: booked and accepted. */
  RESERVED: 'reserved',
  /** The family asked to cancel the day; not answered yet. */
  ABSENCE_REQUESTED: 'absence_requested',
  /** The day is cancelled. */
  ABSENT: 'absent',
  /** The municipality refused the request. */
  REFUSED: 'refused',
};

/** The states in which the child is expected at the activity. */
export const EXPECTED_STATUSES = [RESERVATION_STATUS.RESERVED, RESERVATION_STATUS.REQUESTED];

const LIST_KEYS = ['data', 'result', 'results', 'items', 'liste', 'list', 'rows', 'content'];

const CHILD_LIST_KEYS = ['TARGETS', 'enfants', 'children', 'lstEnfants', 'listeEnfants', 'membres'];
const PLANNING_LIST_KEYS = ['events', 'planning', 'reservations', 'presences', 'jours'];
const INVOICE_LIST_KEYS = ['factures', 'invoices', 'lstFactures', 'listeFactures'];

const FIELDS = {
  childId: ['idEnfant', 'id_enfant', 'childId', 'child_id', 'idPersonne', 'id', 'code', 'num'],
  // The calendar's targets: `NAME` is the first name, next to `LAST_NAME`.
  firstName: ['prenom', 'firstName', 'first_name', 'firstname', 'prenomEnfant', 'NAME'],
  lastName: ['nom', 'lastName', 'last_name', 'lastname', 'nomEnfant'],
  // `ID_TARGET` is `<person id>$<n>` in the planning of the API (see childOf).
  planningChild: [
    'idEnfant',
    'id_enfant',
    'childId',
    'child_id',
    'idPersonne',
    'enfant.id',
    'ID_TARGET',
  ],
  planningChildName: ['prenomEnfant', 'prenom', 'enfant.prenom', 'childName'],
  day: ['START_DATE_TIME', 'date', 'jour', 'dateJour', 'date_jour', 'day', 'datePresence', 'start'],
  // The end of the activity, `26/10/2026 18:00:00` in the API: it gives the
  // hours of the day the calendar shows.
  end: ['END_DATE_TIME', 'dateFin', 'date_fin', 'end'],
  // Where and when: "Vacances Toussaint - Élémentaire Jules Ferry".
  place: ['DESCRIPTION', 'FULL_DESCRIPTION', 'lieu', 'site', 'location'],
  // The API names the activity in `NAME_GROUP` ("Restauration scolaire",
  // "Accueil De Loisirs Vacances - Élémentaire") and the place and period in
  // `DESCRIPTION` ("Vacances Toussaint - Élémentaire Jules Ferry").
  activity: [
    'NAME_GROUP',
    'libelleActivite',
    'libelle_activite',
    'activite',
    'activity',
    'libelle',
    'label',
    'nomActivite',
    'activite.libelle',
    'title',
  ],
  activityId: [
    'ID_EVENT',
    'idActivite',
    'id_activite',
    'activityId',
    'activity_id',
    'codeActivite',
    'code_activite',
    'idPrestation',
    'activite.id',
  ],
  status: ['etat', 'statut', 'status', 'state', 'libelleEtat', 'codeEtat', 'etat.libelle'],
  // The API (October 2026): `{ DATA: { count, data: [{ idInvoice, FACT_DESC,
  // total, TOTAL_PAID, limitDatePayment, START_DATE, STATUS: "Payée" }] } }`.
  invoiceId: [
    'idInvoice',
    'idFacture',
    'id_facture',
    'numFacture',
    'numeroFacture',
    'numero',
    'number',
    'id',
  ],
  invoiceLabel: [
    'FACT_DESC',
    'DESC_CODE_LABEL',
    'libelle',
    'label',
    'objet',
    'FACTURATION_PERIOD',
    'periode',
    'designation',
    'regie',
  ],
  paidAmount: ['TOTAL_PAID', 'montantPaye', 'montant_paye', 'amountPaid'],
  amount: ['montantTTC', 'montant', 'amount', 'total', 'montantTotal', 'montant_total'],
  remaining: [
    'resteAPayer',
    'reste_a_payer',
    'montantRestant',
    'montant_restant',
    'restant',
    'remaining',
    'solde',
  ],
  issuedOn: [
    'dateEmission',
    'date_emission',
    'dateFacture',
    'date_facture',
    'issuedOn',
    'date',
    'START_DATE',
  ],
  dueOn: [
    'limitDatePayment',
    'dateEcheance',
    'date_echeance',
    'echeance',
    'dateLimite',
    'dueDate',
    'dueOn',
  ],
  paid: ['payee', 'estPayee', 'paid', 'isPaid', 'reglee', 'soldee'],
  invoiceStatus: ['etat', 'statut', 'status', 'state'],
  // `isLitigation: 1`: the invoice went to litigation ("mise en impayé"),
  // collected by the Trésor public; the portal's own pay button then sends
  // the family to another provider (pay_invoices_component.js).
  litigation: ['isLitigation', 'is_litigation', 'contentieux', 'enContentieux'],
  // The API (October 2026): `{ DATA: { count, data: [{ ID_NOTIFICATIONS,
  // SUBJECT, SENDER, SEND_DATE: "16/10/2026 09:58", IS_READ, BODY }] } }`.
  messageId: ['ID_NOTIFICATIONS', 'idMessage', 'id_message', 'idNotification', 'id'],
  subject: ['objet', 'sujet', 'subject', 'titre', 'title', 'libelle'],
  sender: ['expediteur', 'auteur', 'emetteur', 'from', 'sender', 'service'],
  messageDate: [
    'SEND_DATE',
    'dateEnvoi',
    'date_envoi',
    'dateCreation',
    'date',
    'sentAt',
    'createdAt',
  ],
  read: ['IS_READ', 'lu', 'estLu', 'read', 'isRead', 'luLe'],
};

/**
 * The children of the family.
 *
 * @returns {Array<{id: string, firstName: string, lastName: string, name: string}>}
 */
export function parseChildren(payload) {
  const children = [];
  const seen = new Set();
  for (const entry of listOf(payload, CHILD_LIST_KEYS)) {
    // The calendar's targets are `<id>$<n>`: the child is the id, the whole
    // value is what the planning is asked for.
    const raw = text(first(entry, FIELDS.childId));
    const id = childOf(raw);
    const firstName = text(first(entry, FIELDS.firstName));
    const lastName = text(first(entry, FIELDS.lastName));
    // The calendar lists only the targets whose HAS_SCHOOL_REG is 0 (the
    // others are not children it books for); kept when the field is absent.
    const schoolReg = get(entry, 'HAS_SCHOOL_REG');
    if (!id || !firstName || seen.has(id) || (schoolReg !== undefined && Number(schoolReg) !== 0)) {
      continue;
    }
    seen.add(id);
    const child = { id, firstName, lastName, name: firstName };
    if (raw.includes('$')) {
      child.target = raw;
    }
    children.push(child);
  }
  // Two children with the same first name (a blended family) are told apart by
  // their last name, the way the portal itself shows them.
  for (const child of children) {
    const twins = children.filter((other) => other.firstName === child.firstName);
    if (twins.length > 1 && child.lastName) {
      child.name = `${child.firstName} ${child.lastName}`;
    }
  }
  return children;
}

/**
 * The booked or bookable days of the children.
 *
 * @param {unknown} payload the planning answer
 * @param {Array<{id: string, firstName: string}>} children to attach a day
 *   given by first name only to its child
 * Hours (`start`, `end`, `HH:MM` in Paris) are kept when the portal gives
 * them and they make an interval of the day; otherwise both are `null` and
 * the day is a whole day: a midnight-to-midnight entry carries no hours.
 *
 * @returns {Array<{childId: string, day: string, activity: string, activityId: string, status: string, start: ?string, end: ?string, place: ?string}>}
 */
export function parsePlanning(payload, children = []) {
  const entries = [];
  const seen = new Set();
  for (const entry of listOf(payload, PLANNING_LIST_KEYS)) {
    let childId = childOf(first(entry, FIELDS.planningChild));
    if (!childId) {
      const name = text(first(entry, FIELDS.planningChildName));
      childId = children.find((child) => child.firstName === name)?.id ?? null;
    }
    const day = parseDay(first(entry, FIELDS.day));
    const activity = text(first(entry, FIELDS.activity));
    const status = parseReservationStatus(first(entry, FIELDS.status)) ?? selectionOf(entry);
    if (!childId || !day || !activity || !status) {
      continue;
    }
    const activityId = text(first(entry, FIELDS.activityId)) ?? slug(activity);
    const key = reservationKey({ childId, day, activityId });
    if (seen.has(key)) {
      continue;
    }
    seen.add(key);
    const { start, end } = hoursOf(first(entry, FIELDS.day), first(entry, FIELDS.end), day);
    const place = text(first(entry, FIELDS.place));
    entries.push({ childId, day, activity, activityId, status, start, end, place });
  }
  return entries.sort((a, b) => a.day.localeCompare(b.day) || a.activity.localeCompare(b.activity));
}

/**
 * The hours of a day of activity: both or none, within the day, the end after
 * the start. Anything else (no hours, `00:00:00` to `00:00:00`, an end on
 * another day) is a whole day rather than a guess.
 */
function hoursOf(startValue, endValue, day) {
  const start = parseTime(startValue);
  const end = parseTime(endValue);
  const endDay = parseDay(endValue);
  if (!start || !end || (endDay && endDay !== day) || end <= start) {
    return { start: null, end: null };
  }
  return { start, end };
}

/** `1001$0` → `1001`: the person the API's `ID_TARGET` points at. */
function childOf(value) {
  const id = text(value);
  return id ? id.split('$')[0] || null : null;
}

/**
 * The state of a day of the API's planning, which has no state label: a day
 * is booked when it is selected (`IS_SELECTED: 1`), otherwise the child is
 * registered for the activity and the day is not booked. What the other flags
 * say (`IS_UNAVAILABLE`, `PRESENCE_TYPE`, an absence) is not known yet: they
 * are not read: never guessed.
 */
function selectionOf(entry) {
  const selected = get(entry, 'IS_SELECTED');
  if (selected === undefined || selected === null || selected === '') {
    return null;
  }
  return toBoolean(selected) ? RESERVATION_STATUS.RESERVED : RESERVATION_STATUS.REGISTERED;
}

/**
 * Whether an activity is a school meal: "Cantine", "Restauration scolaire",
 * "Repas midi", "Pause méridienne"… The label is the municipality's own, so
 * this is a list of words, not a code.
 */
export function isMeal(activity) {
  return /cantine|repas|restaura|dejeuner|meridien|midi|lunch/.test(normalize(activity ?? ''));
}

/** The identity of a reservation: one child, one day, one activity. */
export function reservationKey({ childId, day, activityId }) {
  return `${childId}|${day}|${activityId}`;
}

/**
 * A reservation state, from the label or code the portal shows.
 *
 * The order of the tests matters: "demande d'absence" is an absence request,
 * not a reservation request, and "non réservé" is not reserved.
 *
 * @returns {string|null} a value of RESERVATION_STATUS
 */
export function parseReservationStatus(value) {
  if (value === undefined || value === null || value === '') {
    return null;
  }
  const code = String(value).trim().toLowerCase();
  if (Object.values(RESERVATION_STATUS).includes(code)) {
    return code;
  }
  const raw = normalize(value);
  if (/refus|rejet|reject|denied/.test(raw)) {
    return RESERVATION_STATUS.REFUSED;
  }
  if (/absen|annul|cancel/.test(raw)) {
    return /demand|attente|request|pending/.test(raw)
      ? RESERVATION_STATUS.ABSENCE_REQUESTED
      : RESERVATION_STATUS.ABSENT;
  }
  if (/non reserv|not reserved|disponible|available|reservable/.test(raw)) {
    return RESERVATION_STATUS.REGISTERED;
  }
  if (/demand|attente|en cours|request|pending/.test(raw)) {
    return RESERVATION_STATUS.REQUESTED;
  }
  if (/reserv|valid|accept|confirm|present|participe|booked/.test(raw)) {
    return RESERVATION_STATUS.RESERVED;
  }
  if (/inscri|registered|enrol/.test(raw)) {
    return RESERVATION_STATUS.REGISTERED;
  }
  return null;
}

/**
 * The invoices of the family.
 *
 * `treasury` marks an invoice sent to the Trésor public: the municipality no
 * longer follows its payment, the portal keeps showing it unpaid even once
 * paid to the Trésor. It is told by the portal (`isLitigation`, or a state
 * naming the Trésor), or by the family (see markTreasury).
 *
 * @returns {Array<{id: string, label: string, amount: number, remaining: number, issuedOn: ?string, dueOn: ?string, paid: boolean, treasury: boolean}>}
 */
export function parseInvoices(payload) {
  const invoices = [];
  const seen = new Set();
  for (const entry of listOf(payload, INVOICE_LIST_KEYS)) {
    const id = text(first(entry, FIELDS.invoiceId));
    const amount = parseAmount(first(entry, FIELDS.amount));
    // `deleted: 1`: an invoice cancelled by the municipality.
    if (!id || amount === null || seen.has(id) || toBoolean(get(entry, 'deleted') ?? false)) {
      continue;
    }
    seen.add(id);
    const paid = parsePaid(entry);
    const paidAmount = parseAmount(first(entry, FIELDS.paidAmount));
    const remainingValue =
      parseAmount(first(entry, FIELDS.remaining)) ??
      (paidAmount === null ? null : exact(amount - paidAmount));
    const remaining = remainingValue ?? (paid ? 0 : amount);
    invoices.push({
      id,
      label: text(first(entry, FIELDS.invoiceLabel)) ?? id,
      amount,
      remaining: Math.max(0, remaining),
      issuedOn: parseDay(first(entry, FIELDS.issuedOn)),
      dueOn: parseDay(first(entry, FIELDS.dueOn)),
      // An amount left to pay says more than a label ("Partiellement payée").
      paid: remainingValue === null ? paid || remaining <= 0 : remainingValue <= 0,
      treasury: isTreasury(entry),
    });
  }
  return invoices.sort((a, b) => (b.issuedOn ?? '').localeCompare(a.issuedOn ?? ''));
}

function isTreasury(entry) {
  const litigation = first(entry, FIELDS.litigation);
  if (litigation !== undefined && toBoolean(litigation)) {
    return true;
  }
  const status = normalize(first(entry, FIELDS.invoiceStatus) ?? '');
  return /tresor|recouvr|contentieux|titre (de recette|emis)|dgfip/.test(status);
}

/**
 * The invoice numbers a family typed: `164513`, `#164513, 170002`, one per
 * line… Anything that is not a number is ignored.
 *
 * @returns {Array<string>}
 */
export function parseInvoiceNumbers(value) {
  return [...new Set(String(value ?? '').match(/[0-9A-Za-z][0-9A-Za-z_-]*/g) ?? [])];
}

/**
 * Mark as sent to the Trésor public the invoices the family listed: the
 * municipality told them the portal will never show them paid.
 *
 * @param {Array<object>} invoices see parseInvoices
 * @param {Array<string>} numbers see parseInvoiceNumbers
 */
export function markTreasury(invoices, numbers = []) {
  if (numbers.length === 0) {
    return invoices;
  }
  const listed = new Set(numbers);
  return invoices.map((invoice) =>
    listed.has(invoice.id) ? { ...invoice, treasury: true } : invoice,
  );
}

function parsePaid(entry) {
  const flag = first(entry, FIELDS.paid);
  if (flag !== undefined && flag !== null && flag !== '') {
    return toBoolean(flag);
  }
  const status = normalize(first(entry, FIELDS.invoiceStatus) ?? '');
  if (/impay|non pay|a payer|partiel|unpaid|attente|due/.test(status)) {
    return false;
  }
  return /pay|regl|sold|paid|acquit/.test(status);
}

/**
 * An amount in euros: `45.2`, `"45,20"`, `"45,20 €"`, `"1 234,50"`, `"-12.00"`.
 *
 * @returns {number|null} as the portal wrote it, never rounded
 */
export function parseAmount(value) {
  if (typeof value === 'number') {
    return Number.isFinite(value) ? value : null;
  }
  if (typeof value !== 'string') {
    return null;
  }
  // Thousands separators (spaces, narrow no-break spaces, dots before a comma)
  // go, the decimal comma becomes a point.
  let cleaned = value.replace(/[€\s\u00a0\u202f]|EUR/gi, '');
  if (cleaned.includes(',')) {
    cleaned = cleaned.replace(/\./g, '').replace(',', '.');
  }
  if (!/^-?\d+(\.\d+)?$/.test(cleaned)) {
    return null;
  }
  return Number(cleaned);
}

/**
 * The result of a sum or a difference of amounts, without the noise of
 * binary floats (0.1 + 0.2 = 0.30000000000000004). Not a rounding to the
 * cent: an amount the portal gives with three decimals keeps them.
 */
export function exact(value) {
  return Number(value.toFixed(9));
}

/**
 * The list of entries an answer carries: at the root, under one of the names
 * the portal gives it, or one level down in a `data`/`result` envelope.
 *
 * @returns {Array<object>}
 */
export function listOf(payload, names, depth = 0) {
  if (Array.isArray(payload)) {
    return payload.filter((entry) => entry && typeof entry === 'object');
  }
  if (!payload || typeof payload !== 'object' || depth > 3) {
    return [];
  }
  for (const name of [...names, ...LIST_KEYS]) {
    const value = get(payload, name);
    if (value !== undefined) {
      const found = listOf(value, names, depth + 1);
      if (found.length > 0) {
        return found;
      }
    }
  }
  return [];
}

/** A field of an object: by its exact name, else whatever the case. */
function get(node, name) {
  if (!node || typeof node !== 'object') {
    return undefined;
  }
  if (node[name] !== undefined) {
    return node[name];
  }
  const lower = name.toLowerCase();
  const key = Object.keys(node).find((candidate) => candidate.toLowerCase() === lower);
  return key === undefined ? undefined : node[key];
}

/** The first value found under one of the names (dotted names reach into objects). */
function first(entry, names) {
  for (const name of names) {
    const value = name.split('.').reduce((node, part) => get(node, part), entry);
    if (value !== undefined && value !== null && value !== '') {
      return value;
    }
  }
  return undefined;
}

function text(value) {
  if (value === undefined || value === null) {
    return null;
  }
  if (typeof value === 'object') {
    return null;
  }
  const result = String(value).trim();
  return result || null;
}

function toBoolean(value) {
  if (typeof value === 'boolean') {
    return value;
  }
  if (typeof value === 'number') {
    return value !== 0;
  }
  return ['1', 'true', 'yes', 'oui', 'o', 'y', 'vrai'].includes(normalize(value));
}

/** Lowercase, accent-free, single-spaced. */
function normalize(value) {
  return String(value)
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/[_\s]+/g, ' ')
    .trim()
    .toLowerCase();
}

function slug(value) {
  return normalize(value)
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');
}
