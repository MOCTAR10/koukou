import { describe, expect, it } from 'vitest';
import type { AccessMatrix, ScopeKind } from '../../api/types-access';
import {
  AUDIT_PROFILE_MESSAGE,
  BEYOND_OWN_ACCESS_MESSAGE,
  farmGrantable,
  grantRefusal,
  isNationalAdministrator,
  matrixExcess,
  membershipManageRefusal,
  provinceGrantable,
  scopeKindRefusal,
  type Granter,
} from './grantRules';

const profile = (scopeKind: ScopeKind, matrix: AccessMatrix, label = 'P') => ({ scopeKind, matrix, label });
const institution = (scopeKind: ScopeKind, matrix: AccessMatrix, provinceCodes: string[] = [], farmIds: string[] = []): Granter => ({
  role: 'INSTITUTION',
  access: { profile: { scopeKind, matrix }, provinceCodes, farmIds },
});

// Seeded profiles (backend `access/data/default-profiles.ts`), matrices shortened where it doesn't matter.
const ADMIN_MATRIX: AccessMatrix = {
  REGISTRE: ['CONSULTER'],
  PARAMETRES: ['CONSULTER', 'MODIFIER'],
  ADMINISTRATION: ['CONSULTER', 'CREER', 'MODIFIER', 'ADMINISTRER'],
};
const DGE = profile('ALL', { REGISTRE: ['CONSULTER', 'CREER', 'MODIFIER'], TECHNIQUE: ['CONSULTER'] }, 'DGE');
const AGENT = profile('FARMS', { REGISTRE: ['CONSULTER'], TECHNIQUE: ['CONSULTER', 'CREER'] }, 'Agent technique');
const MAEDR = profile('AGGREGATE', { PILOTAGE: ['CONSULTER', 'VALIDER'], PARAMETRES: ['CONSULTER'] }, 'MAEDR');
const ANINF = profile('AUDIT', { AUDIT: ['CONSULTER'] }, 'ANINF (audit)');

const platform: Granter = { role: 'PLATFORM_ADMIN', access: null };
const national = institution('ALL', ADMIN_MATRIX);
const provincial = institution(
  'PROVINCES',
  { REGISTRE: ['CONSULTER'], TECHNIQUE: ['CONSULTER', 'CREER'], ADMINISTRATION: ['CONSULTER', 'ADMINISTRER'] },
  ['G1', 'G2'],
);

describe('grantRefusal', () => {
  it('lets the platform admin grant anything, the audit profile included', () => {
    for (const p of [DGE, AGENT, MAEDR, ANINF]) expect(grantRefusal(platform, p)).toBeNull();
  });

  it('lets the national administrator grant any profile but an audit one, without holding its rights', () => {
    expect(isNationalAdministrator(national.access!.profile)).toBe(true);
    expect(grantRefusal(national, DGE)).toBeNull();
    expect(grantRefusal(national, AGENT)).toBeNull();
    expect(grantRefusal(national, MAEDR)).toBeNull();
    expect(grantRefusal(national, ANINF)).toBe(AUDIT_PROFILE_MESSAGE);
    // An AUDIT domain in another kind is an audit profile too.
    expect(grantRefusal(national, profile('ALL', { AUDIT: ['CONSULTER'] }))).toBe(AUDIT_PROFILE_MESSAGE);
  });

  it('binds an ALL scope without ADMINISTRER to the matrix subset', () => {
    const all = institution('ALL', { REGISTRE: ['CONSULTER'], ADMINISTRATION: ['CONSULTER', 'CREER'] });
    expect(isNationalAdministrator(all.access!.profile)).toBe(false);
    expect(grantRefusal(all, profile('AGGREGATE', { REGISTRE: ['CONSULTER'] }))).toBeNull();
    expect(grantRefusal(all, DGE)).toBe(
      'Accès refusé : le profil « DGE » donne des droits que vous n’avez pas (Registre des fermes : Créer, Registre des fermes : Modifier, Suivi technique : Consulter).',
    );
  });

  it('keeps a provincial admin within its scope kind and its rights', () => {
    expect(grantRefusal(provincial, AGENT)).toBeNull();
    expect(grantRefusal(provincial, profile('PROVINCES', { TECHNIQUE: ['CONSULTER'] }))).toBeNull();
    expect(grantRefusal(provincial, DGE)).toMatch(/plus large que le vôtre/);
    expect(grantRefusal(provincial, MAEDR)).toMatch(/périmètre national/);
    expect(grantRefusal(provincial, ANINF)).toBe(AUDIT_PROFILE_MESSAGE);
    expect(grantRefusal(provincial, profile('FARMS', { SANITAIRE: ['CONSULTER'] }, 'Vétérinaire'))).toMatch(/Sanitaire : Consulter/);
  });

  it('refuses without an access to read', () => {
    expect(grantRefusal({ role: 'INSTITUTION', access: null }, AGENT)).toMatch(/administrer les accès/);
    expect(grantRefusal({ role: 'PROPRIETAIRE', access: null }, AGENT)).toMatch(/administrer les accès/);
  });
});

