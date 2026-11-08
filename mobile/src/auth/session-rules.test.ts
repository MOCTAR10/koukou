import { describe, expect, it } from 'vitest';

import { isSessionRevoked, readLoginAnswer, resolveActiveFarmId } from './session-rules';

describe('isSessionRevoked', () => {
  it('401 only: network errors and 5xx keep the session', () => {
    expect(isSessionRevoked({ status: 401 })).toBe(true);
    expect(isSessionRevoked({ status: 403 })).toBe(false);
    expect(isSessionRevoked({ status: 503 })).toBe(false);
    expect(isSessionRevoked(new TypeError('Network request failed'))).toBe(false);
    expect(isSessionRevoked(null)).toBe(false);
  });
});

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

describe('resolveActiveFarmId', () => {
  const farms = [{ id: 'f-1' }, { id: 'f-2' }];

  it('garde la ferme choisie si elle est toujours rattachée', () => {
    expect(resolveActiveFarmId(farms, 'f-2', 'PROPRIETAIRE')).toBe('f-2');
  });

  it('retombe sur la première ferme quand le choix a disparu', () => {
    expect(resolveActiveFarmId(farms, 'f-9', 'INSTITUTION')).toBe('f-1');
    expect(resolveActiveFarmId(farms, undefined, 'ELEVEUR')).toBe('f-1');
  });

  it('aucune ferme : identifiant vide (aucun appel /farms//…)', () => {
    expect(resolveActiveFarmId([], 'f-1', 'PROPRIETAIRE')).toBe('');
  });

  it('un acheteur n’a jamais de ferme active', () => {
    expect(resolveActiveFarmId(farms, 'f-1', 'ACHETEUR')).toBe('');
  });
});
