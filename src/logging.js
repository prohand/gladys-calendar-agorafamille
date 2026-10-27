// -----------------------------------------------------------------------------
// The log level, switchable from the Configuration screen.
//
// A family portal answers in ways nobody can watch from Gladys: a login page
// instead of data, a field renamed by an update of the portal. The debug
// channel is where those show up, and reaching it used to mean setting
// `LOG_LEVEL=debug` on the container — an environment variable, i.e. something
// a user cannot do from the Gladys UI.
//
// The SDK logger re-reads `process.env.LOG_LEVEL` on every line, so writing
// that variable is enough: it takes effect at once, for every logger already
// created. The operator's own `LOG_LEVEL` is the baseline, captured once: the
// switch raises the level to debug while it is on and puts their value back
// when it goes off.
// -----------------------------------------------------------------------------

import { createLogger } from '@gladysassistant/integration-sdk';

const logger = createLogger({ name: 'logging' });

/** `LOG_LEVEL` as the container was started with; `undefined` = SDK default (info). */
const BASELINE = process.env.LOG_LEVEL;

/**
 * Apply the log level a configuration asks for.
 *
 * @param {{debug_logs?: boolean}} config normalized configuration
 * @returns {string} the level in force afterwards
 */
export function applyLogLevel(config) {
  const wanted = config?.debug_logs ? 'debug' : BASELINE;
  const current = process.env.LOG_LEVEL;
  if (wanted === undefined) {
    delete process.env.LOG_LEVEL;
  } else {
    process.env.LOG_LEVEL = wanted;
  }
  // Said at info, so the line survives the level it announces.
  if (current !== process.env.LOG_LEVEL) {
    logger.info(
      config?.debug_logs
        ? 'Detailed logs turned on'
        : `Detailed logs turned off (level: ${process.env.LOG_LEVEL ?? 'info'})`,
    );
  }
  return process.env.LOG_LEVEL ?? 'info';
}

export { createLogger };
