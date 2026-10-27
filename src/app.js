// -----------------------------------------------------------------------------
// The integration: every handler Gladys calls, and the refresh timer.
//
// A calendar integration has no devices: it pushes calendars and events into
// the Gladys calendar of each user who enabled it (src/sync.js). Gladys shows
// them in the calendar view, and the scenes and the assistant read them like
// any other calendar once the user shares it with the household.
// -----------------------------------------------------------------------------

import { createLogger, applyLogLevel } from './logging.js';
import { normalizeConfig } from './config.js';
import { localize, pick } from './i18n.js';
import { NO_ACCOUNT, createSync, describeSyncError } from './sync.js';

const logger = createLogger({ name: 'app' });

/**
 * @param {import('@gladysassistant/integration-sdk').GladysIntegration} gladys
 * @param {object} [options] injected by the tests
 * @param {typeof fetch} [options.fetch]
 * @param {() => Date} [options.now]
 */
export function createApp(gladys, { fetch, now } = {}) {
  let config = normalizeConfig();
  let timer = null;

  const sync = createSync({ gladys, getConfig: () => config, fetch, now });

  function startTimer() {
    stopTimer();
    timer = setInterval(() => {
      sync.syncAll().catch((err) => logger.warn(`Scheduled sync failed: ${err.message}`));
    }, config.refresh_minutes * 60_000);
    timer.unref?.();
  }

  function stopTimer() {
    if (timer) {
      clearInterval(timer);
      timer = null;
    }
  }

  async function configure(raw) {
    config = normalizeConfig(raw);
    applyLogLevel(config);
    startTimer();
    await sync.syncAll();
  }

  // --- Configuration -------------------------------------------------------------
  gladys.onConfigUpdated(async (raw) => {
    await configure(raw);
  });

  // A user enabled or disabled the integration, changed their account, or
  // switched one of their calendars on or off.
  gladys.onCalendarAccountUpdated(async (userSelector) => {
    await sync.syncUser(userSelector);
  });

  gladys.onAction('sync_now', async () => describeSyncs(await sync.syncAll()));

  // --- Lifecycle ---------------------------------------------------------------
  gladys.on('connected', async () => {
    try {
      await configure(await gladys.getConfig());
    } catch (err) {
      logger.error('Post-connection initialization failed', err);
      await gladys
        .setConnectionStatus(false, {
          en: 'Initialization failed, check the integration logs.',
          fr: "L'initialisation a échoué, consultez les logs de l'intégration.",
          de: 'Die Initialisierung ist fehlgeschlagen, siehe die Protokolle der Integration.',
          es: 'La inicialización falló, consulte los registros de la integración.',
        })
        .catch(() => {});
    }
  });

  gladys.on('disconnected', () => {
    stopTimer();
  });

  return {
    stop: stopTimer,
    get config() {
      return config;
    },
    sync,
  };
}

/** The answer of "Sync now": one line per user. */
export function describeSyncs(states) {
  if (states.length === 0) {
    return NO_ACCOUNT;
  }
  return localize((language) =>
    states
      .map((state) => {
        const who = `${state.user.first_name || state.user.selector} – `;
        if (state.error) {
          return who + pick(language, describeSyncError(state.error));
        }
        const { children, events, published, skipped } = state.result;
        return (
          who +
          pick(language, {
            en: `${children} child(ren), ${events} event(s) in ${published} calendar(s)`,
            fr: `${children} enfant(s), ${events} événement(s) dans ${published} calendrier(s)`,
            de: `${children} Kind(er), ${events} Termin(e) in ${published} Kalender(n)`,
            es: `${children} niño(s), ${events} evento(s) en ${published} calendario(s)`,
          }) +
          (skipped
            ? pick(language, {
                en: `, ${skipped} switched off`,
                fr: `, ${skipped} désactivé(s)`,
                de: `, ${skipped} ausgeschaltet`,
                es: `, ${skipped} desactivado(s)`,
              })
            : '') +
          '.'
        );
      })
      .join('\n'),
  );
}
