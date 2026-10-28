import { beforeEach, describe, expect, it, vi } from 'vitest';

import type { PublicUser } from './types';

// Simulates iOS/Android: no localStorage, session file + secure token store.
const device = vi.hoisted(() => ({
  files: new Map<string, string>(),
  vault: { token: null as string | null, failSet: false },
}));

vi.mock('@/offline/persistent-kv', () => ({
  persistentKv: {
    getItem: (k: string) => device.files.get(k) ?? null,
    setItem: (k: string, v: string) => void device.files.set(k, v),
    removeItem: (k: string) => void device.files.delete(k),
  },
}));

vi.mock('./secure-token', () => ({
  secureToken: {
    get: () => device.vault.token,
    set: (t: string) => {
      if (device.vault.failSet) throw new Error('keychain locked');
      device.vault.token = t;
    },
    remove: () => {
      device.vault.token = null;
    },
  },
}));

const user: PublicUser = { id: 'u-1', fullName: 'M. Test', phone: '+241 00 00 00 00', role: 'PROPRIETAIRE' };

/** Fresh module = app restart (in-memory session cache is lost). */
async function restart() {
  vi.resetModules();
  return import('./token');
}

describe('token — stockage sécurisé (iOS/Android)', () => {
  beforeEach(() => {
    device.files.clear();
    device.vault.token = null;
    device.vault.failSet = false;
  });

  it('le jeton va dans le coffre, jamais en clair dans le fichier de session', async () => {
    const { saveSession } = await restart();
    saveSession({ token: 'jwt-secret', user, farms: [], activeFarmId: 'f-1' });

    expect(device.vault.token).toBe('jwt-secret');
    const file = device.files.get('koukou.session') ?? '';
    expect(file).not.toContain('jwt-secret');
    expect(JSON.parse(file)).toMatchObject({ user: { id: 'u-1' }, activeFarmId: 'f-1' });
  });

  it('après redémarrage : session reconstruite avec le jeton du coffre', async () => {
    (await restart()).saveSession({ token: 'jwt-1', user, farms: [] });
    const s = (await restart()).loadSession();
    expect(s?.token).toBe('jwt-1');
    expect(s?.user.id).toBe('u-1');
  });

  it('migration : un ancien fichier avec jeton en clair est déplacé sans déconnexion', async () => {
    device.files.set('koukou.session', JSON.stringify({ token: 'legacy-jwt', user, farms: [] }));
    const s = (await restart()).loadSession();

    expect(s?.token).toBe('legacy-jwt');
    expect(device.vault.token).toBe('legacy-jwt');
    expect(device.files.get('koukou.session')).not.toContain('legacy-jwt');
  });

  it('jeton absent du coffre (sauvegarde restaurée) : session effacée', async () => {
    device.files.set('koukou.session', JSON.stringify({ user, farms: [] }));
    expect((await restart()).loadSession()).toBeNull();
    expect(device.files.has('koukou.session')).toBe(false);
  });

  it('déconnexion : fichier et coffre vidés', async () => {
    const { saveSession, clearSession, loadSession } = await restart();
    saveSession({ token: 'jwt', user, farms: [] });
    clearSession();
    expect(device.vault.token).toBeNull();
    expect(device.files.has('koukou.session')).toBe(false);
    expect(loadSession()).toBeNull();
  });

  it('coffre indisponible : session en mémoire, jeton jamais écrit en clair', async () => {
    device.vault.failSet = true;
    const { saveSession, loadSession } = await restart();
    saveSession({ token: 'jwt-mem', user, farms: [] });

    expect(loadSession()?.token).toBe('jwt-mem');
    expect(device.files.get('koukou.session')).not.toContain('jwt-mem');
  });
});
