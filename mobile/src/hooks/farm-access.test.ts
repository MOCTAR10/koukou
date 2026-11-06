import { describe, expect, it } from 'vitest';

import type { FarmMemberProfile } from '@/api/types';
import { accessAllows, readsFermiaData, resolveFarmAccess } from './farm-access';

function profile(over: Partial<FarmMemberProfile> = {}): FarmMemberProfile {
  return { farmId: 'f-1', role: 'ADMIN', jobTitle: null, buildingAssignment: null, active: true, permissions: [], ...over };
}

describe('resolveFarmAccess', () => {
  it('aucun droit sans ferme : pas de menu propriétaire', () => {
    const access = resolveFarmAccess({ farmId: '', userRole: 'PROPRIETAIRE', fetch: { status: 'error', network: true } });
    expect(access).toEqual({ permissions: [], isOwner: false, farmRole: null });
    expect(accessAllows(access, 'vente:creer')).toBe(false);
  });

  it('un acheteur n’a jamais de droit, même avec une ferme active', () => {
    const access = resolveFarmAccess({ farmId: 'f-1', userRole: 'ACHETEUR', fetch: { status: 'error', network: true } });
    expect(accessAllows(access, 'caisse:lire')).toBe(false);
    expect(access.isOwner).toBe(false);
  });

  it('rien pendant le chargement du profil', () => {
    const access = resolveFarmAccess({ farmId: 'f-1', userRole: 'PROPRIETAIRE', fetch: { status: 'pending' } });
    expect(accessAllows(access, 'caisse:lire')).toBe(false);
  });

  it('aucun profil sur la ferme (réponse vide) : aucun droit', () => {
    const access = resolveFarmAccess({ farmId: 'f-1', userRole: 'INSTITUTION', fetch: { status: 'success', profile: null } });
    expect(access).toEqual({ permissions: [], isOwner: false, farmRole: null });
  });

  it('refus du serveur (4xx) : aucun droit', () => {
    const access = resolveFarmAccess({ farmId: 'f-1', userRole: 'PROPRIETAIRE', fetch: { status: 'error', network: false } });
    expect(accessAllows(access, 'caisse:lire')).toBe(false);
  });

  it('propriétaire : tous les droits', () => {
    const access = resolveFarmAccess({
      farmId: 'f-1',
      userRole: 'PROPRIETAIRE',
      fetch: { status: 'success', profile: profile({ role: 'PROPRIETAIRE', permissions: ['*'] }) },
    });
    expect(access.isOwner).toBe(true);
    expect(accessAllows(access, 'rh:gerer')).toBe(true);
  });

  it('institution : exactement les droits de son profil, jamais propriétaire', () => {
    const access = resolveFarmAccess({
      farmId: 'f-1',
      userRole: 'INSTITUTION',
      fetch: { status: 'success', profile: profile({ role: 'INSTITUTION', permissions: ['sanitaire:lecture'] }) },
    });
    expect(access.isOwner).toBe(false);
    expect(access.farmRole).toBe('INSTITUTION');
    expect(accessAllows(access, 'sanitaire:lecture')).toBe(true);
    expect(accessAllows(access, 'vente:creer')).toBe(false);
  });

  it('administrateur sans droit enregistré : aucun droit', () => {
    const access = resolveFarmAccess({ farmId: 'f-1', userRole: 'ELEVEUR', fetch: { status: 'success', profile: profile() } });
    expect(accessAllows(access, 'saisie:creer')).toBe(false);
  });

  it('démarrage hors ligne : permissif pour le propriétaire et le personnel, pas pour l’institution', () => {
    const owner = resolveFarmAccess({ farmId: 'f-1', userRole: 'PROPRIETAIRE', fetch: { status: 'error', network: true } });
    expect(owner.isOwner).toBe(true);
    expect(accessAllows(owner, 'caisse:lire')).toBe(true);
    const staff = resolveFarmAccess({ farmId: 'f-1', userRole: 'ELEVEUR', fetch: { status: 'error', network: true } });
    expect(staff.isOwner).toBe(false);
    expect(accessAllows(staff, 'saisie:creer')).toBe(true);
    const institution = resolveFarmAccess({ farmId: 'f-1', userRole: 'INSTITUTION', fetch: { status: 'error', network: true } });
    expect(accessAllows(institution, 'saisie:creer')).toBe(false);
  });
});

describe('readsFermiaData', () => {
  it('propriétaire, personnel et administrateur plateforme lisent les domaines Fermia', () => {
    expect(readsFermiaData('PROPRIETAIRE')).toBe(true);
    expect(readsFermiaData('ELEVEUR')).toBe(true);
    expect(readsFermiaData('PLATFORM_ADMIN')).toBe(true);
  });

  it('jamais une institution (refusé par le backend quel que soit son profil), ni un acheteur', () => {
    expect(readsFermiaData('INSTITUTION')).toBe(false);
    expect(readsFermiaData('ACHETEUR')).toBe(false);
    expect(readsFermiaData('OPERATEUR')).toBe(false);
    expect(readsFermiaData(undefined)).toBe(false);
  });
});
