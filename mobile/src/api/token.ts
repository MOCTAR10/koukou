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

function webStore(): WebStorage | null {
  const g = globalThis as unknown as { localStorage?: WebStorage };
  return g.localStorage ?? null;
}

export function saveSession(session: StoredSession | null): void {
  memory = session;
  const store = webStore();
  if (!store) return;
  if (session == null) {
    store.removeItem(KEY);
  } else {
    store.setItem(KEY, JSON.stringify(session));
  }
}

export function loadSession(): StoredSession | null {
  if (memory) return memory;
  const store = webStore();
  const raw = store?.getItem(KEY);
  if (raw) {
    try {
      memory = JSON.parse(raw) as StoredSession;
      return memory;
    } catch {
      saveSession(null);
    }
  }
  return memory;
}

export function clearSession(): void {
  saveSession(null);
}