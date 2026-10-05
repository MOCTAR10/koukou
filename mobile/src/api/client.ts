import Constants from 'expo-constants';
import { Platform } from 'react-native';

import { loadSession } from './token';

// URL de l'API NestJS. Auto-détectée depuis `hostUri` d'Expo (démo sur
// appareil/émulateur) ; surcharge: remplacer `null` par une URL fixe.
const API_URL_OVERRIDE: string | null = null;

export function resolveApiBaseUrl(hostUri: string | null | undefined, platformOs: string): string {
  if (API_URL_OVERRIDE) return API_URL_OVERRIDE;
  if (hostUri) {
    const host = hostUri.split(':')[0];
    if (host) return `http://${host}:3000`;
  }
  return platformOs === 'android' ? 'http://10.0.2.2:3000' : 'http://localhost:3000';
}

export const API_BASE_URL = resolveApiBaseUrl(Constants.expoConfig?.hostUri ?? null, Platform.OS);

export class ApiError extends Error {
  readonly status: number;

  constructor(status: number, message: string) {
    super(message);
    this.status = status;
  }
}

function extractMessage(body: unknown): string | null {
  if (body && typeof body === 'object') {
    const m = (body as { message?: unknown }).message;
    if (typeof m === 'string' && m.trim()) return m;
    if (Array.isArray(m) && m.length > 0 && typeof m[0] === 'string') return m[0];
  }
  return null;
}

interface ApiInit {
  method?: string;
  body?: unknown;
}

const REQUEST_TIMEOUT_MS = 15_000;
/** Les uploads passent par un réseau souvent lent (mobile 2G/3G) : marge plus large. */
const UPLOAD_TIMEOUT_MS = 60_000;

export async function apiFetch<T>(path: string, init: ApiInit = {}): Promise<T> {
  const session = loadSession();
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);

  let res: Response;
  try {
    res = await fetch(`${API_BASE_URL}${path}`, {
      method: init.method ?? 'GET',
      headers: {
        'Content-Type': 'application/json',
        ...(session ? { Authorization: `Bearer ${session.token}` } : {}),
      },
      body: init.body != null ? JSON.stringify(init.body) : undefined,
      signal: controller.signal,
    });
  } catch (e: unknown) {
    if (controller.signal.aborted) {
      throw new Error('Le serveur ne répond pas. Vérifiez votre connexion et réessayez.');
    }
    throw e;
  } finally {
    clearTimeout(timer);
  }

  const contentType = res.headers.get('content-type') ?? '';
  let body: unknown = null;
  if (contentType.includes('application/json')) {
    try {
      body = await res.json();
    } catch {
      body = null;
    }
  }

  if (!res.ok) {
    const message = extractMessage(body) ?? `Erreur serveur (${res.status})`;
    throw new ApiError(res.status, message);
  }

  return body as T;
}

/** Requête multipart (upload de fichier). `Content-Type` n'est pas défini ici :
 *  fetch doit ajouter lui-même la boundary du FormData. */
export async function apiUpload<T>(
  path: string,
  form: FormData,
  method = 'POST',
): Promise<T> {
  const session = loadSession();
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), UPLOAD_TIMEOUT_MS);

  let res: Response;
  try {
    res = await fetch(`${API_BASE_URL}${path}`, {
      method,
      headers: session ? { Authorization: `Bearer ${session.token}` } : {},
      body: form,
      signal: controller.signal,
    });
  } catch (e: unknown) {
    if (controller.signal.aborted) {
      throw new Error('Le serveur ne répond pas. Vérifiez votre connexion et réessayez.');
    }
    throw e;
  } finally {
    clearTimeout(timer);
  }

  const contentType = res.headers.get('content-type') ?? '';
  let body: unknown = null;
  if (contentType.includes('application/json')) {
    try {
      body = await res.json();
    } catch {
      body = null;
    }
  }

  if (!res.ok) {
    const message = extractMessage(body) ?? `Erreur serveur (${res.status})`;
    throw new ApiError(res.status, message);
  }

  return body as T;
}