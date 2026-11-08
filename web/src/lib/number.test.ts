import { describe, expect, it } from 'vitest';
import { parseDecimalFr, parseDecimalOrZero } from './number';

describe('parseDecimalFr', () => {
  it('reads French thousands separators and decimal comma', () => {
    expect(parseDecimalFr('1 200,5')).toBe(1200.5);
    expect(parseDecimalFr('1 200,5')).toBe(1200.5);
    expect(parseDecimalFr('1 200')).toBe(1200);
    expect(parseDecimalFr('12.5')).toBe(12.5);
    expect(parseDecimalFr(' 0,25 ')).toBe(0.25);
  });
  it('returns null, never 0, for invalid text', () => {
    expect(parseDecimalFr('')).toBeNull();
    expect(parseDecimalFr('abc')).toBeNull();
    expect(parseDecimalFr('1,2,3')).toBeNull();
    expect(parseDecimalFr('12kg')).toBeNull();
    expect(parseDecimalFr(undefined)).toBeNull();
  });
  it('reads a real zero', () => {
    expect(parseDecimalFr('0')).toBe(0);
  });
});

describe('parseDecimalOrZero', () => {
  it('maps empty to 0 and invalid to null', () => {
    expect(parseDecimalOrZero('')).toBe(0);
    expect(parseDecimalOrZero('  ')).toBe(0);
    expect(parseDecimalOrZero('x')).toBeNull();
    expect(parseDecimalOrZero('3,5')).toBe(3.5);
  });
});
