import { describe, expect, it } from 'vitest';
import { clearSessionExpired, markSessionExpired, sessionExpired, SESSION_EXPIRED_MESSAGE } from './session-expiry';

function memoryStorage() {
  const data = new Map<string, string>();
  return {
    getItem: (k: string) => data.get(k) ?? null,
    setItem: (k: string, v: string) => void data.set(k, v),
    removeItem: (k: string) => void data.delete(k),
  };
}

describe('session expiry flag', () => {
  it('survives until the sign-in page clears it', () => {
    const s = memoryStorage();
    expect(sessionExpired(s)).toBe(false);
    markSessionExpired(s);
    // Read twice (StrictMode renders twice): still there.
    expect(sessionExpired(s)).toBe(true);
    expect(sessionExpired(s)).toBe(true);
    clearSessionExpired(s);
    expect(sessionExpired(s)).toBe(false);
  });

  it('does nothing without a storage (tests, server rendering)', () => {
    expect(() => markSessionExpired(null)).not.toThrow();
    expect(sessionExpired(null)).toBe(false);
  });

  it('speaks French', () => {
    expect(SESSION_EXPIRED_MESSAGE).toMatch(/session a expiré/);
  });
});
