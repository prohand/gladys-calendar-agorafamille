// -----------------------------------------------------------------------------
// The words the integration says to the family, in every language of Gladys.
//
// The status of the Configuration screen and the action answers are
// `{ en, fr, de, es }` objects (see src/i18n.js), rendered in the reader's
// language. The calendars and their events are one user's: they are written
// once, in that user's language (`user.language`), with `pick`.
//
// The names of the activities stay the portal's own, in French.
// -----------------------------------------------------------------------------

import { ERROR_CODES } from './agora/client.js';
import { RESERVATION_STATUS } from './agora/parse.js';
import { localize, pick } from './i18n.js';

const STEPS = {
  login: { en: 'sign-in', fr: 'connexion', de: 'Anmeldung', es: 'inicio de sesión' },
  encrypt: {
    en: 'password encryption',
    fr: 'chiffrement du mot de passe',
    de: 'Passwortverschlüsselung',
    es: 'cifrado de la contraseña',
  },
  children: { en: 'children', fr: 'enfants', de: 'Kinder', es: 'hijos' },
  planning: { en: 'planning', fr: 'planning', de: 'Planung', es: 'planificación' },
  invoices: { en: 'invoices', fr: 'factures', de: 'Rechnungen', es: 'facturas' },
};

/**
 * What went wrong with the portal, for the Configuration screen and the
 * action answers.
 *
 * @param {import('./agora/client.js').AgoraError} error
 * @returns {{en: string, fr: string, de: string, es: string}}
 */
export function describeError(error) {
  const step = error?.step ? STEPS[error.step] : null;
  const where = (language) => (step ? ` (${pick(language, step)})` : '');
  const status = error?.status ? ` HTTP ${error.status}` : '';
  switch (error?.code) {
    case ERROR_CODES.CONFIG:
      return {
        en: 'Fill in the portal address, the login and the password in "My calendars".',
        fr: "Renseignez l'adresse du portail, l'identifiant et le mot de passe dans « Mes calendriers ».",
        de: 'Gib die Portaladresse, den Benutzernamen und das Passwort unter „Meine Kalender“ ein.',
        es: 'Indique la dirección del portal, el usuario y la contraseña en «Mis calendarios».',
      };
    case ERROR_CODES.AUTH:
      return localize(
        (language) =>
          pick(language, {
            en: 'The portal refused the login or the password',
            fr: "Le portail a refusé l'identifiant ou le mot de passe",
            de: 'Das Portal hat Benutzername oder Passwort abgelehnt',
            es: 'El portal rechazó el usuario o la contraseña',
          }) +
          `${where(language)}` +
          // The portal's own words, in French whatever the reader's language.
          (error.portalMessage ? ` : « ${error.portalMessage} ».` : '.'),
      );
    case ERROR_CODES.NETWORK:
      return localize(
        (language) =>
          pick(language, {
            en: 'The portal does not answer, it will be tried again',
            fr: 'Le portail ne répond pas, nouvel essai plus tard',
            de: 'Das Portal antwortet nicht, neuer Versuch später',
            es: 'El portal no responde, se volverá a intentar',
          }) + `${where(language)}.`,
      );
    case ERROR_CODES.UNMAPPED:
      if (error.step === 'encrypt') {
        return localize((language) =>
          pick(language, {
            en: 'A request of the portal is not known yet: password encryption. See the documentation.',
            fr: 'Une requête du portail n’est pas encore connue : chiffrement du mot de passe. Voir la documentation.',
            de: 'Eine Anfrage des Portals ist noch nicht bekannt: Passwortverschlüsselung. Siehe die Dokumentation.',
            es: 'Una petición del portal aún no se conoce: cifrado de la contraseña. Vea la documentación.',
          }),
        );
      }
      return localize(
        (language) =>
          pick(language, {
            en: 'Signed in to the portal. The request that reads the',
            fr: 'Connexion au portail réussie. La requête qui lit les',
            de: 'Am Portal angemeldet. Die Anfrage, die die',
            es: 'Sesión iniciada en el portal. La petición que lee los',
          }) +
          ` ${step ? pick(language, step) : '?'} ` +
          pick(language, {
            en: 'is not known yet: see the documentation.',
            fr: "n'est pas encore connue : voir la documentation.",
            de: 'liest, ist noch nicht bekannt: siehe die Dokumentation.',
            es: 'aún no se conoce: vea la documentación.',
          }),
      );
    default:
      return localize(
        (language) =>
          pick(language, {
            en: 'The portal answered something unexpected',
            fr: 'Le portail a répondu quelque chose d’inattendu',
            de: 'Das Portal hat etwas Unerwartetes geantwortet',
            es: 'El portal respondió algo inesperado',
          }) +
          `${where(language)}${status}` +
          (error?.portalMessage ? ` : « ${error.portalMessage} »` : '') +
          '. ' +
          pick(language, {
            en: 'See the integration logs.',
            fr: "Consultez les logs de l'intégration.",
            de: 'Siehe die Protokolle der Integration.',
            es: 'Consulte los registros de la integración.',
          }),
      );
  }
}

