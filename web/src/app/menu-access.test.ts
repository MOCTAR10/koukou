import { describe, expect, it } from 'vitest';
import type { AccessMatrix, ScopeKind } from '../api/types-access';
import {
  ACCESS_ADMIN_PATH,
  alwaysOpen,
  canAdministerAccess,
  grantsAccess,
  INSTITUTION_LANDING_ORDER,
  INSTITUTION_MENU,
  institutionLanding,
  institutionOpensPath,
  institutionShowsEntry,
  menuRuleFor,
  MY_ACCESS_PATH,
  pagesOfDomain,
  scopeReachesFarms,
} from './menu-access';

const p = (scopeKind: ScopeKind, matrix: AccessMatrix) => ({ scopeKind, matrix });

// The seeded system profiles (backend access/data/default-profiles.ts).
const AGENT_TECHNIQUE = p('FARMS', { REGISTRE: ['CONSULTER'], TECHNIQUE: ['CONSULTER', 'VALIDER'], INTRANTS: ['CONSULTER'], PARAMETRES: ['CONSULTER'] });
const DGE = p('ALL', {
  REGISTRE: ['CONSULTER', 'CREER', 'MODIFIER', 'VALIDER'],
  TECHNIQUE: ['CONSULTER'],
  INTRANTS: ['CONSULTER', 'VALIDER'],
  ECONOMIQUE: ['CONSULTER'],
  TRACABILITE: ['CONSULTER'],
  PILOTAGE: ['CONSULTER'],
  PARAMETRES: ['CONSULTER', 'MODIFIER'],
});
const VETERINAIRE = p('ALL', { REGISTRE: ['CONSULTER'], SANITAIRE: ['CONSULTER', 'CREER', 'MODIFIER', 'VALIDER'], PARAMETRES: ['CONSULTER', 'MODIFIER'] });
const MAEDR = p('AGGREGATE', { PILOTAGE: ['CONSULTER', 'VALIDER'], PARAMETRES: ['CONSULTER'] });
const ANINF = p('AUDIT', { AUDIT: ['CONSULTER'] });
const ADMIN = p('ALL', { REGISTRE: ['CONSULTER'], PARAMETRES: ['CONSULTER', 'MODIFIER'], ADMINISTRATION: ['CONSULTER', 'CREER', 'MODIFIER', 'ADMINISTRER'] });

describe('menuRuleFor', () => {
  it('finds the entry or its closest parent', () => {
    expect(menuRuleFor('/app/sanitary')).toEqual(INSTITUTION_MENU['/app/sanitary']);
    expect(menuRuleFor('/app/finance/caisse')?.kind).toBe('never');
    expect(menuRuleFor('/app/acces/profils')).toEqual(INSTITUTION_MENU['/app/acces']);
    expect(menuRuleFor('/app/batches/')).toEqual(INSTITUTION_MENU['/app/batches']);
    expect(menuRuleFor('/app/stock?tab=x')).toEqual(INSTITUTION_MENU['/app/stock']);
    expect(menuRuleFor('/app/unknown')).toBeNull();
    expect(menuRuleFor('/marche')).toBeNull();
  });
});

describe('institution menu', () => {
  it('never shows a Fermia-only area, whatever the profile', () => {
    const everything = p('ALL', {
      REGISTRE: ['CONSULTER'],
      TECHNIQUE: ['CONSULTER'],
      INTRANTS: ['CONSULTER'],
      SANITAIRE: ['CONSULTER'],
      ECONOMIQUE: ['CONSULTER', 'CREER', 'MODIFIER'],
      TRACABILITE: ['CONSULTER'],
      PILOTAGE: ['CONSULTER'],
      PARAMETRES: ['CONSULTER'],
      ADMINISTRATION: ['CONSULTER', 'ADMINISTRER'],
    });
    for (const path of [
      '/app/finance/ventes',
      '/app/finance/caisse',
      '/app/finance/clients',
      '/app/finance/promotions',
      '/app/orders',
      '/app/market',
      '/app/points-of-sale',
      '/app/accounting',
      '/app/team',
      '/app/hr',
      '/app/settings',
      '/app/platform',
      '/app/home',
    ]) {
      expect(institutionShowsEntry(path, everything)).toBe(false);
      expect(institutionOpensPath(path, everything)).toBe(false);
    }
  });

  it('follows the matrix: each page needs « Consulter » on its domain', () => {
    expect(institutionShowsEntry('/app/sanitary', VETERINAIRE)).toBe(true);
    expect(institutionShowsEntry('/app/dashboard', VETERINAIRE)).toBe(false);
    expect(institutionShowsEntry('/app/batches', VETERINAIRE)).toBe(false);
    expect(institutionShowsEntry('/app/dashboard', DGE)).toBe(true);
    expect(institutionShowsEntry('/app/stock', DGE)).toBe(true);
    expect(institutionShowsEntry('/app/slaughter', DGE)).toBe(true);
    expect(institutionShowsEntry('/app/reports', DGE)).toBe(true);
    expect(institutionShowsEntry('/app/sanitary', DGE)).toBe(false);
    expect(institutionShowsEntry('/app/stock', AGENT_TECHNIQUE)).toBe(true);
    expect(institutionShowsEntry('/app/expenses', AGENT_TECHNIQUE)).toBe(false);
    // A write without « Consulter » opens no screen.
    expect(institutionShowsEntry('/app/stock', p('ALL', { INTRANTS: ['MODIFIER'] }))).toBe(false);
  });

  it('always shows the help and the account’s own access', () => {
    expect(institutionShowsEntry('/app/help', ANINF)).toBe(true);
    expect(institutionShowsEntry(MY_ACCESS_PATH, ANINF)).toBe(true);
    expect(alwaysOpen('/app/help')).toBe(true);
    expect(alwaysOpen('/app/dashboard')).toBe(false);
  });

  it('hides an unknown entry but lets an unknown URL open (the server decides)', () => {
    expect(institutionShowsEntry('/app/nouvelle-page', DGE)).toBe(false);
    expect(institutionOpensPath('/app/nouvelle-page', DGE)).toBe(true);
  });

  it('keeps an AUDIT scope to the journal, like the server', () => {
    expect(grantsAccess(p('AUDIT', { TECHNIQUE: ['CONSULTER'] }), 'TECHNIQUE', 'CONSULTER')).toBe(false);
    expect(grantsAccess(ANINF, 'AUDIT', 'CONSULTER')).toBe(true);
  });
});

