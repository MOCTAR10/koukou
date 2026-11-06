import { describe, expect, it } from 'vitest';
import { normalizeOtpCode, otpCodeError, readLoginAnswer } from './login';

const user = { id: 'u1', fullName: 'Awa', role: 'INSTITUTION' as const };

describe('readLoginAnswer', () => {
  it('reads a session', () => {
    const answer = readLoginAnswer({ accessToken: 't', expiresIn: 28800, user });
    expect(answer).toEqual({ kind: 'session', session: { accessToken: 't', expiresIn: 28800, user } });
  });

  it('reads an SMS challenge instead of crashing on the missing user', () => {
    const answer = readLoginAnswer({ otpRequired: true, challengeId: 'c1', expiresAt: '2026-11-06T10:05:00Z', sentTo: '07••••56' });
    expect(answer.kind).toBe('otp');
    if (answer.kind === 'otp') {
      expect(answer.challenge.challengeId).toBe('c1');
      expect(answer.challenge.sentTo).toBe('07••••56');
    }
  });

  it('refuses an answer with neither', () => {
    expect(() => readLoginAnswer(null)).toThrow(/inattendue/);
    expect(() => readLoginAnswer({ otpRequired: true })).toThrow();
    expect(() => readLoginAnswer({ accessToken: 't' })).toThrow();
  });
});

describe('SMS code', () => {
  it('drops spaces and separators', () => {
    expect(normalizeOtpCode(' 123 456 ')).toBe('123456');
    expect(normalizeOtpCode('123-456')).toBe('123456');
  });

  it('asks for exactly 6 digits', () => {
    expect(otpCodeError('')).toMatch(/Entrez/);
    expect(otpCodeError('12345')).toMatch(/6 chiffres/);
    expect(otpCodeError('12a456')).toMatch(/6 chiffres/);
    expect(otpCodeError('123 456')).toBeNull();
  });
});
