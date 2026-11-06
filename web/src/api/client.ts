import { markOffline, markOnline } from '../offline/connectivity';
import { readCached, writeCached } from '../offline/readCache';
import { ApiError, apiErrorFrom } from './errors';
import { markSessionExpired } from './session-expiry';

export { ApiError, errorBody } from './errors';

export const API_BASE = import.meta.env.VITE_API_URL ?? 'http://localhost:3000';

/** A hung request on a poor connection must end up as "offline", not as a spinner. */
const READ_TIMEOUT_MS = 30_000;
const WRITE_TIMEOUT_MS = 45_000;

const TOKEN_KEY = 'koukou.token';
const USER_KEY = 'koukou.user';

/**
 * Account roles (backend `UserRole`). ACHETEUR: Market customer only, never a
 * farm screen. INSTITUTION: programme institution, farm screens of the farms
 * in its scope (the server enforces it). OPERATEUR is refused at sign-in.
 */
export type Role = 'PLATFORM_ADMIN' | 'PROPRIETAIRE' | 'ELEVEUR' | 'ACHETEUR' | 'INSTITUTION';

export interface AuthUser {
  id: string;
  fullName: string;
  role: Role;
}

/** The server can't be reached: no answer at all, or its proxy reports it down. */
export class OfflineError extends ApiError {
  constructor(message = 'Pas de connexion au serveur. Cette action sera possible une fois reconnecté.') {
    super(0, message);
    this.name = 'OfflineError';
  }
}

const NOT_CACHED_MESSAGE =
  'Hors ligne : ces données n’ont pas encore été chargées sur cet appareil. Elles seront disponibles une fois reconnecté.';

export function getToken(): string | null {
  return localStorage.getItem(TOKEN_KEY);
}

export function setSession(token: string, user: AuthUser): void {
  localStorage.setItem(TOKEN_KEY, token);
  localStorage.setItem(USER_KEY, JSON.stringify(user));
}

export function getStoredUser(): AuthUser | null {
  const raw = localStorage.getItem(USER_KEY);
  if (!raw) return null;
  try {
    return JSON.parse(raw) as AuthUser;
  } catch {
    return null;
  }
}

export function clearSession(): void {
  localStorage.removeItem(TOKEN_KEY);
  localStorage.removeItem(USER_KEY);
}

function buildUrl(path: string): string {
  if (path.startsWith('http')) return path;
  return `${API_BASE}${path.startsWith('/') ? path : `/${path}`}`;
}

function handleUnauthorized(res: Response): void {
  if (res.status === 401 && getToken()) {
    clearSession();
    // The sign-in page says the session expired (8 h for an institution).
    markSessionExpired();
    if (typeof window !== 'undefined' && window.location.pathname !== '/login') {
      window.location.replace('/login');
    }
  }
}

interface RequestOptions {
  /** Skip the saved answers: for decisions that need the server's current state. */
  fresh?: boolean;
  /** Overrides the default read/write timeout (uploads take longer). */
  timeoutMs?: number;
}

/** Multipart uploads: a stalled transfer must end in an error, not in an endless spinner. */
const UPLOAD_TIMEOUT_MS = 60_000;

async function fallBackOffline<T>(method: string, path: string, options?: RequestOptions): Promise<T> {
  markOffline();
  if (method === 'GET' && !options?.fresh) {
    const userId = getStoredUser()?.id;
    const cached = userId ? await readCached(userId, path) : null;
    if (cached) return cached.data as T;
    throw new OfflineError(NOT_CACHED_MESSAGE);
  }
  throw new OfflineError();
}

async function request<T>(method: string, path: string, body?: unknown, options?: RequestOptions): Promise<T> {
  const headers: Record<string, string> = { Accept: 'application/json' };
  const token = getToken();
  if (token) headers.Authorization = `Bearer ${token}`;
  // FormData sets its own multipart Content-Type (with the boundary).
  const multipart = body instanceof FormData;
  if (body !== undefined && !multipart) headers['Content-Type'] = 'application/json';

  let res: Response;
  try {
    res = await fetch(buildUrl(path), {
      method,
      headers,
      body: multipart ? body : body !== undefined ? JSON.stringify(body) : undefined,
      signal: AbortSignal.timeout(options?.timeoutMs ?? (method === 'GET' ? READ_TIMEOUT_MS : WRITE_TIMEOUT_MS)),
    });
  } catch {
    return fallBackOffline<T>(method, path, options);
  }
  if (res.status === 502 || res.status === 503 || res.status === 504) {
    return fallBackOffline<T>(method, path, options);
  }
  markOnline();

  handleUnauthorized(res);

  if (!res.ok) throw await apiErrorFrom(res);

  if (res.status === 204) return undefined as T;
  // Nest sends `null` (e.g. GET caisse/current with no open session) as an
  // empty 200 body: res.json() would throw "Unexpected end of JSON input".
  const text = await res.text();
  const data = (text ? JSON.parse(text) : null) as T;
  if (method === 'GET') {
    const userId = getStoredUser()?.id;
    if (userId) void writeCached(userId, path, data);
  }
  return data;
}

export const api = {
  get: <T>(path: string): Promise<T> => request<T>('GET', path),
  /** Same as get, but fails when offline instead of answering from the saved data. */
  getFresh: <T>(path: string): Promise<T> => request<T>('GET', path, undefined, { fresh: true }),
  post: <T>(path: string, body?: unknown): Promise<T> => request<T>('POST', path, body),
  patch: <T>(path: string, body?: unknown): Promise<T> => request<T>('PATCH', path, body),
  put: <T>(path: string, body?: unknown): Promise<T> => request<T>('PUT', path, body),
  del: <T>(path: string): Promise<T> => request<T>('DELETE', path),
  /**
   * Multipart POST (files, CSV import…). Like the other writes it needs a
   * connection: offline it throws OfflineError.
   */
  upload: <T>(path: string, form: FormData): Promise<T> =>
    request<T>('POST', path, form, { timeoutMs: UPLOAD_TIMEOUT_MS }),
  /**
   * An authenticated file as a Blob (a photo shown in the page): same 401
   * handling as the other calls, never cached offline.
   */
  async blob(path: string): Promise<Blob> {
    const headers: Record<string, string> = { Accept: '*/*' };
    const token = getToken();
    if (token) headers.Authorization = `Bearer ${token}`;
    let res: Response;
    try {
      res = await fetch(buildUrl(path), { headers, signal: AbortSignal.timeout(WRITE_TIMEOUT_MS) });
    } catch {
      markOffline();
      throw new OfflineError('Hors ligne : ce fichier pourra être affiché une fois reconnecté.');
    }
    handleUnauthorized(res);
    if (!res.ok) throw await apiErrorFrom(res);
    return res.blob();
  },
  /** Télécharge un PDF/binaire et déclenche le téléchargement navigateur. */
  async download(path: string, filename: string): Promise<void> {
    const headers: Record<string, string> = { Accept: 'application/pdf' };
    const token = getToken();
    if (token) headers.Authorization = `Bearer ${token}`;
    let res: Response;
    try {
      res = await fetch(buildUrl(path), { headers, signal: AbortSignal.timeout(WRITE_TIMEOUT_MS) });
    } catch {
      markOffline();
      throw new OfflineError('Hors ligne : ce document pourra être téléchargé une fois reconnecté.');
    }
    handleUnauthorized(res);
    if (!res.ok) throw await apiErrorFrom(res);
    const blob = await res.blob();
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = filename;
    a.click();
    URL.revokeObjectURL(url);
  },
};