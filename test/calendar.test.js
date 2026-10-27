import { test } from 'node:test';
import assert from 'node:assert/strict';
import { RESERVATION_STATUS } from '../src/agora/parse.js';
import { batchesOf, buildCalendars, idsFor, windowOf } from '../src/calendar.js';
import { normalizeAccount, normalizeConfig } from '../src/config.js';

const gladys = { externalId: (suffix) => `ext:test:${suffix}` };
const account = normalizeAccount({
  portal_url: 'testville',
  username: 'parent@example.com',
  password: 'x',
});
const ids = idsFor(gladys, 'alice', account.accountId);
const children = [
  { id: '101', firstName: 'Léa', name: 'Léa' },
  { id: '102', firstName: 'Tom', name: 'Tom' },
];

function booking(childId, day, activity, extra = {}) {
  return {
    childId,
    day,
    activity,
    activityId: activity.toLowerCase(),
    status: RESERVATION_STATUS.RESERVED,
    start: '11:30',
    end: '13:30',
    place: 'École Jules Ferry',
    ...extra,
  };
}

function build({ planning = [], invoices = [], config = {}, language = 'fr' } = {}) {
  const settings = normalizeConfig(config);
  const window = windowOf('2026-11-04', settings);
  return buildCalendars(
    { children, planning, invoices },
    { ids, window, config: settings, account, language },
  );
}

test('the window runs from midnight in Paris, days_back ago, to the midnight after the last day', () => {
  assert.deepEqual(windowOf('2026-11-04', { days_back: 7, days_ahead: 30 }), {
    firstDay: '2026-10-28',
    lastDay: '2026-12-04',
    endDay: '2026-12-05',
    from: '2026-10-27T23:00:00.000Z',
    to: '2026-12-04T23:00:00.000Z',
  });
});

