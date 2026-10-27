import { after, before, test } from 'node:test';
import assert from 'node:assert/strict';
import { createFakeGladys } from '@gladysassistant/integration-sdk/testing';
import { createApp } from '../src/app.js';
import { normalizeAccount } from '../src/config.js';
import { CONFIG, apiDay, createFakePortal, useTestPaths } from './helpers/fakePortal.js';

let restorePaths;
before(() => {
  restorePaths = useTestPaths();
});
after(() => restorePaths());

// Wednesday 4 November 2026, 10:00 in Paris.
const NOW = new Date('2026-11-04T09:00:00Z');

const ALICE = { selector: 'alice', first_name: 'Alice', language: 'fr' };
const BOB = { selector: 'bob', first_name: 'Bob', language: 'en' };

const accountId = normalizeAccount(CONFIG).accountId;
const id = (user, suffix) => `ext:test-integration:${user}:${accountId}:${suffix}`;

function family() {
  // In the API's own shape: Léa has lunch and the evening care today and is
  // registered (not booked) tomorrow; Tom has lunch tomorrow.
  return createFakePortal({
    planning: [
      apiDay({ child: 101, date: '04/11/2026', eventId: 1, selected: 1 }),
      apiDay({ child: 101, date: '04/11/2026', eventId: 2, group: 'Garderie soir', selected: 1 }),
      apiDay({ child: 101, date: '05/11/2026', eventId: 1 }),
      apiDay({ child: 102, date: '05/11/2026', eventId: 1, selected: 1 }),
    ],
    invoices: [
      { numFacture: 'F10', libelle: 'Octobre 2026', montant: '45,20', dateEcheance: '20/11/2026' },
      { numFacture: 'F09', libelle: 'Septembre 2026', montant: 38, payee: true },
    ],
  });
}

async function start({ portal = family(), accounts, config = {} } = {}) {
  const gladys = createFakeGladys({
    config,
    calendarAccounts: accounts ?? [{ user: ALICE, config: { ...CONFIG } }],
  });
  const app = createApp(gladys, { fetch: portal.fetch, now: () => NOW });
  await gladys.connect();
  return { gladys, app, portal };
}

const eventsOf = (gladys, calendar) =>
  gladys.fake.calendarEvents.filter((event) => event.calendar_external_id === calendar);

test('the bookings and the invoices of the portal land in the user calendars', async (t) => {
  const { gladys, app } = await start();
  t.after(() => app.stop());

  assert.deepEqual(
    gladys.fake.calendars.map((calendar) => [calendar.external_id, calendar.name, calendar.user]),
    [
      [id('alice', 'child:101'), 'Léa – Agora Famille', 'alice'],
      [id('alice', 'child:102'), 'Tom – Agora Famille', 'alice'],
      [id('alice', 'invoices'), 'Factures Agora Famille', 'alice'],
    ],
  );
  // A new calendar is private until its user shares it.
  assert.ok(gladys.fake.calendars.every((calendar) => calendar.sync && !calendar.shared));

  assert.deepEqual(
    eventsOf(gladys, id('alice', 'child:101')).map((event) => [event.name, event.start, event.end]),
    [
      ['Garderie soir', '2026-11-04T07:00:00.000Z', '2026-11-04T17:00:00.000Z'],
      ['Restauration scolaire', '2026-11-04T07:00:00.000Z', '2026-11-04T17:00:00.000Z'],
    ],
  );
  assert.equal(eventsOf(gladys, id('alice', 'child:102')).length, 1);
  const [invoice] = eventsOf(gladys, id('alice', 'invoices'));
  assert.equal(invoice.name.replace(/[\u00a0\u202f]/g, ' '), 'Facture à payer : 45,20 €');
  assert.equal(invoice.full_day, true);

  // Every request covers the watched window.
  for (const batch of gladys.fake.publishedCalendarEvents) {
    assert.deepEqual(batch.window, {
      from: '2026-10-27T23:00:00.000Z',
      to: '2026-12-04T23:00:00.000Z',
    });
  }
  assert.equal(gladys.fake.connectionStatus.connected, true);
});

test('a day cancelled on the portal leaves the calendar at the next sync', async (t) => {
  const { gladys, app, portal } = await start();
  t.after(() => app.stop());
  portal.planning = portal.planning.filter((day) => day.NAME_GROUP !== 'Garderie soir');
  await app.sync.syncAll();
  assert.deepEqual(
    eventsOf(gladys, id('alice', 'child:101')).map((event) => event.name),
    ['Restauration scolaire'],
  );
});

test('a calendar the user switched off is left alone, the others still sync', async (t) => {
  const { gladys, app, portal } = await start();
  t.after(() => app.stop());
  gladys.fake.calendars.find((c) => c.external_id === id('alice', 'child:101')).sync = false;
  portal.planning.push(apiDay({ child: 102, date: '06/11/2026', eventId: 1, selected: 1 }));
  const before = gladys.fake.publishedCalendarEvents.length;

  await gladys.fake.calendarAccountUpdated('alice');

  const pushed = gladys.fake.publishedCalendarEvents.slice(before);
  assert.ok(!pushed.some((batch) => batch.calendar_external_id === id('alice', 'child:101')));
  assert.equal(eventsOf(gladys, id('alice', 'child:102')).length, 2);
  assert.equal(gladys.fake.connectionStatus.connected, true);
});

