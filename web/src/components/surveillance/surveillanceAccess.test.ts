import { describe, expect, it } from 'vitest';
import type { AccessMatrix } from '../../api/types-access';
import { notificationRights, surveillanceRights } from './surveillanceAccess';

const profile = (code: string, matrix: AccessMatrix, scopeKind: 'ALL' | 'AUDIT' = 'ALL') => ({ code, matrix, scopeKind });
const VET = profile('VETERINAIRE', { SANITAIRE: ['CONSULTER', 'CREER', 'MODIFIER', 'VALIDER'], REGISTRE: ['CONSULTER'] });

describe('surveillanceRights', () => {
  it('lets the platform admin read and set up, never qualify nor publish (CDC n° 25-26)', () => {
    expect(surveillanceRights('PLATFORM_ADMIN', null)).toMatchObject({
      view: true,
      seesUnpublished: true,
      qualify: false,
      publish: false,
      editLists: false,
      createCalendars: false,
      settings: true,
      declarations: true,
      reviewDeclarations: false,
    });
  });

  it('gives the seeded veterinary profile the circuit, the publication and the settings', () => {
    expect(surveillanceRights('INSTITUTION', VET)).toEqual({
      view: true,
      seesUnpublished: true,
      qualify: true,
      publish: true,
      editLists: true,
      createCalendars: true,
      editCalendars: true,
      settings: true,
      declarations: true,
      reviewDeclarations: true,
    });
  });

  it('follows the matrix: the VETERINAIRE profile without VALIDER loses the authority', () => {
    const r = surveillanceRights('INSTITUTION', profile('VETERINAIRE', { SANITAIRE: ['CONSULTER', 'MODIFIER'] }));
    expect(r).toMatchObject({ seesUnpublished: false, qualify: false, publish: false, declarations: false, editLists: true });
  });

  it('any profile granted the vets rights acts as the vets (lot A2 vet)', () => {
    const r = surveillanceRights('INSTITUTION', profile('VETO_PROV', { SANITAIRE: ['CONSULTER', 'MODIFIER', 'VALIDER'] }));
    expect(r).toMatchObject({ view: true, seesUnpublished: true, qualify: true, publish: true, reviewDeclarations: true });
    const reader = surveillanceRights('INSTITUTION', profile('DGE', { SANITAIRE: ['CONSULTER'] }));
    expect(reader).toMatchObject({ view: true, seesUnpublished: false, declarations: false });
  });

  it('nothing without SANITAIRE, for farm accounts, or for an audit scope', () => {
    expect(surveillanceRights('INSTITUTION', profile('DGE', { REGISTRE: ['CONSULTER'] })).view).toBe(false);
    expect(surveillanceRights('PROPRIETAIRE', null).view).toBe(false);
    expect(surveillanceRights('INSTITUTION', profile('X', { SANITAIRE: ['CONSULTER'] }, 'AUDIT')).view).toBe(false);
  });
});

describe('notificationRights', () => {
  it('opens the inbox to every signed-in non-buyer', () => {
    expect(notificationRights('PROPRIETAIRE', null).inbox).toBe(true);
    expect(notificationRights('ELEVEUR', null).inbox).toBe(true);
    expect(notificationRights('INSTITUTION', VET).inbox).toBe(true);
    expect(notificationRights('ACHETEUR', null).inbox).toBe(false);
    expect(notificationRights('INSTITUTION', VET, true).inbox).toBe(false);
  });

  it('rules: ADMINISTRATION Consulter reads, Administrer writes', () => {
    expect(notificationRights('PLATFORM_ADMIN', null)).toMatchObject({ readRules: true, writeRules: true });
    const admin = profile('ADMIN', { ADMINISTRATION: ['CONSULTER'] });
    expect(notificationRights('INSTITUTION', admin)).toMatchObject({ readRules: true, writeRules: false });
    expect(notificationRights('INSTITUTION', VET)).toMatchObject({ readRules: false, writeRules: false });
    expect(notificationRights('PROPRIETAIRE', null).readRules).toBe(false);
  });
});
