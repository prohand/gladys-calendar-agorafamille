// -----------------------------------------------------------------------------
// The calendars of every user who enabled the integration, kept in sync.
//
// A calendar is personal data: Gladys only hands the integration the users who
// enabled it (`getCalendarAccounts()`), each with their own portal account.
// For each of them, one sync reads the portal and publishes:
//
//   1. the calendars (one per child, one for the invoices) — upserted;
//   2. the events of every calendar the user did not switch off (`sync:
//      false` answers 403), over the watched window: what left the portal in
//      that window is pruned by Gladys;
//   3. the deletion of the calendars that no longer exist on the portal (a
//      child gone, the invoices turned off, another account).
//
// Nothing is written on the portal: the integration only reads it. A failed
// read publishes nothing, so a portal down at 8 a.m. never empties a calendar.
//
// One sync at a time per user: the timer, a change of the user's account and
// the "Sync now" action, asked while a sync runs, run it once more afterwards
// rather than in parallel.
// -----------------------------------------------------------------------------

import { createHash } from 'node:crypto';
import { createLogger } from './logging.js';
import { AgoraClient, AgoraError, ERROR_CODES } from './agora/client.js';
import { dayOf } from './agora/dates.js';
import { markTreasury } from './agora/parse.js';
import { batchesOf, buildCalendars, idsFor, windowOf } from './calendar.js';
import { normalizeAccount } from './config.js';
import { describeError } from './messages.js';
import { localize, pick } from './i18n.js';

const logger = createLogger({ name: 'sync' });

/**
 * @param {object} options
 * @param {import('@gladysassistant/integration-sdk').GladysIntegration} options.gladys
 * @param {() => object} options.getConfig the normalized integration settings
 * @param {typeof fetch} [options.fetch] injected by the tests
 * @param {() => Date} [options.now]
 */
export function createSync({ gladys, getConfig, fetch, now = () => new Date() }) {
  /** Per user selector: `{ user, clientKey, client, running, again, error, result }`. */
  const users = new Map();
  let lastStatus = null;

  function stateOf(user) {
    if (!users.has(user.selector)) {
      users.set(user.selector, { user, client: null, clientKey: null, running: null, again: null });
    }
    const state = users.get(user.selector);
    state.user = user;
    return state;
  }

  /** The portal client of an account, kept across syncs while the account is the same. */
  function clientOf(state, account) {
    const key = createHash('sha256')
      .update(JSON.stringify([account.apiBase, account.username, account.password]))
      .digest('hex');
    if (state.clientKey !== key) {
      state.clientKey = key;
      state.client = new AgoraClient({
        apiBase: account.apiBase,
        origin: new URL(account.portalBase).origin,
        username: account.username,
        password: account.password,
        fetch,
      });
    }
    return state.client;
  }

  async function syncOnce(state, rawAccount) {
    const { user } = state;
    const config = getConfig();
    const account = normalizeAccount(rawAccount);
    try {
      if (!account.configured) {
        throw new AgoraError(ERROR_CODES.CONFIG, 'The account of the user is not filled in');
      }
      const client = clientOf(state, account);
      const window = windowOf(dayOf(now()), config);
      const read = await readPortal(client, window, config, account);
      const ids = idsFor(gladys, user.selector, account.accountId);
      const { calendars, events } = buildCalendars(read, {
        ids,
        window,
        config,
        account,
        language: user.language,
      });
      const result = await publish(user, calendars, events, window);
      state.error = null;
      state.result = { ...result, children: read.children.length };
      logger.info(
        `Calendars of ${user.selector} updated: ${read.children.length} child(ren), ` +
          `${result.events} event(s) in ${result.published} calendar(s)` +
          (result.skipped ? `, ${result.skipped} switched off` : '') +
          (result.deleted ? `, ${result.deleted} removed` : ''),
      );
    } catch (err) {
      state.error =
        err instanceof AgoraError
          ? err
          : // A refusal of Gladys (a 429, a 400): told apart from the portal's.
            Object.assign(new AgoraError(GLADYS_ERROR, err.message), {
              status: err.status ?? null,
            });
      state.result = null;
      logger.warn(
        `Sync of ${user.selector} failed (${state.error.step ?? state.error.code}): ` +
          state.error.message,
      );
    }
    return state;
  }

  async function publish(user, calendars, events, window) {
    await gladys.publishCalendars(user.selector, calendars);
    const existing = await gladys.getCalendars(user.selector);
    const switchedOff = new Set(existing.filter((c) => !c.sync).map((c) => c.external_id));
    let published = 0;
    let count = 0;
    for (const calendar of calendars) {
      // The user said no: Gladys emptied it and would answer 403.
      if (switchedOff.has(calendar.external_id)) {
        continue;
      }
      const list = events.get(calendar.external_id) ?? [];
      for (const batch of batchesOf(list, window)) {
        await gladys.publishCalendarEvents(calendar.external_id, batch.events, batch.window);
      }
      published += 1;
      count += list.length;
    }
    // Only after a full read: the calendars the portal no longer has.
    const current = new Set(calendars.map((c) => c.external_id));
    const stale = existing.filter((c) => !current.has(c.external_id));
    for (const calendar of stale) {
      await gladys.deleteCalendar(calendar.external_id);
    }
    return {
      published,
      events: count,
      skipped: calendars.filter((c) => switchedOff.has(c.external_id)).length,
      deleted: stale.length,
    };
  }

  /** Sync one user, or note that a sync is wanted once the running one ends. */
  function run(state, rawAccount) {
    if (state.running) {
      state.again = rawAccount;
      return state.running;
    }
    state.running = (async () => {
      let next = rawAccount;
      while (next) {
        state.again = null;
        await syncOnce(state, next);
        next = state.again;
      }
      return state;
    })().finally(() => {
      state.running = null;
    });
    return state.running;
  }

  /** Tell the Configuration screen how the last syncs went, when it changed. */
  async function report() {
    const states = [...users.values()];
    const failed = states.filter((state) => state.error);
    let status;
    if (states.length === 0) {
      status = [true, NO_ACCOUNT];
    } else if (failed.length === 0) {
      status = [true];
    } else {
      status = [
        false,
        localize((language) =>
          failed
            .map(
              (state) =>
                `${state.user.first_name || state.user.selector} – ` +
                pick(language, describeSyncError(state.error)),
            )
            .join(' '),
        ),
      ];
    }
    const key = JSON.stringify(status);
    if (key !== lastStatus) {
      lastStatus = key;
      await gladys.setConnectionStatus(...status).catch((err) => {
        logger.warn(`Could not publish the connection status: ${err.message}`);
      });
    }
  }

  return {
    /**
     * Sync every user who enabled the integration; forget the others. Read on
     * every connection: the account events are lost while disconnected.
     */
    async syncAll() {
      const accounts = await gladys.getCalendarAccounts();
      const enabled = new Set(accounts.map((account) => account.user.selector));
      for (const selector of users.keys()) {
        if (!enabled.has(selector)) {
          users.delete(selector);
        }
      }
      const states = [];
      // One user after the other: the calendar writes of Gladys are counted
      // per integration (30 a minute).
      for (const account of accounts) {
        states.push(await run(stateOf(account.user), account.config ?? {}));
      }
      await report();
      return states;
    },

    /** A user enabled, disabled or changed their account, or toggled a calendar. */
    async syncUser(userSelector) {
      const account = (await gladys.getCalendarAccounts()).find(
        (candidate) => candidate.user.selector === userSelector,
      );
      if (!account) {
        // Disabled: Gladys already destroyed their calendars.
        users.delete(userSelector);
        await report();
        return null;
      }
      const state = await run(stateOf(account.user), account.config ?? {});
      await report();
      return state;
    },

    /** The users known, with their last result or error. */
    get users() {
      return [...users.values()];
    },
  };
}

