import { describe, expect, it } from 'vitest';

import { readLoginAnswer } from './session-rules';

const user = { id: 'u-1', fullName: 'M. Test', phone: '+24177000000', role: 'PROPRIETAIRE' };

describe('readLoginAnswer', () => {
  it('ouvre une session avec un jeton et un utilisateur', () => {
    expect(readLoginAnswer({ accessToken: 'jwt', user })).toEqual({ kind: 'session', accessToken: 'jwt', user });
  });

  it('accepte la session institutionnelle de 8 h (expiresIn en plus)', () => {
    const answer = readLoginAnswer({ accessToken: 'jwt', expiresIn: 28800, user: { ...user, role: 'INSTITUTION' } });
    expect(answer.kind).toBe('session');
  });

  it('demande le code SMS quand otpRequired est renvoyé', () => {
    const answer = readLoginAnswer({
      otpRequired: true,
      challengeId: '7c1f3a52-0000-4000-8000-000000000001',
      expiresAt: '2026-11-06T10:05:00.000Z',
      sentTo: '+241 •• •• 12',
    });
    expect(answer).toEqual({
      kind: 'otp',
      challenge: {
        challengeId: '7c1f3a52-0000-4000-8000-000000000001',
        expiresAt: '2026-11-06T10:05:00.000Z',
        sentTo: '+241 •• •• 12',
      },
    });
  });

  it('tolère un défi sans numéro masqué ni échéance', () => {
    const answer = readLoginAnswer({ otpRequired: true, challengeId: 'c-1' });
    expect(answer).toEqual({ kind: 'otp', challenge: { challengeId: 'c-1', sentTo: '', expiresAt: null } });
  });

  it('ne stocke jamais une session sans jeton', () => {
    expect(readLoginAnswer({ otpRequired: true }).kind).toBe('invalid');
    expect(readLoginAnswer({ user }).kind).toBe('invalid');
    expect(readLoginAnswer({ accessToken: '', user }).kind).toBe('invalid');
    expect(readLoginAnswer({ accessToken: 'jwt' }).kind).toBe('invalid');
    expect(readLoginAnswer({ accessToken: 'jwt', user: { fullName: 'X' } }).kind).toBe('invalid');
    expect(readLoginAnswer(null).kind).toBe('invalid');
    expect(readLoginAnswer('ok').kind).toBe('invalid');
  });
});
