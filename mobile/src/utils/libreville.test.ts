import { describe, expect, it } from 'vitest';
import { librevilleDay, librevilleDaysBack, librevilleIso, librevilleTime } from './libreville';

describe('Gabon day helpers', () => {
  it('librevilleTime is the Gabon wall clock', () => {
    expect(librevilleTime(new Date('2026-11-03T23:30:00Z'))).toBe('00:30');
    expect(librevilleTime(new Date('2026-11-03T08:05:00Z'))).toBe('09:05');
  });
  it('librevilleDaysBack counts Gabon days, across month ends', () => {
    const at = new Date('2026-11-30T23:30:00Z'); // already 1 December in Gabon
    expect(librevilleDaysBack(0, at)).toBe('2026-12-01');
    expect(librevilleDaysBack(6, at)).toBe('2026-11-25');
    expect(librevilleDaysBack(1, new Date('2026-03-01T00:30:00Z'))).toBe('2026-02-28');
  });
});

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
