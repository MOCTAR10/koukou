import { describe, expect, it } from 'vitest';
import {
  cellsOf,
  dateFromValidUntil,
  domainAllowed,
  domainLockReason,
  domainsWithoutConsult,
  grantCount,
  matrixOf,
  membershipMatches,
  membershipPhone,
  membershipScopeError,
  membershipStatus,
  NO_FILTERS,
  normalizeProfileCode,
  profileCodeError,
  sameMatrix,
  scopeFieldsOf,
  scopeKindOpen,
  scopeRequirement,
  setDomain,
  toggleCell,
  validUntilError,
  validUntilFromDate,
} from './matrix';

describe('matrix editing', () => {
  it('round-trips a matrix through the grid cells', () => {
    const m = { REGISTRE: ['CONSULTER' as const], TECHNIQUE: ['VALIDER' as const, 'CONSULTER' as const] };
    const cells = cellsOf(m);
    expect(cells.has('TECHNIQUE:VALIDER')).toBe(true);
    // Catalogue order, whatever the stored order.
    expect(matrixOf(cells, 'ALL')).toEqual({ REGISTRE: ['CONSULTER'], TECHNIQUE: ['CONSULTER', 'VALIDER'] });
    expect(cellsOf(null).size).toBe(0);
  });

  it('toggles a cell without touching the original', () => {
    const cells = cellsOf({ REGISTRE: ['CONSULTER'] });
    const on = toggleCell(cells, 'SANITAIRE', 'CREER');
    expect(on.has('SANITAIRE:CREER')).toBe(true);
    expect(cells.has('SANITAIRE:CREER')).toBe(false);
    const off = toggleCell(on, 'REGISTRE', 'CONSULTER');
    expect(matrixOf(off, 'ALL')).toEqual({ SANITAIRE: ['CREER'] });
  });

  it('drops empty domains and sets a whole domain', () => {
    expect(matrixOf(new Set(), 'ALL')).toEqual({});
    const all = setDomain(new Set(), 'PILOTAGE', true);
    expect(matrixOf(all, 'AGGREGATE')).toEqual({ PILOTAGE: ['CONSULTER', 'CREER', 'MODIFIER', 'VALIDER', 'ADMINISTRER'] });
    expect(matrixOf(setDomain(all, 'PILOTAGE', false), 'AGGREGATE')).toEqual({});
  });

  it('keeps the journal apart, like validateMatrix', () => {
    const cells = cellsOf({ AUDIT: ['CONSULTER'], REGISTRE: ['CONSULTER'] });
    expect(matrixOf(cells, 'AUDIT')).toEqual({ AUDIT: ['CONSULTER'] });
    expect(matrixOf(cells, 'ALL')).toEqual({ REGISTRE: ['CONSULTER'] });
    expect(domainAllowed('AUDIT', 'AUDIT')).toBe(true);
    expect(domainAllowed('REGISTRE', 'AUDIT')).toBe(false);
    expect(domainLockReason('AUDIT', 'PROVINCES')).toMatch(/Journal/);
    expect(domainLockReason('REGISTRE', 'AUDIT')).toMatch(/journal/);
    expect(domainLockReason('REGISTRE', 'ALL')).toBeNull();
  });

  it('flags domains that write without consulting', () => {
    expect(domainsWithoutConsult({ INTRANTS: ['MODIFIER'], REGISTRE: ['CONSULTER', 'CREER'] })).toEqual(['INTRANTS']);
  });

  it('counts and compares grants', () => {
    expect(grantCount({ REGISTRE: ['CONSULTER'], TECHNIQUE: ['CONSULTER', 'VALIDER'] })).toBe(3);
    expect(sameMatrix({ TECHNIQUE: ['VALIDER', 'CONSULTER'] }, { TECHNIQUE: ['CONSULTER', 'VALIDER'] })).toBe(true);
    expect(sameMatrix({ TECHNIQUE: ['CONSULTER'] }, { TECHNIQUE: ['CONSULTER', 'VALIDER'] })).toBe(false);
  });
});

describe('profile code', () => {
  it('normalizes and checks it like the server', () => {
    expect(normalizeProfileCode(' agent provincial ')).toBe('AGENT_PROVINCIAL');
    expect(normalizeProfileCode('agent-g1')).toBe('AGENT_G1');
    expect(profileCodeError('AGENT_G1')).toBeNull();
    expect(profileCodeError('')).toMatch(/obligatoire/);
    expect(profileCodeError('A')).toMatch(/2 à 40/);
    expect(profileCodeError('1ABC')).toMatch(/lettre/);
    expect(scopeKindOpen('OPERATOR')).toBe(false);
    expect(scopeKindOpen('FARMS')).toBe(true);
  });
});

describe('membership scope', () => {
  it('asks for the list the scope kind reads', () => {
    expect(scopeRequirement('PROVINCES')).toBe('provinces');
    expect(scopeRequirement('FARMS')).toBe('farms');
    expect(scopeRequirement('ALL')).toBe('none');
    expect(scopeRequirement(null)).toBe('none');
    expect(membershipScopeError('PROVINCES', [], ['f'])).toMatch(/province/);
    expect(membershipScopeError('FARMS', ['G1'], [])).toMatch(/ferme/);
    expect(membershipScopeError('PROVINCES', ['G1'], [])).toBeNull();
    expect(membershipScopeError('AGGREGATE', [], [])).toBeNull();
    expect(membershipScopeError('OPERATOR', [], [])).toMatch(/opérateur/);
  });

  it('sends only that list', () => {
    expect(scopeFieldsOf('PROVINCES', ['G1'], ['f1'])).toEqual({ provinceCodes: ['G1'] });
    expect(scopeFieldsOf('FARMS', ['G1'], ['f1'])).toEqual({ farmIds: ['f1'] });
    expect(scopeFieldsOf('ALL', ['G1'], ['f1'])).toEqual({});
  });
});

