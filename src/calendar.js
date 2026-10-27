// -----------------------------------------------------------------------------
// One read of the portal, as Gladys calendars and events.
//
// Pure functions: what to publish for one user, from what the portal said.
// The sync (src/sync.js) does the requests.
//
// - One calendar per child: the days booked (or asked for) on the portal, one
//   event per activity, at the portal's hours ("Restauration scolaire",
//   08:00–18:00), or over the whole day when the portal gives none or the
//   administrator prefers it.
// - One calendar of the invoices to pay, when enabled: one whole-day event on
//   the due date, named with the amount left to pay, never rounded.
//
// Every id is user-scoped (`gladys.externalId(`${user}:…`)`, see the SDK): two
// parents of the same family who both enable the integration get their own
// calendars, and the same booking never collides between them. The ids are
// built from the portal's own ids, never from a name: a child renamed on the
// portal keeps its calendar.
// -----------------------------------------------------------------------------

import { addDays, dayOf, parisInstant } from './agora/dates.js';
import { EXPECTED_STATUSES, RESERVATION_STATUS } from './agora/parse.js';
import { PAGES } from './agora/endpoints.js';
import { pick } from './i18n.js';
import {
  CALENDAR_DESCRIPTIONS,
  INVOICES_CALENDAR_NAME,
  PENDING_SUFFIX,
  STATUS_LABELS,
  childCalendarName,
  invoiceEventDescription,
  invoiceEventName,
} from './messages.js';

/** The core refuses more in one request (`publishCalendarEvents`). */
export const MAX_EVENTS_PER_REQUEST = 500;

/** The calendar colours, one per child in order, then the invoices'. */
export const CHILD_COLORS = ['#3174ad', '#2e9d5b', '#c2185b', '#7b4fc9', '#e08a00', '#00838f'];
export const INVOICES_COLOR = '#d32f2f';

/** The Gladys bounds of the texts of an event. */
const NAME_MAX = 200;
const DESCRIPTION_MAX = 1000;

/**
 * The ids of one user's calendars and events.
 *
 * @param {{externalId: (suffix: string) => string}} gladys
 * @param {string} userSelector
 * @param {string} accountId the commune and the hashed login (src/config.js)
 */
export function idsFor(gladys, userSelector, accountId) {
  const id = (suffix) => gladys.externalId(`${userSelector}:${accountId}:${suffix}`);
  return {
    childCalendar: (child) => id(`child:${child.id}`),
    invoicesCalendar: () => id('invoices'),
    booking: (entry) => id(`${entry.childId}:${entry.day}:${entry.activityId}`),
    invoice: (invoice) => id(`invoice:${invoice.id}`),
  };
}

/**
 * The days a user's calendars cover: from `days_back` days ago to `days_ahead`
 * days ahead, both included. The window given to Gladys ends at the midnight
 * after the last day (exclusive), in Paris.
 *
 * @param {string} today `YYYY-MM-DD`
 * @param {{days_back: number, days_ahead: number}} config
 */
export function windowOf(today, config) {
  const firstDay = addDays(today, -config.days_back);
  const lastDay = addDays(today, config.days_ahead);
  const endDay = addDays(lastDay, 1);
  return {
    firstDay,
    lastDay,
    endDay,
    from: parisInstant(firstDay, '00:00'),
    to: parisInstant(endDay, '00:00'),
  };
}

/**
 * Everything to publish for one user.
 *
 * @param {object} read
 * @param {Array<object>} read.children see parseChildren
 * @param {Array<object>} read.planning see parsePlanning
 * @param {Array<object>|null} read.invoices see parseInvoices; `null` when not read
 * @param {object} options
 * @param {ReturnType<typeof idsFor>} options.ids
 * @param {ReturnType<typeof windowOf>} options.window
 * @param {object} options.config normalized integration settings
 * @param {object} options.account normalized account (for the portal link)
 * @param {string} options.language the user's language
 * @returns {{calendars: Array<object>, events: Map<string, Array<object>>}}
 *   the calendars, and the events of each calendar by its external id
 */
