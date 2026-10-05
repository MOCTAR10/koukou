import { describe, expect, it } from 'vitest';
import { GABON_PROVINCES, GABON_PROVINCE_NAMES, isGabonProvince } from './gabon';

describe('provinces du Gabon', () => {
  it('liste les 9 provinces', () => {
    expect(GABON_PROVINCES).toHaveLength(9);
  });

  it('chaque province a un chef-lieu', () => {
    for (const p of GABON_PROVINCES) {
      expect(p.name.length).toBeGreaterThan(0);
      expect(p.capital.length).toBeGreaterThan(0);
    }
  });

  it('noms uniques', () => {
    expect(new Set(GABON_PROVINCE_NAMES).size).toBe(GABON_PROVINCES.length);
  });

  it('isGabonProvince valide les noms connus et rejette les autres', () => {
    expect(isGabonProvince('Estuaire')).toBe(true);
    expect(isGabonProvince('Woleu-Ntem')).toBe(true);
    expect(isGabonProvince('Océan')).toBe(false);
    expect(isGabonProvince(null)).toBe(false);
    expect(isGabonProvince('')).toBe(false);
  });
});