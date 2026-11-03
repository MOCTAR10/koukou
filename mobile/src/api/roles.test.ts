import { describe, it, expect } from 'vitest';

import { canManageFarm, homeRouteFor, roleLabel, safeReturnPath } from './roles';

describe('roles', () => {
  it('canManageFarm : Propriétaire et Administrateur gèrent la ferme', () => {
    expect(canManageFarm('PROPRIETAIRE')).toBe(true);
    expect(canManageFarm('PLATFORM_ADMIN')).toBe(true);
    expect(canManageFarm(undefined)).toBe(true);
  });

  it("canManageFarm : l'Éleveur est restreint", () => {
    expect(canManageFarm('ELEVEUR')).toBe(false);
  });

  it('roleLabel : libellés FR', () => {
    expect(roleLabel('ELEVEUR')).toBe('Éleveur');
    expect(roleLabel('PLATFORM_ADMIN')).toBe('Administrateur');
    expect(roleLabel('PROPRIETAIRE')).toBe('Propriétaire');
    expect(roleLabel('ACHETEUR')).toBe('Acheteur');
  });

  it('homeRouteFor : un acheteur n’atterrit pas sur les écrans de ferme', () => {
    expect(homeRouteFor('ACHETEUR')).toBe('/accueil');
    expect(homeRouteFor('PROPRIETAIRE')).toBe('/');
    expect(homeRouteFor('ELEVEUR')).toBe('/');
    expect(homeRouteFor(undefined)).toBe('/');
  });

  it('safeReturnPath : seulement un chemin interne', () => {
    expect(safeReturnPath('/annonces/abc')).toBe('/annonces/abc');
    expect(safeReturnPath('https://exemple.com')).toBeNull();
    expect(safeReturnPath('//exemple.com')).toBeNull();
    expect(safeReturnPath(undefined)).toBeNull();
    expect(safeReturnPath(['/a', '/b'])).toBeNull();
  });
});