export function buildCalendars(
  { children, planning, invoices },
  { ids, window, config, account, language },
) {
  const url = account.portalBase ? `${account.portalBase}/${PAGES.home}` : null;
  const calendars = [];
  const events = new Map();

  children.forEach((child, index) => {
    const calendarId = ids.childCalendar(child);
    calendars.push({
      external_id: calendarId,
      name: childCalendarName(child).slice(0, 100),
      description: pick(language, CALENDAR_DESCRIPTIONS.child),
      color: CHILD_COLORS[index % CHILD_COLORS.length],
    });
    events.set(
      calendarId,
      planning
        .filter((entry) => entry.childId === child.id && EXPECTED_STATUSES.includes(entry.status))
        .filter((entry) => entry.day >= window.firstDay && entry.day <= window.lastDay)
        .map((entry) => bookingEvent(entry, { ids, config, language, url })),
    );
  });

  if (config.show_invoices && invoices) {
    const calendarId = ids.invoicesCalendar();
    calendars.push({
      external_id: calendarId,
      name: pick(language, INVOICES_CALENDAR_NAME),
      description: pick(language, CALENDAR_DESCRIPTIONS.invoices),
      color: INVOICES_COLOR,
    });
    events.set(
      calendarId,
      invoices
        // Every event must fall in the window: an invoice overdue for longer
        // than `days_back` is still on the portal, not in the calendar.
        .filter((invoice) => !invoice.paid && invoice.remaining > 0 && invoice.dueOn)
        .filter((invoice) => invoice.dueOn >= window.firstDay && invoice.dueOn <= window.lastDay)
        .map((invoice) => ({
          external_id: ids.invoice(invoice),
          name: clip(invoiceEventName(invoice, language), NAME_MAX),
          start: invoice.dueOn,
          end: addDays(invoice.dueOn, 1),
          full_day: true,
          description: clip(invoiceEventDescription(invoice, language), DESCRIPTION_MAX),
          ...(url && { url }),
        })),
    );
  }

  return { calendars, events };
}

function bookingEvent(entry, { ids, config, language, url }) {
  const pending = entry.status === RESERVATION_STATUS.REQUESTED;
  const name = pending ? `${entry.activity} ${pick(language, PENDING_SUFFIX)}` : entry.activity;
  const description = [entry.place, pick(language, STATUS_LABELS[entry.status])]
    .filter(Boolean)
    .join('\n');
  const timed = !config.full_day_events && entry.start && entry.end;
  return {
    external_id: ids.booking(entry),
    name: clip(name, NAME_MAX),
    ...(timed
      ? {
          start: parisInstant(entry.day, entry.start),
          end: parisInstant(entry.day, entry.end),
          full_day: false,
        }
      : { start: entry.day, end: addDays(entry.day, 1), full_day: true }),
    description: clip(description, DESCRIPTION_MAX),
    ...(url && { url }),
  };
}

/**
 * The requests of one calendar: ≤ 500 events each, over disjoint windows that
 * together cover the whole window, so the events that left the portal are
 * pruned everywhere. The events of one day always go together: an event never
 * spans two days, so no event straddles two sub-windows.
 *
 * @param {Array<object>} events
 * @param {ReturnType<typeof windowOf>} window
 * @returns {Array<{events: Array<object>, window: {from: string, to: string}}>}
 */
export function batchesOf(events, window, max = MAX_EVENTS_PER_REQUEST) {
  if (events.length <= max) {
    return [{ events, window: { from: window.from, to: window.to } }];
  }
  const byDay = new Map();
  for (const event of events) {
    const day = dayOfEvent(event);
    byDay.set(day, [...(byDay.get(day) ?? []), event]);
  }
  const batches = [];
  let current = [];
  let from = window.from;
  for (const day of [...byDay.keys()].sort()) {
    const dayEvents = byDay.get(day);
    if (current.length > 0 && current.length + dayEvents.length > max) {
      const to = parisInstant(day, '00:00');
      batches.push({ events: current, window: { from, to } });
      current = [];
      from = to;
    }
    current = current.concat(dayEvents);
  }
  batches.push({ events: current, window: { from, to: window.to } });
  return batches;
}

/** The Paris day of an event, as built above. */
function dayOfEvent(event) {
  return event.full_day ? event.start : dayOf(new Date(event.start));
}

function clip(text, max) {
  return text.length > max ? `${text.slice(0, max - 1)}…` : text;
}
