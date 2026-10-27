import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  DEFAULT_CONFIG,
  normalizeAccount,
  normalizeConfig,
  parsePortalUrl,
} from '../src/config.js';

test('the portal address is read whatever shape it was pasted in', () => {
  const expected = {
    url: 'https://portalssl.agoraplus.fr/lognes',
    base: 'https://portalssl.agoraplus.fr/lognes',
    apiBase: 'https://lognes.agoraplus.fr',
    commune: 'lognes',
  };
  for (const pasted of [
    'lognes',
    'Lognes',
    'portalssl.agoraplus.fr/lognes',
    'https://portalssl.agoraplus.fr/lognes',
    'https://portalssl.agoraplus.fr/lognes/',
    'https://portalssl.agoraplus.fr/lognes/pck_home.home_view#/',
    'http://portalssl.agoraplus.fr/lognes/pck_home.home_view',
    'https://lognes.agoraplus.fr/InternalApi/API_DASHBOARD/authentication',
    'lognes.agoraplus.fr',
    '  https://portalssl.agoraplus.fr/lognes?x=1  ',
  ]) {
    assert.deepEqual(parsePortalUrl(pasted), expected, pasted);
  }
});

test('a municipality behind its own host keeps it', () => {
  assert.deepEqual(parsePortalUrl('https://famille.ma-ville.fr/agora/pck_home.home_view#/'), {
    url: 'https://famille.ma-ville.fr/agora',
    base: 'https://famille.ma-ville.fr/agora',
    apiBase: 'https://famille.ma-ville.fr',
    commune: 'agora',
  });
});

test('nothing usable is no portal', () => {
  for (const pasted of [
    '',
    '   ',
    null,
    undefined,
    'https://portalssl.agoraplus.fr/',
    'ftp://x/y',
  ]) {
    assert.equal(parsePortalUrl(pasted), null, String(pasted));
  }
});

test('defaults apply and numbers are kept in range', () => {
  assert.deepEqual(normalizeConfig({}), DEFAULT_CONFIG);

  const clamped = normalizeConfig({
    refresh_minutes: '5',
    days_ahead: 500,
    days_back: -3,
    full_day_events: 'true',
    show_invoices: '',
  });
  assert.equal(clamped.refresh_minutes, 15);
  assert.equal(clamped.days_ahead, 90);
  assert.equal(clamped.days_back, 0);
  assert.equal(clamped.full_day_events, true);
  assert.equal(clamped.show_invoices, DEFAULT_CONFIG.show_invoices);
});

test('an account without its three values is not configured', () => {
  for (const raw of [{}, { portal_url: 'lognes', username: 'a@b.fr' }, { password: 'x' }]) {
    const account = normalizeAccount(raw);
    assert.equal(account.configured, false);
    assert.equal(account.accountId, null);
  }
});

test('the account id never carries the e-mail address', () => {
  const account = normalizeAccount({
    portal_url: 'lognes',
    username: ' Parent@Example.com ',
    password: 'x',
  });
  assert.equal(account.configured, true);
  assert.equal(account.apiBase, 'https://lognes.agoraplus.fr');
  assert.match(account.accountId, /^lognes-[0-9a-f]{12}$/);
  assert.ok(!account.accountId.includes('example'));
  // Same login, other case: same account (same calendars).
  assert.equal(
    normalizeAccount({ portal_url: 'lognes', username: 'parent@example.com', password: 'y' })
      .accountId,
    account.accountId,
  );
});