describe('access administration', () => {
  it('belongs to the platform admin and to a profile granted ADMINISTRATION', () => {
    expect(canAdministerAccess('PLATFORM_ADMIN', null, 'ADMINISTRER')).toBe(true);
    expect(canAdministerAccess('INSTITUTION', ADMIN)).toBe(true);
    expect(canAdministerAccess('INSTITUTION', ADMIN, 'ADMINISTRER')).toBe(true);
    expect(canAdministerAccess('INSTITUTION', p('ALL', { ADMINISTRATION: ['CONSULTER'] }), 'ADMINISTRER')).toBe(false);
    expect(canAdministerAccess('INSTITUTION', DGE)).toBe(false);
    expect(canAdministerAccess('INSTITUTION', null)).toBe(false);
    expect(canAdministerAccess('PROPRIETAIRE', ADMIN)).toBe(false);
    expect(institutionShowsEntry(ACCESS_ADMIN_PATH, ADMIN)).toBe(true);
    expect(institutionShowsEntry(ACCESS_ADMIN_PATH, DGE)).toBe(false);
  });
});

describe('institutionLanding', () => {
  it('opens the first page the profile reaches on a farm', () => {
    expect(institutionLanding(DGE, 12)).toBe('/app/dashboard');
    expect(institutionLanding(AGENT_TECHNIQUE, 3)).toBe('/app/dashboard');
    expect(institutionLanding(VETERINAIRE, 12)).toBe('/app/sanitary');
  });

  it('sends a programme admin with no farm page to the access administration', () => {
    expect(institutionLanding(ADMIN, 12)).toBe(ACCESS_ADMIN_PATH);
  });

  it('sends scopes without farms, and an empty scope, to the access page', () => {
    expect(institutionLanding(MAEDR, 0)).toBe(MY_ACCESS_PATH);
    expect(institutionLanding(ANINF, 0)).toBe(MY_ACCESS_PATH);
    expect(institutionLanding(p('FINANCED', { TECHNIQUE: ['CONSULTER'] }), 0)).toBe(MY_ACCESS_PATH);
    expect(institutionLanding(AGENT_TECHNIQUE, 0)).toBe(MY_ACCESS_PATH);
    expect(institutionLanding(null, 5)).toBe(MY_ACCESS_PATH);
  });

  it('only lands on pages of the table (a missing route would loop on /app)', () => {
    for (const path of INSTITUTION_LANDING_ORDER) expect(INSTITUTION_MENU[path]?.kind).toBe('grant');
  });
});

describe('helpers', () => {
  it('scopeReachesFarms matches the server', () => {
    expect((['ALL', 'PROVINCES', 'FARMS'] as ScopeKind[]).every(scopeReachesFarms)).toBe(true);
    expect((['FINANCED', 'OPERATOR', 'AGGREGATE', 'AUDIT'] as ScopeKind[]).some(scopeReachesFarms)).toBe(false);
  });

  it('pagesOfDomain lists the pages a domain opens', () => {
    expect(pagesOfDomain('SANITAIRE')).toEqual(['/app/sanitary']);
    expect(pagesOfDomain('ECONOMIQUE')).toEqual(['/app/reports', '/app/expenses']);
    expect(pagesOfDomain('AUDIT')).toEqual([]);
  });
});
