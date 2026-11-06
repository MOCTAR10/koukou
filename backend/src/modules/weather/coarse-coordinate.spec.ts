import { describe, expect, it } from 'vitest';
import { coarseCoordinate } from './coarse-coordinate.js';

describe('coarseCoordinate (F11)', () => {
  it('rounds to 0.1°', () => {
    expect(coarseCoordinate(0.39123)).toBe(0.4);
    expect(coarseCoordinate(9.45678)).toBe(9.5);
    expect(coarseCoordinate(-1.64)).toBe(-1.6);
  });

  it('keeps null and refuses non-finite values', () => {
    expect(coarseCoordinate(null)).toBeNull();
    expect(coarseCoordinate(undefined)).toBeNull();
    expect(coarseCoordinate(Number.NaN)).toBeNull();
  });
});
