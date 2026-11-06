import { describe, expect, it } from 'vitest';
import { FarmStaffRole } from '../../common/enums/farm-staff-role.enum.js';
import {
  ELEVEUR_DEFAULT_PERMISSIONS,
  EVOLUTION_PERMISSION_GROUPS,
  PERMISSIONS,
  PERMISSION_CATALOG,
  PERMISSION_GROUPS,
  STAFF_PROFILES,
  findStaffProfile,
  isDormantPermissionCode,
  isPermissionCode,
  withDormantPermissions,
} from './permission-catalog.js';

describe('permission-catalog : profils métier', () => {
  it('expose des clés de profil uniques', () => {
    const keys = STAFF_PROFILES.map((p) => p.key);
    expect(new Set(keys).size).toBe(keys.length);
  });

  it('chaque profil a un libellé, un poste et des permissions valides', () => {
    for (const profile of STAFF_PROFILES) {
      expect(profile.label.length).toBeGreaterThan(0);
      expect(profile.jobTitle.length).toBeGreaterThan(0);
      expect([FarmStaffRole.ADMIN, FarmStaffRole.ELEVEUR]).toContain(profile.role);
      for (const code of profile.permissions) {
        expect(isPermissionCode(code)).toBe(true);
      }
    }
  });

  it('le profil Éleveur terrain reprend les droits fixes du rôle Éleveur', () => {
    const eleveur = findStaffProfile('eleveur');
    expect(eleveur?.role).toBe(FarmStaffRole.ELEVEUR);
    expect(new Set(eleveur?.permissions)).toEqual(new Set(ELEVEUR_DEFAULT_PERMISSIONS));
  });

  it('le profil RH donne la gestion d’équipe et les droits RH', () => {
    const rh = findStaffProfile('rh');
    expect(rh?.permissions).toContain('equipe:gerer');
    expect(rh?.permissions).toContain('rh:lire');
    expect(rh?.permissions).toContain('rh:gerer');
  });

  it('findStaffProfile tolère les clés vides ou inconnues', () => {
    expect(findStaffProfile(undefined)).toBeUndefined();
    expect(findStaffProfile(null)).toBeUndefined();
    expect(findStaffProfile('inconnu')).toBeUndefined();
  });

  it('le catalogue expose un groupe Ressources humaines', () => {
    const group = PERMISSION_GROUPS.find((g) => g.key === 'rh');
    const codes = group?.items.map((i) => i.code) ?? [];
    expect(codes).toContain('rh:lire');
    expect(codes).toContain('rh:gerer');
  });

  it('le groupe Agriculture reste connu mais n’est pas servi (Évolution)', () => {
    expect(EVOLUTION_PERMISSION_GROUPS.has('agriculture')).toBe(true);
    const known = PERMISSION_CATALOG.find((g) => g.key === 'agriculture');
    expect(known?.items.map((i) => i.code)).toContain('agri:gerer');
    expect(PERMISSION_GROUPS.some((g) => g.key === 'agriculture')).toBe(false);
    expect(PERMISSIONS.some((p) => p.code === 'agri:gerer')).toBe(false);
    expect(isPermissionCode('agri:gerer')).toBe(false);
    expect(isDormantPermissionCode('agri:gerer')).toBe(true);
  });

  it('le catalogue servi = le catalogue complet moins les groupes Évolution', () => {
    expect(PERMISSION_GROUPS.map((g) => g.key)).toEqual(
      PERMISSION_CATALOG.map((g) => g.key).filter(
        (k) => !EVOLUTION_PERMISSION_GROUPS.has(k),
      ),
    );
    for (const p of PERMISSIONS) {
      expect(isPermissionCode(p.code)).toBe(true);
      expect(isDormantPermissionCode(p.code)).toBe(false);
    }
    expect(isDormantPermissionCode('truc:bidule')).toBe(false);
  });

  it('une liste remplacée garde les codes dormants déjà stockés, pas les inconnus', () => {
    expect(
      withDormantPermissions(
        ['caisse:lire'],
        ['agri:gerer', 'vente:creer', 'truc:bidule'],
      ),
    ).toEqual(['caisse:lire', 'agri:gerer']);
    expect(withDormantPermissions(['agri:gerer'], ['agri:gerer'])).toEqual([
      'agri:gerer',
    ]);
    expect(withDormantPermissions(['saisie:creer'], null)).toEqual([
      'saisie:creer',
    ]);
  });
});
