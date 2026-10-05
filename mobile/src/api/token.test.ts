import { beforeEach, describe, expect, it } from 'vitest';

import { clearSession, loadSession, saveSession } from './token';
import type { PublicUser } from './types';

const user: PublicUser = { id: 'u-1', fullName: 'M. Test', phone: '+241 00 00 00 00', role: 'PROPRIETAIRE' };

describe('token (session store)', () => {
  beforeEach(() => clearSession());

  it('retourne null sans session', () => {
    expect(loadSession()).toBeNull();
  });

  it('persiste et relit une session', () => {
    saveSession({
      token: 'jwt-abc',
      user,
      farms: [
        {
          id: 'f-1',
          name: 'Ferme Demo',
          administrativeCity: 'Libreville',
          defaultSacKg: 50,
          isVerified: true,
          active: true,
          logoUrl: null,
        },
      ],
    });
    const s = loadSession();
    expect(s?.token).toBe('jwt-abc');
    expect(s?.farms[0].id).toBe('f-1');
    expect(s?.user.role).toBe('PROPRIETAIRE');
  });

  it('clearSession efface la session', () => {
    saveSession({ token: 'jwt', user, farms: [] });
    clearSession();
    expect(loadSession()).toBeNull();
  });

  it('écrase une session existante', () => {
    saveSession({ token: 'old', user, farms: [] });
    saveSession({ token: 'new', user, farms: [] });
    expect(loadSession()?.token).toBe('new');
  });
});