/** The code of an error answered by Gladys rather than by the portal. */
export const GLADYS_ERROR = 'gladys';

/** Nobody to sync: said on the Configuration screen and by "Sync now". */
export const NO_ACCOUNT = {
  en: 'No user has enabled the integration yet: each one enables it in "My calendars".',
  fr: "Aucun utilisateur n'a encore activé l'intégration : chacun l'active dans « Mes calendriers ».",
  de: 'Noch kein Benutzer hat die Integration aktiviert: Jeder aktiviert sie unter „Meine Kalender“.',
  es: 'Ningún usuario ha activado aún la integración: cada uno la activa en «Mis calendarios».',
};

/** What went wrong, the portal's fault or Gladys'. */
export function describeSyncError(error) {
  if (error?.code !== GLADYS_ERROR) {
    return describeError(error);
  }
  const status = error.status ? ` (HTTP ${error.status})` : '';
  return localize(
    (language) =>
      pick(language, {
        en: 'Gladys refused the calendar update',
        fr: 'Gladys a refusé la mise à jour du calendrier',
        de: 'Gladys hat die Kalenderaktualisierung abgelehnt',
        es: 'Gladys rechazó la actualización del calendario',
      }) +
      `${status}. ` +
      pick(language, {
        en: 'It will be tried again.',
        fr: 'Nouvel essai plus tard.',
        de: 'Neuer Versuch später.',
        es: 'Se volverá a intentar.',
      }),
  );
}

async function readPortal(client, window, config, account) {
  let children = await childrenOrNone(client);
  const planning = await client.getPlanning(window.firstDay, window.lastDay, children);
  if (children.length === 0) {
    children = childrenOfPlanning(planning);
  }
  // Invoices are a module a municipality may not have bought: a portal
  // without them answers 404, which is "no invoices calendar", not a failure.
  const invoices = config.show_invoices ? await invoicesOrNull(client) : null;
  return {
    children,
    planning,
    invoices: invoices && markTreasury(invoices, account.treasuryInvoices),
  };
}

// The planning of the API names each child by its id: without the request
// that lists the children, the children are the ones the planning names,
// "Enfant <id>" until their names are known. The id is what the calendars
// hang on, so the names can come later without changing a calendar.
async function childrenOrNone(client) {
  try {
    return await client.getChildren();
  } catch (err) {
    if (err instanceof AgoraError && err.code === ERROR_CODES.UNMAPPED) {
      return [];
    }
    throw err;
  }
}

async function invoicesOrNull(client) {
  try {
    return await client.getInvoices();
  } catch (err) {
    const missing =
      err instanceof AgoraError &&
      ((err.code === ERROR_CODES.HTTP && err.status === 404) || err.code === ERROR_CODES.UNMAPPED);
    if (missing) {
      return null;
    }
    throw err;
  }
}

/** The children a planning names, when nothing else names them. */
export function childrenOfPlanning(planning) {
  const ids = [...new Set(planning.map((entry) => entry.childId))].sort();
  return ids.map((id) => ({ id, firstName: `Enfant ${id}`, lastName: null, name: `Enfant ${id}` }));
}
