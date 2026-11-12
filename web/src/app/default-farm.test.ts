import { describe, expect, it } from 'vitest';
import { defaultFarmId } from './default-farm';

describe('defaultFarmId', () => {
  it('opens on the first farm of the registry by code, not by name', () => {
    expect(
      defaultFarmId([
        { id: 'a', code: 'G3-0001' },
        { id: 'b', code: 'G1-0002' },
        { id: 'c', code: 'G1-0001' },
      ]),
    ).toBe('c');
  });

  it('compares the numbers of a code as numbers', () => {
    expect(
      defaultFarmId([
        { id: 'a', code: 'G1-0010' },
        { id: 'b', code: 'G1-9' },
      ]),
    ).toBe('b');
  });

  it('keeps the list order for farms without a code', () => {
    expect(defaultFarmId([{ id: 'a' }, { id: 'b', code: null }])).toBe('a');
    expect(defaultFarmId([{ id: 'a', code: ' ' }, { id: 'b', code: 'G2-0001' }])).toBe('b');
  });

  it('has no farm to open on an empty list', () => {
    expect(defaultFarmId([])).toBeNull();
  });
});