describe('validity', () => {
  it('ends at the end of the chosen day, local time', () => {
    const iso = validUntilFromDate('2026-12-31');
    expect(iso).not.toBeNull();
    const d = new Date(iso ?? '');
    expect([d.getFullYear(), d.getMonth(), d.getDate(), d.getHours(), d.getMinutes()]).toEqual([2026, 11, 31, 23, 59]);
    expect(dateFromValidUntil(iso)).toBe('2026-12-31');
    expect(validUntilFromDate('')).toBeNull();
    expect(dateFromValidUntil(null)).toBe('');
  });

  it('must be in the future', () => {
    const now = new Date(2026, 10, 6, 12, 0);
    expect(validUntilError('2026-11-05', now)).toMatch(/futur/);
    // Today still counts: the access ends tonight.
    expect(validUntilError('2026-11-06', now)).toBeNull();
    expect(validUntilError('', now)).toBeNull();
  });
});

describe('membership status and filters', () => {
  const now = new Date('2026-11-06T12:00:00Z');
  const base = {
    active: true,
    validUntil: null as string | null,
    user: { fullName: 'Awa Mba', phone: '074123456', email: 'awa@dge.ga', active: true },
    profile: { code: 'DGE', scopeKind: 'ALL' as const },
    provinceCodes: [] as string[],
    farmIds: [] as string[],
  };

  it('derives the status like isMembershipEffective', () => {
    expect(membershipStatus(base, now)).toBe('ACTIVE');
    expect(membershipStatus({ ...base, active: false }, now)).toBe('SUSPENDED');
    expect(membershipStatus({ ...base, validUntil: '2026-11-01T00:00:00Z' }, now)).toBe('EXPIRED');
    expect(membershipStatus({ ...base, validUntil: '2027-01-01T00:00:00Z' }, now)).toBe('ACTIVE');
    expect(membershipStatus({ ...base, user: { ...base.user, active: false } }, now)).toBe('ACCOUNT_SUSPENDED');
  });

  it('filters by profile, status and search', () => {
    expect(membershipMatches(base, { ...NO_FILTERS, profileCode: 'DGE' }, undefined, now)).toBe(true);
    expect(membershipMatches(base, { ...NO_FILTERS, profileCode: 'BCEG' }, undefined, now)).toBe(false);
    expect(membershipMatches(base, { ...NO_FILTERS, status: 'ACTIVE' }, undefined, now)).toBe(true);
    expect(membershipMatches({ ...base, active: false }, { ...NO_FILTERS, status: 'ACTIVE' }, undefined, now)).toBe(false);
    expect(membershipMatches({ ...base, active: false }, { ...NO_FILTERS, status: 'INACTIVE' }, undefined, now)).toBe(true);
    expect(membershipMatches(base, { ...NO_FILTERS, q: 'awa' }, undefined, now)).toBe(true);
    expect(membershipMatches(base, { ...NO_FILTERS, q: '74 12' }, undefined, now)).toBe(true);
    expect(membershipMatches(base, { ...NO_FILTERS, q: 'dge.ga' }, undefined, now)).toBe(true);
    expect(membershipMatches(base, { ...NO_FILTERS, q: 'paul' }, undefined, now)).toBe(false);
  });

  it('filters by province through the scope', () => {
    const f = { ...NO_FILTERS, province: 'G2' };
    expect(membershipMatches(base, f, undefined, now)).toBe(true); // ALL covers every province
    const prov = { ...base, profile: { code: 'AG', scopeKind: 'PROVINCES' as const }, provinceCodes: ['G1', 'G2'] };
    expect(membershipMatches(prov, f, undefined, now)).toBe(true);
    expect(membershipMatches({ ...prov, provinceCodes: ['G1'] }, f, undefined, now)).toBe(false);
    const farms = { ...base, profile: { code: 'AT', scopeKind: 'FARMS' as const }, farmIds: ['a', 'b'] };
    expect(membershipMatches(farms, f, (id) => (id === 'b' ? 'G2' : 'G1'), now)).toBe(true);
    expect(membershipMatches(farms, f, () => 'G1', now)).toBe(false);
    const agg = { ...base, profile: { code: 'MAEDR', scopeKind: 'AGGREGATE' as const } };
    expect(membershipMatches(agg, f, undefined, now)).toBe(false);
  });
});

describe('membershipPhone', () => {
  it('stores a Gabon number as 0XXXXXXXX, like the sign-in', () => {
    expect(membershipPhone('074 12 34 56')).toEqual({ phone: '074123456' });
    expect(membershipPhone('74123456')).toEqual({ phone: '074123456' });
    expect(membershipPhone('+241 74 12 34 56')).toEqual({ phone: '074123456' });
    expect(membershipPhone('241074123456')).toEqual({ phone: '074123456' });
  });

  it('keeps an international number as typed, without separators', () => {
    expect(membershipPhone('+33 6 12 34 56 78')).toEqual({ phone: '+33612345678' });
  });

  it('refuses the rest in French', () => {
    expect(membershipPhone('')).toEqual({ error: 'Le téléphone est obligatoire.' });
    expect('error' in membershipPhone('12')).toBe(true);
    expect('error' in membershipPhone('+12')).toBe(true);
  });
});