test('one calendar per child and one for the invoices, with user-scoped ids', () => {
  const { calendars } = build();
  assert.deepEqual(
    calendars.map((calendar) => [calendar.external_id, calendar.name]),
    [
      [`ext:test:alice:${account.accountId}:child:101`, 'Léa – Agora Famille'],
      [`ext:test:alice:${account.accountId}:child:102`, 'Tom – Agora Famille'],
      [`ext:test:alice:${account.accountId}:invoices`, 'Factures Agora Famille'],
    ],
  );
  assert.ok(calendars.every((calendar) => /^#[0-9a-f]{6}$/.test(calendar.color)));
  assert.equal(new Set(calendars.map((calendar) => calendar.color)).size, 3);
  assert.equal(build({ language: 'de' }).calendars[2].name, 'Agora Famille Rechnungen');
});

test('a booked day is an event at the hours of the portal, in UTC', () => {
  const { events } = build({ planning: [booking('101', '2026-11-05', 'Cantine')] });
  assert.deepEqual(events.get(ids.childCalendar(children[0])), [
    {
      external_id: `ext:test:alice:${account.accountId}:101:2026-11-05:cantine`,
      name: 'Cantine',
      start: '2026-11-05T10:30:00.000Z',
      end: '2026-11-05T12:30:00.000Z',
      full_day: false,
      description: 'École Jules Ferry\nRéservé',
      url: 'https://portalssl.agoraplus.fr/testville/pck_home.home_view#/',
    },
  ]);
  assert.deepEqual(events.get(ids.childCalendar(children[1])), []);
});

test('without hours, or when asked, a booking takes the whole day', () => {
  const planning = [booking('101', '2026-11-05', 'Cantine', { start: null, end: null })];
  const [event] = build({ planning }).events.get(ids.childCalendar(children[0]));
  assert.deepEqual([event.start, event.end, event.full_day], ['2026-11-05', '2026-11-06', true]);

  const [asked] = build({
    planning: [booking('101', '2026-11-05', 'Cantine')],
    config: { full_day_events: true },
  }).events.get(ids.childCalendar(children[0]));
  assert.deepEqual([asked.start, asked.end, asked.full_day], ['2026-11-05', '2026-11-06', true]);
});

test('only expected days go in, a pending one says so, and only within the window', () => {
  const planning = [
    booking('101', '2026-11-05', 'Cantine'),
    booking('101', '2026-11-06', 'Cantine', { status: RESERVATION_STATUS.REGISTERED }),
    booking('101', '2026-11-07', 'Garderie', { status: RESERVATION_STATUS.REQUESTED }),
    booking('101', '2026-11-08', 'Cantine', { status: RESERVATION_STATUS.REFUSED }),
    booking('101', '2026-10-27', 'Cantine'), // before the window
    booking('101', '2026-12-05', 'Cantine'), // after it
  ];
  const events = build({ planning }).events.get(ids.childCalendar(children[0]));
  assert.deepEqual(
    events.map((event) => event.name),
    ['Cantine', 'Garderie (en attente)'],
  );
  assert.match(events[1].description, /Demande en attente$/);
});

test('an unpaid invoice is a whole-day event on its due date, the amount never rounded', () => {
  const invoices = [
    { id: 'F10', label: 'Octobre 2026', amount: 70, remaining: 64.805, dueOn: '2026-11-20' },
    { id: 'F09', label: 'Septembre', amount: 38, remaining: 0, paid: true, dueOn: '2026-11-10' },
    { id: 'F08', label: 'Août', amount: 12, remaining: 12, dueOn: '2026-10-01' }, // too old
    { id: 'F07', label: 'Juillet', amount: 12, remaining: 12, dueOn: null },
  ];
  const { events } = build({ invoices });
  // Intl writes French amounts with no-break spaces.
  const plain = (event) => ({
    ...event,
    name: event.name.replace(/[\u00a0\u202f]/g, ' '),
    description: event.description.replace(/[\u00a0\u202f]/g, ' '),
  });
  assert.deepEqual(events.get(ids.invoicesCalendar()).map(plain), [
    {
      external_id: `ext:test:alice:${account.accountId}:invoice:F10`,
      name: 'Facture à payer : 64,805 €',
      start: '2026-11-20',
      end: '2026-11-21',
      full_day: true,
      description: 'Octobre 2026\nMontant : 70,00 €, reste à payer : 64,805 €',
      url: 'https://portalssl.agoraplus.fr/testville/pck_home.home_view#/',
    },
  ]);
  assert.equal(
    build({ invoices, language: 'en' }).events.get(ids.invoicesCalendar())[0].name,
    'Invoice to pay: €64.805',
  );
});

test('no invoices calendar when turned off, or when the portal has no invoices module', () => {
  const ids3 = (result) => result.calendars.map((calendar) => calendar.external_id);
  assert.equal(ids3(build({ config: { show_invoices: false } })).length, 2);
  const settings = normalizeConfig({});
  const result = buildCalendars(
    { children, planning: [], invoices: null },
    { ids, window: windowOf('2026-11-04', settings), config: settings, account, language: 'fr' },
  );
  assert.equal(ids3(result).length, 2);
});

test('long lists go in requests of 500 at most, over disjoint windows covering the whole one', () => {
  const window = windowOf('2026-11-04', { days_back: 0, days_ahead: 3 });
  const day = (date, count) =>
    Array.from({ length: count }, (_, index) => ({
      external_id: `${date}-${index}`,
      start: `${date}T08:00:00.000Z`,
      full_day: false,
    }));
  const events = [...day('2026-11-04', 300), ...day('2026-11-05', 300), ...day('2026-11-06', 10)];
  const batches = batchesOf(events, window);
  assert.deepEqual(
    batches.map((batch) => [batch.events.length, batch.window.from, batch.window.to]),
    [
      [300, window.from, '2026-11-04T23:00:00.000Z'],
      [310, '2026-11-04T23:00:00.000Z', window.to],
    ],
  );
  assert.deepEqual(batchesOf(events.slice(0, 10), window), [
    { events: events.slice(0, 10), window: { from: window.from, to: window.to } },
  ]);
});

test('an invoice sent to the Trésor public stays out of the invoices calendar', () => {
  const invoices = [
    { id: 'F10', label: 'Octobre', amount: 40, remaining: 40, dueOn: '2026-11-20' },
    {
      id: 'F11',
      label: 'Décembre',
      amount: 64.8,
      remaining: 64.8,
      dueOn: '2026-11-10',
      treasury: true,
    },
  ];
  const { events } = build({ invoices });
  assert.deepEqual(
    events.get(ids.invoicesCalendar()).map((event) => event.external_id),
    [`ext:test:alice:${account.accountId}:invoice:F10`],
  );
});
