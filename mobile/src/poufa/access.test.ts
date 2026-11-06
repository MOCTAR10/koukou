import { describe, expect, it } from 'vitest';

import { canConfirmDeliveries, canSetFarmGps, hasInbox, matrixGrants, readsProgrammeDomain } from './access';

const vet = { SANITAIRE: ['CONSULTER', 'MODIFIER'], REFERENCE: ['CONSULTER'] };
const dge = { INTRANTS: ['CONSULTER'], REGISTRE: ['CONSULTER', 'MODIFIER'], TECHNIQUE: ['CONSULTER'] };

describe('access', () => {
  it('lit la matrice du profil', () => {
    expect(matrixGrants(vet, 'SANITAIRE', 'MODIFIER')).toBe(true);
    expect(matrixGrants(vet, 'TECHNIQUE', 'CONSULTER')).toBe(false);
    expect(matrixGrants(null, 'SANITAIRE', 'CONSULTER')).toBe(false);
  });

  it('domaine programme : comptes de ferme oui, institution selon la matrice', () => {
    expect(readsProgrammeDomain('PROPRIETAIRE', null, 'INTRANTS')).toBe(true);
    expect(readsProgrammeDomain('ELEVEUR', null, 'INTRANTS')).toBe(true);
    expect(readsProgrammeDomain('PLATFORM_ADMIN', null, 'INTRANTS')).toBe(true);
    expect(readsProgrammeDomain('INSTITUTION', dge, 'INTRANTS')).toBe(true);
    expect(readsProgrammeDomain('INSTITUTION', vet, 'INTRANTS')).toBe(false);
    expect(readsProgrammeDomain('INSTITUTION', null, 'INTRANTS')).toBe(false);
    expect(readsProgrammeDomain('ACHETEUR', null, 'INTRANTS')).toBe(false);
  });

  it('confirmer une livraison : l’éleveur avec le droit stock, jamais l’institution ni l’admin', () => {
    expect(canConfirmDeliveries('PROPRIETAIRE', true)).toBe(true);
    expect(canConfirmDeliveries('ELEVEUR', false)).toBe(false);
    expect(canConfirmDeliveries('INSTITUTION', true)).toBe(false);
    expect(canConfirmDeliveries('PLATFORM_ADMIN', true)).toBe(false);
  });

  it('GPS : admin, compte de ferme avec registre:gps, institution REGISTRE:MODIFIER ou TECHNIQUE:VALIDER', () => {
    expect(canSetFarmGps('PLATFORM_ADMIN', null)).toBe(true);
    expect(canSetFarmGps('INSTITUTION', dge)).toBe(true);
    expect(canSetFarmGps('INSTITUTION', { TECHNIQUE: ['CONSULTER', 'VALIDER'] })).toBe(true);
    expect(canSetFarmGps('INSTITUTION', vet)).toBe(false);
    expect(canSetFarmGps('PROPRIETAIRE', null)).toBe(false);
    expect(canSetFarmGps('PROPRIETAIRE', null, true)).toBe(true);
    expect(canSetFarmGps('ELEVEUR', null, true)).toBe(true);
    expect(canSetFarmGps('ELEVEUR', null, false)).toBe(false);
    expect(canSetFarmGps('ACHETEUR', null, true)).toBe(false);
  });

  it('boîte de réception : pas pour un acheteur', () => {
    expect(hasInbox('INSTITUTION')).toBe(true);
    expect(hasInbox('ACHETEUR')).toBe(false);
    expect(hasInbox(undefined)).toBe(false);
  });
});
