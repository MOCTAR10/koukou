/**
 * Errors of the API client. Kept apart from client.ts (which reaches the
 * offline store) so the parsing stays a pure, testable function.
 */

export class ApiError extends Error {
  status: number;
  /**
   * The server's JSON answer, when there was one: some refusals carry data the
   * screen needs (409 `duplicates` of the farm registry, `existingAccount` of
   * an owner activation…). Read it with `errorBody`.
   */
  body: unknown;

  constructor(status: number, message: string, body?: unknown) {
    super(message);
    this.name = 'ApiError';
    this.status = status;
    this.body = body ?? null;
  }
}

/** French wording of the status codes, used when the server's text is missing or a raw framework one. */
const STATUS_MESSAGES: Record<number, string> = {
  400: 'Demande invalide. Vérifiez les informations saisies.',
  401: 'Session expirée ou identifiants refusés. Reconnectez-vous.',
  403: 'Vos droits ne permettent pas cette action (profil en consultation seule ou droit manquant). Contactez l’administrateur si besoin.',
  404: 'Élément introuvable.',
  408: 'Le serveur a mis trop de temps à répondre. Réessayez.',
  409: 'Cette opération entre en conflit avec des données existantes.',
  413: 'Le fichier ou la demande est trop volumineux.',
  422: 'Les informations saisies ne sont pas valides.',
  429: 'Trop de tentatives en peu de temps. Patientez une minute, puis réessayez.',
  500: 'Une erreur est survenue sur le serveur. Réessayez dans un instant ; si elle persiste, contactez le support.',
  502: 'Le serveur est momentanément indisponible. Réessayez dans un instant.',
  503: 'Le serveur est momentanément indisponible. Réessayez dans un instant.',
  504: 'Le serveur met trop de temps à répondre. Réessayez dans un instant.',
};

/** Raw framework / English texts that must never reach the screen (« Internal server error », « ThrottlerException: Too Many Requests »…). */
const RAW_ENGLISH =
  /^(?:[A-Za-z]*Exception\b.*|internal server error|bad request|unauthorized|forbidden(?: resource)?|not found|conflict|too many requests|service unavailable|bad gateway|gateway timeout|request timeout|payload too large|unprocessable entity|network error|failed to fetch|load failed)\.?$/i;

/** True for a message that is raw technical English rather than the French text of the API. */
export function isRawMessage(text: string): boolean {
  return RAW_ENGLISH.test(text.trim());
}

/** Generic French message of a status (also for 5xx not listed). */
export function statusMessage(status: number): string {
  return STATUS_MESSAGES[status] ?? (status >= 500 ? STATUS_MESSAGES[500] : 'La demande a échoué. Réessayez.');
}

/** French message of an error answer: Nest sends `message` as a string or a list. */
export function errorMessage(status: number, body: unknown): string {
  const msg = body && typeof body === 'object' ? (body as { message?: unknown }).message : undefined;
  if (Array.isArray(msg)) {
    const parts = msg.filter((m): m is string => typeof m === 'string' && !isRawMessage(m));
    if (parts.length) return parts.join(', ');
  }
  if (typeof msg === 'string' && msg && !isRawMessage(msg)) return msg;
  return statusMessage(status);
}

/** The error's JSON body typed as `T` (fields may be missing: check them). */
export function errorBody<T extends object>(err: unknown): Partial<T> | null {
  if (!(err instanceof ApiError)) return null;
  const body = err.body;
  return body && typeof body === 'object' ? (body as Partial<T>) : null;
}

/** Reads an error answer into an ApiError, keeping its JSON body. */
export async function apiErrorFrom(res: Response): Promise<ApiError> {
  let body: unknown = null;
  try {
    const text = await res.text();
    body = text ? (JSON.parse(text) as unknown) : null;
  } catch {
    body = null;
  }
  return new ApiError(res.status, errorMessage(res.status, body), body);
}