describe('scope kinds and matrices', () => {
  it('orders ALL ⊃ PROVINCES ⊃ FARMS, other kinds from ALL only', () => {
    expect(scopeKindRefusal('ALL', 'AUDIT')).toBeNull();
    expect(scopeKindRefusal('PROVINCES', 'FARMS')).toBeNull();
    expect(scopeKindRefusal('PROVINCES', 'PROVINCES')).toBeNull();
    expect(scopeKindRefusal('FARMS', 'PROVINCES')).not.toBeNull();
    expect(scopeKindRefusal('PROVINCES', 'FINANCED')).not.toBeNull();
    expect(scopeKindRefusal('AGGREGATE', 'FARMS')).not.toBeNull();
  });

  it('lists the missing rights in catalogue order', () => {
    expect(matrixExcess({ REGISTRE: ['CONSULTER'] }, { TECHNIQUE: ['CREER'], REGISTRE: ['MODIFIER', 'CONSULTER'] })).toEqual([
      ['REGISTRE', 'MODIFIER'],
      ['TECHNIQUE', 'CREER'],
    ]);
  });
});

describe('scope lists', () => {
  it('offers a provincial admin its own provinces and farms only', () => {
    expect(provinceGrantable(provincial, 'G1')).toBe(true);
    expect(provinceGrantable(provincial, 'G5')).toBe(false);
    expect(provinceGrantable(national, 'G5')).toBe(true);
    expect(farmGrantable(provincial, 'f1', 'G2')).toBe(true);
    expect(farmGrantable(provincial, 'f1', null)).toBe(false);
    expect(farmGrantable(institution('FARMS', {}, [], ['f1']), 'f1', null)).toBe(true);
    expect(farmGrantable(institution('FARMS', {}, [], ['f1']), 'f2', 'G1')).toBe(false);
  });

  it('manages only an account it could have granted', () => {
    const agentIn = { provinceCodes: [], farmIds: ['f1'] };
    const provinceOf = (id: string) => (id === 'f1' ? 'G1' : 'G7');
    expect(membershipManageRefusal(provincial, agentIn, AGENT, provinceOf)).toBeNull();
    expect(membershipManageRefusal(provincial, { provinceCodes: [], farmIds: ['f1', 'f9'] }, AGENT, provinceOf)).toBe(BEYOND_OWN_ACCESS_MESSAGE);
    expect(membershipManageRefusal(provincial, { provinceCodes: [], farmIds: [] }, DGE)).toBe(BEYOND_OWN_ACCESS_MESSAGE);
    expect(membershipManageRefusal(national, { provinceCodes: [], farmIds: [] }, DGE)).toBeNull();
    expect(membershipManageRefusal(national, { provinceCodes: [], farmIds: [] }, ANINF)).toBe(BEYOND_OWN_ACCESS_MESSAGE);
    expect(membershipManageRefusal(platform, { provinceCodes: [], farmIds: [] }, ANINF)).toBeNull();
    // Unknown profile: the server decides.
    expect(membershipManageRefusal(provincial, agentIn, null)).toBeNull();
  });
});