test('each user syncs their own account; one without it is reported, not the others', async (t) => {
  const { gladys, app } = await start({
    accounts: [
      { user: ALICE, config: { ...CONFIG } },
      { user: BOB, config: { portal_url: 'testville' } },
    ],
  });
  t.after(() => app.stop());
  assert.ok(gladys.fake.calendars.every((calendar) => calendar.user === 'alice'));
  const status = gladys.fake.connectionStatus;
  assert.equal(status.connected, false);
  assert.match(status.message.fr, /^Bob – Renseignez l'adresse du portail/);
  assert.doesNotMatch(status.message.fr, /Alice/);
});

test('two users on the same portal account get calendars of their own', async (t) => {
  const { gladys, app } = await start({
    accounts: [
      { user: ALICE, config: { ...CONFIG } },
      { user: BOB, config: { ...CONFIG } },
    ],
  });
  t.after(() => app.stop());
  assert.equal(gladys.fake.calendars.length, 6);
  assert.ok(gladys.fake.calendars.some((c) => c.external_id === id('bob', 'invoices')));
  assert.equal(
    gladys.fake.calendars.find((c) => c.external_id === id('bob', 'invoices')).name,
    'Agora Famille invoices',
  );
});

test('a portal down publishes nothing: the calendars keep what they had', async (t) => {
  const { gladys, app, portal } = await start();
  t.after(() => app.stop());
  const count = gladys.fake.calendarEvents.length;
  const published = gladys.fake.publishedCalendarEvents.length;
  portal.down = true;
  await app.sync.syncAll();
  assert.equal(gladys.fake.publishedCalendarEvents.length, published);
  assert.equal(gladys.fake.calendarEvents.length, count);
  assert.equal(gladys.fake.calendars.length, 3);
  assert.equal(gladys.fake.connectionStatus.connected, false);
  assert.match(gladys.fake.connectionStatus.message.fr, /^Alice – Le portail ne répond pas/);

  portal.down = false;
  await app.sync.syncAll();
  assert.equal(gladys.fake.connectionStatus.connected, true);
});

test('a wrong password is said, without the password', async (t) => {
  const { gladys, app } = await start({
    accounts: [{ user: ALICE, config: { ...CONFIG, password: 'wrong-one' } }],
  });
  t.after(() => app.stop());
  const { message } = gladys.fake.connectionStatus;
  assert.match(message.fr, /refusé l'identifiant ou le mot de passe/);
  assert.ok(!JSON.stringify(message).includes('wrong-one'));
  assert.deepEqual(gladys.fake.calendars, []);
});

test('turning the invoices off, or a portal without them, removes their calendar', async (t) => {
  const { gladys, app } = await start();
  t.after(() => app.stop());
  await gladys.fake.configUpdated({ show_invoices: false });
  assert.deepEqual(gladys.fake.deletedCalendars, [id('alice', 'invoices')]);
  assert.equal(gladys.fake.calendars.length, 2);

  const portal = family();
  portal.missing.add('invoices');
  const other = await start({ portal });
  t.after(() => other.app.stop());
  assert.equal(other.gladys.fake.calendars.length, 2);
  assert.equal(other.gladys.fake.connectionStatus.connected, true);
});

test('whole-day events when the administrator prefers them', async (t) => {
  const { gladys, app } = await start({ config: { full_day_events: true } });
  t.after(() => app.stop());
  const [event] = eventsOf(gladys, id('alice', 'child:102'));
  assert.deepEqual([event.start, event.end, event.full_day], ['2026-11-05', '2026-11-06', true]);
});

test('a user who disables the integration is forgotten', async (t) => {
  const { gladys, app } = await start({
    accounts: [
      { user: ALICE, config: { ...CONFIG } },
      { user: BOB, config: {} },
    ],
  });
  t.after(() => app.stop());
  assert.equal(gladys.fake.connectionStatus.connected, false);
  gladys.fake.calendarAccounts = gladys.fake.calendarAccounts.filter(
    (account) => account.user.selector !== 'bob',
  );
  await gladys.fake.calendarAccountUpdated('bob');
  assert.deepEqual(
    app.sync.users.map((state) => state.user.selector),
    ['alice'],
  );
  assert.equal(gladys.fake.connectionStatus.connected, true);
});

test('"Sync now" reads the portal again and says what it did, per user', async (t) => {
  const { gladys, app } = await start({
    accounts: [
      { user: ALICE, config: { ...CONFIG } },
      { user: BOB, config: {} },
    ],
  });
  t.after(() => app.stop());
  const ack = await gladys.fake.action('sync_now', {});
  assert.equal(ack.success, true);
  const text = JSON.stringify(ack.data);
  assert.match(text, /Alice – 2 enfant\(s\), 4 événement\(s\) dans 3 calendrier\(s\)\./);
  assert.match(text, /Bob – Fill in the portal address/);
});

test('with nobody enabled, the Configuration screen says how to start', async (t) => {
  const { gladys, app } = await start({ accounts: [] });
  t.after(() => app.stop());
  assert.equal(gladys.fake.connectionStatus.connected, true);
  assert.match(gladys.fake.connectionStatus.message.fr, /Mes calendriers/);
});

test('the invoices a user lists as sent to the Trésor public leave their calendar', async (t) => {
  const portal = family();
  portal.invoices.push({
    numFacture: '164513',
    libelle: 'Novembre 2026',
    montant: '64,80',
    dateEcheance: '10/11/2026',
  });
  const { gladys, app } = await start({
    portal,
    accounts: [{ user: ALICE, config: { ...CONFIG, treasury_invoices: '#164513' } }],
  });
  t.after(() => app.stop());
  assert.deepEqual(
    eventsOf(gladys, id('alice', 'invoices')).map((event) => event.external_id),
    [id('alice', 'invoice:F10')],
  );
});
