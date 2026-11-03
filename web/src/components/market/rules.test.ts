import { describe, expect, it } from 'vitest';
import { depositFor, orderTotal, timeLeft, unitName } from './rules';

describe('depositFor', () => {
  it('rounds up like the server', () => {
    expect(depositFor(3, 3333, 10)).toBe(1000);
    expect(depositFor(10, 5000, 30)).toBe(15000);
  });

  it('is zero when the listing asks for no deposit', () => {
    expect(depositFor(10, 5000, null)).toBe(0);
  });
});

describe('orderTotal', () => {
  it('adds the fee only for a delivery', () => {
    expect(orderTotal(10, 5000, 'PICKUP', 2000)).toBe(50000);
    expect(orderTotal(10, 5000, 'DELIVERY', 2000)).toBe(52000);
  });
});

describe('unitName', () => {
  it('uses the unit of each product', () => {
    expect(unitName('BIRDS', 1)).toBe('oiseau');
    expect(unitName('BIRDS', 2)).toBe('oiseaux');
    expect(unitName('EGGS', 2)).toBe('alvéoles');
    expect(unitName('CARCASS', 2)).toBe('carcasses');
  });
});

describe('timeLeft', () => {
  const now = Date.parse('2026-11-03T10:00:00Z');

  it('counts down in the largest useful unit', () => {
    expect(timeLeft('2026-11-03T10:30:00Z', now)).toBe('30 min');
    expect(timeLeft('2026-11-04T09:05:00Z', now)).toBe('23 h 05');
    expect(timeLeft('2026-11-08T10:00:00Z', now)).toBe('5 jours');
  });

  it('stops at the deadline', () => {
    expect(timeLeft('2026-11-03T10:00:00Z', now)).toBeNull();
  });
});
