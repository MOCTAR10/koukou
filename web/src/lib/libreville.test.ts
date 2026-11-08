import { describe, expect, it } from 'vitest';
import { librevilleDay, librevilleDaysBack, shiftDay } from './libreville';

describe('librevilleDay', () => {
  it('is already the next day between 23:00 and 24:00 UTC', () => {
    expect(librevilleDay(new Date('2026-11-07T23:30:00Z'))).toBe('2026-11-08');
    expect(librevilleDay(new Date('2026-11-07T22:59:00Z'))).toBe('2026-11-07');
  });
  it('accepts epoch ms and ISO strings', () => {
    expect(librevilleDay(Date.parse('2026-12-31T23:10:00Z'))).toBe('2027-01-01');
    expect(librevilleDay('2026-03-01T00:30:00+01:00')).toBe('2026-03-01');
  });
});

describe('librevilleDaysBack', () => {
  it('counts Gabon days', () => {
    expect(librevilleDaysBack(1, new Date('2026-11-07T23:30:00Z'))).toBe('2026-11-07');
    expect(librevilleDaysBack(0, new Date('2026-11-07T12:00:00Z'))).toBe('2026-11-07');
  });
});

describe('shiftDay', () => {
  it('crosses month and year boundaries', () => {
    expect(shiftDay('2026-12-31', 1)).toBe('2027-01-01');
    expect(shiftDay('2026-03-01', -1)).toBe('2026-02-28');
    expect(shiftDay('2024-03-01T10:00:00Z', -1)).toBe('2024-02-29');
  });
});
