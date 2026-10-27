// -----------------------------------------------------------------------------
// Calendar days, the way the portal and the family count them.
//
// "Tomorrow's lunch" is a day in France, not a UTC instant: at 00:30 in Paris
// it is still yesterday in UTC, and a container usually runs in UTC. Every day
// the integration reasons about is a `YYYY-MM-DD` string in the portal's own
// time zone, computed here and nowhere else.
// -----------------------------------------------------------------------------

/** Agora Famille serves French municipalities. */
export const PORTAL_TIME_ZONE = 'Europe/Paris';

const dayFormatter = new Intl.DateTimeFormat('en-CA', {
  timeZone: PORTAL_TIME_ZONE,
  year: 'numeric',
  month: '2-digit',
  day: '2-digit',
});

/**
 * The calendar day of an instant, in the portal's time zone.
 *
 * @param {Date|number} [instant]
 * @returns {string} `YYYY-MM-DD`
 */
export function dayOf(instant = new Date()) {
  return dayFormatter.format(instant instanceof Date ? instant : new Date(instant));
}

/**
 * A day plus (or minus) a number of days. Pure calendar arithmetic, done at
 * noon UTC so no daylight saving change can move it to the next day.
 *
 * @param {string} day `YYYY-MM-DD`
 * @param {number} offset days to add
 * @returns {string} `YYYY-MM-DD`
 */
export function addDays(day, offset) {
  const date = new Date(`${day}T12:00:00Z`);
  date.setUTCDate(date.getUTCDate() + offset);
  return date.toISOString().slice(0, 10);
}

/**
 * Whole days from one day to another (negative when `to` is before `from`).
 *
 * @param {string} from `YYYY-MM-DD`
 * @param {string} to `YYYY-MM-DD`
 */
export function daysBetween(from, to) {
  return Math.round((Date.parse(`${to}T12:00:00Z`) - Date.parse(`${from}T12:00:00Z`)) / 86400000);
}

/**
 * A date as the portal writes it, as a day.
 *
 * Seen in the wild: `2026-11-05`, `2026-11-05T00:00:00`, `05/11/2026`,
 * `05/11/26`, `20261105`, and epoch milliseconds. Anything else is `null`,
 * never a guess: a wrong day shows the wrong lunch.
 *
 * @returns {string|null} `YYYY-MM-DD`
 */
export function parseDay(value) {
  if (value === undefined || value === null || value === '') {
    return null;
  }
  if (typeof value === 'number' && Number.isFinite(value)) {
    return dayOf(value);
  }
  const text = String(value).trim();
  let match = /^(\d{4})-(\d{2})-(\d{2})(?:$|[T ])/.exec(text);
  if (match) {
    // A full timestamp with a zone is an instant: take its day in Paris.
    if (/T.*(Z|[+-]\d{2}:?\d{2})$/.test(text)) {
      const instant = Date.parse(text);
      return Number.isNaN(instant) ? null : dayOf(instant);
    }
    return valid(match[1], match[2], match[3]);
  }
  // `26/10/2026`, or `26/10/2026 08:00:00` as the API writes a start time.
  match = /^(\d{1,2})[/.-](\d{1,2})[/.-](\d{2}|\d{4})(?:[ T]\d{1,2}:\d{2}(?::\d{2})?)?$/.exec(text);
  if (match) {
    const year = match[3].length === 2 ? `20${match[3]}` : match[3];
    return valid(year, match[2].padStart(2, '0'), match[1].padStart(2, '0'));
  }
  match = /^(\d{4})(\d{2})(\d{2})$/.exec(text);
  if (match) {
    return valid(match[1], match[2], match[3]);
  }
  return null;
}

/**
 * The time of day a portal date carries, `HH:MM` in Paris.
 *
 * `26/10/2026 08:00:00` (the API) and `2026-10-26T08:00:00` (a local ISO
 * string) carry one; a bare day, or an instant with a zone (which would need a
 * conversion the portal never asks for), is `null`.
 *
 * @returns {string|null} `HH:MM`
 */
export function parseTime(value) {
  if (typeof value !== 'string') {
    return null;
  }
  const match =
    /^(?:\d{4}-\d{2}-\d{2}|\d{1,2}[/.-]\d{1,2}[/.-]\d{2,4})[ T](\d{1,2}):(\d{2})(?::\d{2}(?:\.\d+)?)?$/.exec(
      value.trim(),
    );
  if (!match || Number(match[1]) > 23 || Number(match[2]) > 59) {
    return null;
  }
  return `${match[1].padStart(2, '0')}:${match[2]}`;
}

const partsFormatter = new Intl.DateTimeFormat('en-GB', {
  timeZone: PORTAL_TIME_ZONE,
  hourCycle: 'h23',
  year: 'numeric',
  month: '2-digit',
  day: '2-digit',
  hour: '2-digit',
  minute: '2-digit',
  second: '2-digit',
});

/** How far Paris is ahead of UTC at an instant, in milliseconds. */
function parisOffset(instant) {
  const parts = Object.fromEntries(
    partsFormatter.formatToParts(instant).map(({ type, value }) => [type, Number(value)]),
  );
  const asUtc = Date.UTC(
    parts.year,
    parts.month - 1,
    parts.day,
    parts.hour,
    parts.minute,
    parts.second,
  );
  return asUtc - Math.floor(instant / 1000) * 1000;
}

/**
 * The instant of a wall-clock time in Paris, as an ISO string in UTC.
 *
 * The offset is read twice, the second time at the instant found, so a time
 * on the day of a daylight saving change lands on the right side of it.
 *
 * @param {string} day `YYYY-MM-DD`
 * @param {string} time `HH:MM`
 * @returns {string} e.g. `2026-10-26T07:00:00.000Z` for 08:00 in winter
 */
export function parisInstant(day, time) {
  const [year, month, date] = day.split('-').map(Number);
  const [hour, minute] = time.split(':').map(Number);
  const wall = Date.UTC(year, month - 1, date, hour, minute);
  const first = wall - parisOffset(wall);
  return new Date(wall - parisOffset(first)).toISOString();
}

function valid(year, month, day) {
  const iso = `${year}-${month}-${day}`;
  const date = new Date(`${iso}T12:00:00Z`);
  return !Number.isNaN(date.getTime()) && date.toISOString().slice(0, 10) === iso ? iso : null;
}

/**
 * A day for a reader, in their language: "Thu 5 Nov" / "jeu. 5 nov.".
 *
 * @param {string} day `YYYY-MM-DD`
 * @param {string} language `en` | `fr` | `de` | `es`
 */
export function formatDay(day, language) {
  const locale = { en: 'en-GB', fr: 'fr-FR', de: 'de-DE', es: 'es-ES' }[language] ?? 'en-GB';
  return new Intl.DateTimeFormat(locale, {
    timeZone: 'UTC',
    weekday: 'short',
    day: 'numeric',
    month: 'short',
  }).format(new Date(`${day}T12:00:00Z`));
}
