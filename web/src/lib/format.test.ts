import { describe, expect, it } from 'vitest';
import { dateFr, dateTimeFr, fcfa, fcfaShort, frToIso, isoToFr, num, pct, plural } from './format';
import { isDefaultSince, readableJson } from '../components/admin/parameters';

describe('French dates', () => {
  it('converts jj/mm/aaaa <-> ISO and refuses impossible days', () => {
    expect(isoToFr('2026-11-06')).toBe('06/11/2026');
    expect(isoToFr('2026-11-06T10:00:00Z')).toBe('06/11/2026');
    expect(frToIso('06/11/2026')).toBe('2026-11-06');
    expect(frToIso('6-1-2026')).toBe('2026-01-06');
    expect(frToIso('31/02/2026')).toBe('');
    expect(frToIso('06/11')).toBe('');
  });
});

describe('plural', () => {
  it('uses the singular for 0 and 1', () => {
    expect(plural(0, 'lot')).toBe('0 lot');
    expect(plural(1, 'lot')).toBe('1 lot');
    expect(plural(2, 'lot')).toBe('2 lots');
    expect(plural(3, 'oiseau', 'oiseaux')).toBe('3 oiseaux');
  });
});

describe('parameter display', () => {
  it('flags the sentinel date and reads JSON as text', () => {
    expect(isDefaultSince('2000-01-01T00:00:00.000Z')).toBe(true);
    expect(isDefaultSince('2026-11-06T00:00:00.000Z')).toBe(false);
    expect(readableJson([{ type: 'CHAIR', duree_j: 42 }])).toBe('(Type : Chair, Duree j : 42)');
  });
});

describe('fcfa', () => {
  it('rounds to whole francs and never prints -0', () => {
    expect(fcfa(1500.4).replace(/\s/g, ' ')).toBe('1 500 FCFA');
    expect(fcfa(-0.4)).toBe('0 FCFA');
    expect(fcfa(null)).toBe('—');
  });
  it('short form rounds small amounts', () => {
    expect(fcfaShort(999.6)).toBe('1000 FCFA');
    expect(fcfaShort(2_000_000)).toBe('2 M FCFA');
    expect(fcfaShort(10_000_000)).toBe('10 M FCFA');
    expect(fcfaShort(1_500_000)).toBe('1.5 M FCFA');
  });
});

describe('missing or odd values never crash a printed figure', () => {
  it('prints a dash for null, undefined, NaN and Infinity', () => {
    for (const v of [null, undefined, Number.NaN, Number.POSITIVE_INFINITY]) {
      expect(fcfa(v)).toBe('—');
      expect(fcfaShort(v)).toBe('—');
      expect(num(v)).toBe('—');
      expect(pct(v)).toBe('—');
    }
  });
  it('formats FCFA without decimals nor a negative zero', () => {
    expect(fcfa(1234567.6).replace(/\s/g, ' ')).toBe('1 234 568 FCFA');
    expect(fcfa(-0.4)).toBe('0 FCFA');
    expect(fcfa(0)).toBe('0 FCFA');
  });
});

describe('Gabon dates', () => {
  it('keeps a bare day as is and reads an instant in Libreville time (UTC+1)', () => {
    expect(dateFr('2026-11-06')).toBe(dateFr('2026-11-06T09:00:00+01:00'));
    // 23:30Z on the 6th is already the 7th in Gabon.
    expect(dateFr('2026-11-06T23:30:00Z')).toBe(dateFr('2026-11-07'));
    expect(dateTimeFr('2026-11-06T23:30:00Z')).toContain('00:30');
  });
  it('survives missing and unreadable dates', () => {
    expect(dateFr(null)).toBe('—');
    expect(dateFr('')).toBe('—');
    expect(dateFr('pas une date')).toBe('pas une date');
    expect(dateTimeFr(undefined)).toBe('—');
  });
});
