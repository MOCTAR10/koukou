import { persistentKv } from '@/offline/persistent-kv';
import { secureToken } from './secure-token';
import type { Farm, PublicUser } from './types';

export interface StoredSession {
  token: string;
  user: PublicUser;
  farms: Farm[];
  activeFarmId?: string;
  /** Domaine d'exploitation actif : élevage (aviculture) ou agriculture. */
  mode?: 'aviculture' | 'agriculture';
}

const KEY = 'koukou.session';
let memory: StoredSession | null = null;

interface WebStorage {
  getItem(key: string): string | null;
  setItem(key: string, value: string): void;
  removeItem(key: string): void;
}

function localStore(): WebStorage | null {
  return (globalThis as unknown as { localStorage?: WebStorage }).localStorage ?? null;
}

function webStore(): WebStorage | null {
  // Native: persist the session on disk so an app restart doesn't log out.
  return localStore() ?? persistentKv;
}

/**
 * Native only (no localStorage): the token goes to the Keychain/Keystore and
 * the session file keeps only non-secret data (user, farms, active farm).
 */
function tokenVault() {
  return localStore() ? null : secureToken;
}

function withoutToken(session: StoredSession): Omit<StoredSession, 'token'> {
  const { token: _token, ...rest } = session;
  return rest;
}

export function saveSession(session: StoredSession | null): void {
  memory = session;
  const store = webStore();
  if (!store) return;
  const vault = tokenVault();
  if (session == null) {
    store.removeItem(KEY);
    vault?.remove();
    return;
  }
  if (!vault) {
    store.setItem(KEY, JSON.stringify(session));
    return;
  }
  try {
    vault.set(session.token);
  } catch {
    // Secure store unavailable: the token lives in memory for this run only,
    // never in plain text on disk (re-login after restart).
  }
  store.setItem(KEY, JSON.stringify(withoutToken(session)));
}

export function loadSession(): StoredSession | null {
  if (memory) return memory;
  const store = webStore();
  const raw = store?.getItem(KEY);
  if (!raw) return null;
  let parsed: Partial<StoredSession>;
  try {
    parsed = JSON.parse(raw) as Partial<StoredSession>;
  } catch {
    saveSession(null);
    return null;
  }
  const vault = tokenVault();
  if (vault) {
    if (parsed.token) {
      // Session saved before the secure store: move the plain-text token
      // into it (rewrites the file without the token). No forced logout.
      saveSession(parsed as StoredSession);
      return memory;
    }
    const token = vault.get();
    if (!token) {
      // Token gone (restored backup, keystore reset): session unusable.
      saveSession(null);
      return null;
    }
    parsed.token = token;
  }
  memory = parsed as StoredSession;
  return memory;
}

export function clearSession(): void {
  saveSession(null);
}
