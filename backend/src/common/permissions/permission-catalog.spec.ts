import { describe, expect, it } from 'vitest';
import { FarmStaffRole } from '../../common/enums/farm-staff-role.enum.js';
import {
  ELEVEUR_DEFAULT_PERMISSIONS,
  PERMISSION_GROUPS,
  STAFF_PROFILES,
  findStaffProfile,
  isPermissionCode,
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

  it('le catalogue expose un groupe Agriculture avec la gestion des parcelles', () => {
    const group = PERMISSION_GROUPS.find((g) => g.key === 'agriculture');
    const codes = group?.items.map((i) => i.code) ?? [];
    expect(codes).toContain('agri:gerer');
  });
});
