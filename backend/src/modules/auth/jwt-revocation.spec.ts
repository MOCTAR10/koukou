import { isRevokedByReset } from './jwt.strategy.js';

describe('isRevokedByReset (tokens issued before a code reset are refused)', () => {
  const reset = new Date('2026-11-08T10:00:00.500Z');

  it('refuses a token issued before the reset', () => {
    expect(isRevokedByReset(Date.parse('2026-11-08T09:00:00Z') / 1000, reset)).toBe(true);
  });

  it('accepts the token issued right after the reset (iat rounded down)', () => {
    expect(isRevokedByReset(Date.parse('2026-11-08T10:00:00Z') / 1000, reset)).toBe(false);
  });

  it('accepts any token when the code was never reset', () => {
    expect(isRevokedByReset(1, null)).toBe(false);
    expect(isRevokedByReset(undefined, reset)).toBe(false);
  });
});