/** The name of a child's calendar: "Léa – Agora Famille". */
export function childCalendarName(child) {
  return `${child.name} – Agora Famille`;
}

/** The calendar of the invoices to pay. */
export const INVOICES_CALENDAR_NAME = {
  en: 'Agora Famille invoices',
  fr: 'Factures Agora Famille',
  de: 'Agora Famille Rechnungen',
  es: 'Facturas Agora Famille',
};

/** The descriptions of the calendars, shown in the calendar settings of Gladys. */
export const CALENDAR_DESCRIPTIONS = {
  child: {
    en: 'The days booked on the Agora Famille portal (read-only).',
    fr: 'Les jours réservés sur le portail Agora Famille (lecture seule).',
    de: 'Die im Agora-Famille-Portal gebuchten Tage (nur lesend).',
    es: 'Los días reservados en el portal Agora Famille (solo lectura).',
  },
  invoices: {
    en: 'The invoices to pay, on their due date (read-only).',
    fr: 'Les factures à payer, à leur date limite (lecture seule).',
    de: 'Die offenen Rechnungen, am Fälligkeitstag (nur lesend).',
    es: 'Las facturas por pagar, en su fecha límite (solo lectura).',
  },
};

/** How a reservation state reads, in the description of an event. */
export const STATUS_LABELS = {
  [RESERVATION_STATUS.RESERVED]: {
    en: 'Booked',
    fr: 'Réservé',
    de: 'Gebucht',
    es: 'Reservado',
  },
  [RESERVATION_STATUS.REQUESTED]: {
    en: 'Request pending',
    fr: 'Demande en attente',
    de: 'Anfrage offen',
    es: 'Solicitud pendiente',
  },
};

/** Added to the name of a day the municipality has not accepted yet. */
export const PENDING_SUFFIX = {
  en: '(pending)',
  fr: '(en attente)',
  de: '(offen)',
  es: '(pendiente)',
};

/** The name of the event of an invoice: "Facture à payer : 64,80 €". */
export function invoiceEventName(invoice, language) {
  return (
    pick(language, {
      en: 'Invoice to pay: ',
      fr: 'Facture à payer : ',
      de: 'Rechnung zu zahlen: ',
      es: 'Factura por pagar: ',
    }) + formatEuros(invoice.remaining, language)
  );
}

/** The description of the event of an invoice: its label, and what is left when partly paid. */
export function invoiceEventDescription(invoice, language) {
  const lines = [invoice.label];
  if (invoice.remaining !== invoice.amount) {
    lines.push(
      pick(language, {
        en: `Amount: ${formatEuros(invoice.amount, language)}, left to pay: ${formatEuros(invoice.remaining, language)}`,
        fr: `Montant : ${formatEuros(invoice.amount, language)}, reste à payer : ${formatEuros(invoice.remaining, language)}`,
        de: `Betrag: ${formatEuros(invoice.amount, language)}, offen: ${formatEuros(invoice.remaining, language)}`,
        es: `Importe: ${formatEuros(invoice.amount, language)}, por pagar: ${formatEuros(invoice.remaining, language)}`,
      }),
    );
  }
  return lines.join('\n');
}

/** An amount in euros, the reader's way: 45,20 € / €45.20, never rounded. */
export function formatEuros(amount, language) {
  const locale = { en: 'en-IE', fr: 'fr-FR', de: 'de-DE', es: 'es-ES' }[language] ?? 'en-IE';
  return new Intl.NumberFormat(locale, {
    style: 'currency',
    currency: 'EUR',
    minimumFractionDigits: 2,
    maximumFractionDigits: 9,
  }).format(amount);
}
