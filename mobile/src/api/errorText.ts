/**
 * French text of any thrown value, for toasts and inline errors. Pure (no
 * React Native import) so it is unit-tested. Never returns « [object Object] »
 * or a raw English framework / network message.
 */

export const OFFLINE_TEXT = 'Pas de connexion au serveur. Vérifiez votre réseau et réessayez.';
export const FORBIDDEN_TEXT = 'Vous n’avez pas les droits nécessaires pour cette action.';
const DEFAULT_TEXT = 'Erreur inattendue.';

const STATUS_TEXT: Record<number, string> = {
  401: 'Session expirée. Reconnectez-vous.',
  403: FORBIDDEN_TEXT,
  404: 'Élément introuvable.',
  429: 'Trop de tentatives en peu de temps. Patientez une minute, puis réessayez.',
};

const NETWORK = /network request failed|failed to fetch|network error|load failed|networkerror|aborted|timeout/i;
const RAW_ENGLISH =
  /^(?:[A-Za-z]*Exception\b.*|internal server error|bad request|unauthorized|forbidden(?: resource)?|not found|conflict|too many requests|service unavailable|bad gateway|gateway timeout)\.?$/i;

export function errorText(e: unknown, fallback: string = DEFAULT_TEXT): string {
  if (typeof e === 'string') return e.trim() || fallback;
  if (!e || typeof e !== 'object') return fallback;
  const err = e as { name?: unknown; message?: unknown; status?: unknown };
  const message = typeof err.message === 'string' ? err.message.trim() : '';
  const status = typeof err.status === 'number' ? err.status : null;

  if (status !== null && status > 0) {
    const raw = !message || RAW_ENGLISH.test(message) || /^Erreur serveur \(\d+\)$/.test(message);
    if (!raw) return message;
    if (STATUS_TEXT[status]) return STATUS_TEXT[status];
    if (status >= 500) return 'Une erreur est survenue sur le serveur. Réessayez dans un instant.';
    return fallback;
  }
  if (err.name === 'NetworkTimeoutError' && message) return message;
  if (err.name === 'TypeError' || NETWORK.test(message)) return OFFLINE_TEXT;
  if (!message || RAW_ENGLISH.test(message) || message === '[object Object]') return fallback;
  return message;
}
