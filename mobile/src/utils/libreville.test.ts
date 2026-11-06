import { describe, expect, it } from 'vitest';
import { librevilleDay, librevilleIso } from './libreville';

describe('Gabon day', () => {
  it('moves to the next day from 23:00 UTC', () => {
    expect(librevilleDay('2026-11-03T22:59:59Z')).toBe('2026-11-03');
    expect(librevilleDay('2026-11-03T23:00:00Z')).toBe('2026-11-04');
    expect(librevilleDay(new Date('2026-12-31T23:30:00Z'))).toBe('2027-01-01');
  });
  it('writes the same instant with the +01:00 offset', () => {
    const iso = librevilleIso(new Date('2026-11-03T23:30:00Z'));
    expect(iso).toBe('2026-11-04T00:30:00+01:00');
    expect(Date.parse(iso)).toBe(Date.parse('2026-11-03T23:30:00Z'));
    expect(iso.slice(0, 10)).toBe(librevilleDay('2026-11-03T23:30:00Z'));
  });
});
