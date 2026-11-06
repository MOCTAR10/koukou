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

/** French message of an error answer: Nest sends `message` as a string or a list. */
export function errorMessage(status: number, body: unknown): string {
  const msg = body && typeof body === 'object' ? (body as { message?: unknown }).message : undefined;
  if (Array.isArray(msg)) {
    const parts = msg.filter((m): m is string => typeof m === 'string');
    if (parts.length) return parts.join(', ');
  }
  if (typeof msg === 'string' && msg) return msg;
  return `Erreur serveur (${status})`;
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
