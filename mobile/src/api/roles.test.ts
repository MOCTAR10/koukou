import { describe, it, expect } from 'vitest';

import {
  accountArea,
  canManageFarm,
  farmRoleLabel,
  hasFarmPermission,
  homeRouteFor,
  noFarmMessage,
  roleLabel,
  safeReturnPath,
} from './roles';

describe('roles', () => {
  it('canManageFarm : Propriétaire et Administrateur gèrent la ferme', () => {
    expect(canManageFarm('PROPRIETAIRE')).toBe(true);
    expect(canManageFarm('PLATFORM_ADMIN')).toBe(true);
  });

  it("canManageFarm : l'Éleveur, l'acheteur, l'institution et un rôle inconnu sont restreints", () => {
    expect(canManageFarm('ELEVEUR')).toBe(false);
    expect(canManageFarm('ACHETEUR')).toBe(false);
    expect(canManageFarm('INSTITUTION')).toBe(false);
    expect(canManageFarm('OPERATEUR')).toBe(false);
    expect(canManageFarm(undefined)).toBe(false);
  });

  it('roleLabel : libellés FR', () => {
    expect(roleLabel('ELEVEUR')).toBe('Éleveur');
    expect(roleLabel('PLATFORM_ADMIN')).toBe('Administrateur');
    expect(roleLabel('PROPRIETAIRE')).toBe('Propriétaire');
    expect(roleLabel('ACHETEUR')).toBe('Client du Marché');
    expect(roleLabel('INSTITUTION')).toBe('Compte institutionnel');
    expect(roleLabel('OPERATEUR')).toBe('Opérateur');
  });

  it('farmRoleLabel : rôle sur la ferme, institution comprise', () => {
    expect(farmRoleLabel('PROPRIETAIRE')).toBe('Propriétaire');
    expect(farmRoleLabel('INSTITUTION', 'Ferme Nkok')).toBe('Accès institutionnel · Ferme Nkok');
    expect(farmRoleLabel('INSTITUTION')).toBe('Accès institutionnel');
    expect(farmRoleLabel(null)).toBe('Membre');
  });

  it('accountArea : l’acheteur reste au Marché, même avec des fermes', () => {
    expect(accountArea('ACHETEUR', 0)).toBe('buyer');
    expect(accountArea('ACHETEUR', 3)).toBe('buyer');
  });

  it('accountArea : un compte sans ferme a son écran dédié', () => {
    expect(accountArea('PROPRIETAIRE', 0)).toBe('no-farm');
    expect(accountArea('INSTITUTION', 0)).toBe('no-farm');
    expect(accountArea('PLATFORM_ADMIN', 0)).toBe('no-farm');
    expect(accountArea('OPERATEUR', 2)).toBe('no-farm');
    expect(accountArea('PROPRIETAIRE', 1)).toBe('farm');
    expect(accountArea('INSTITUTION', 12)).toBe('farm');
    expect(accountArea('ELEVEUR', 1)).toBe('farm');
  });

  it('homeRouteFor : un acheteur n’atterrit pas sur les écrans de ferme', () => {
    expect(homeRouteFor('ACHETEUR')).toBe('/accueil');
    expect(homeRouteFor('ACHETEUR', 0)).toBe('/accueil');
    expect(homeRouteFor('PROPRIETAIRE')).toBe('/');
    expect(homeRouteFor('ELEVEUR')).toBe('/');
    expect(homeRouteFor('INSTITUTION', 4)).toBe('/');
    expect(homeRouteFor(undefined)).toBe('/');
  });

  it('homeRouteFor : sans ferme → écran « aucune ferme »', () => {
    expect(homeRouteFor('PROPRIETAIRE', 0)).toBe('/sans-ferme');
    expect(homeRouteFor('INSTITUTION', 0)).toBe('/sans-ferme');
  });

  it('noFarmMessage : explication en français selon le compte', () => {
    expect(noFarmMessage('INSTITUTION').title).toBe('Aucune ferme dans votre périmètre');
    expect(noFarmMessage('PLATFORM_ADMIN').title).toBe('Aucune ferme au registre');
    expect(noFarmMessage('PROPRIETAIRE').body).toContain('programme POUFA');
    expect(noFarmMessage('ELEVEUR').title).toBe('Aucune ferme rattachée');
  });

  it('hasFarmPermission : rien sans liste, tout avec « * »', () => {
    expect(hasFarmPermission(undefined, 'vente:creer')).toBe(false);
    expect(hasFarmPermission(['*'], 'vente:creer')).toBe(true);
    expect(hasFarmPermission(['vente:creer'], 'vente:creer')).toBe(true);
    expect(hasFarmPermission(['caisse:lire'], 'vente:creer')).toBe(false);
  });

  it('safeReturnPath : seulement un chemin interne', () => {
    expect(safeReturnPath('/annonces/abc')).toBe('/annonces/abc');
    expect(safeReturnPath('https://exemple.com')).toBeNull();
    expect(safeReturnPath('//exemple.com')).toBeNull();
    expect(safeReturnPath(undefined)).toBeNull();
    expect(safeReturnPath(['/a', '/b'])).toBeNull();
  });
});
