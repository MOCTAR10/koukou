import { describe, expect, it } from 'vitest';
import type { AccessMatrix, ScopeKind } from '../../api/types-access';
import { FINANCING_ENTRIES, financingHeader, financingRights, isFinancingPath } from './financingAccess';

const p = (scopeKind: ScopeKind, matrix: AccessMatrix) => ({ scopeKind, matrix });

describe('financingRights', () => {
  it('follows the matrix, never a profile code', () => {
    expect(financingRights('INSTITUTION', p('FINANCED', { FINANCEMENT: ['CONSULTER'] }))).toEqual({ view: true, create: false, edit: false, validate: false, financials: false });
    expect(financingRights('INSTITUTION', p('FINANCED', { FINANCEMENT: ['CONSULTER', 'CREER', 'MODIFIER', 'VALIDER'] }))).toEqual({
      view: true,
      create: true,
      edit: true,
      validate: true,
      financials: false,
    });
  });

  it('opens the financial statements only with COMPTABILITE: Consulter, besides FINANCEMENT', () => {
    expect(financingRights('INSTITUTION', p('FINANCED', { FINANCEMENT: ['CONSULTER'], COMPTABILITE: ['CONSULTER'] })).financials).toBe(true);
    expect(financingRights('INSTITUTION', p('FINANCED', { COMPTABILITE: ['CONSULTER'] })).financials).toBe(false);
    expect(financingRights('PLATFORM_ADMIN').financials).toBe(true);
  });

  it('needs « Consulter » first: a write alone opens nothing', () => {
    expect(financingRights('INSTITUTION', p('FINANCED', { FINANCEMENT: ['VALIDER'] })).view).toBe(false);
    expect(financingRights('INSTITUTION', p('FINANCED', { FINANCEMENT: ['VALIDER'] })).validate).toBe(false);
  });

  it('needs a scope that reaches farms', () => {
    expect(financingRights('INSTITUTION', p('AGGREGATE', { FINANCEMENT: ['CONSULTER'] })).view).toBe(false);
    expect(financingRights('INSTITUTION', p('AUDIT', { FINANCEMENT: ['CONSULTER'] })).view).toBe(false);
    expect(financingRights('INSTITUTION', p('ALL', { FINANCEMENT: ['CONSULTER'] })).view).toBe(true);
  });

  it('platform admin has all, farm accounts and unknown access none', () => {
    expect(financingRights('PLATFORM_ADMIN').validate).toBe(true);
    expect(financingRights('PROPRIETAIRE', p('ALL', { FINANCEMENT: ['CONSULTER'] })).view).toBe(false);
    expect(financingRights('INSTITUTION', null).view).toBe(false);
  });
});

describe('paths', () => {
  it('tells programme-wide financing pages from the farmer page', () => {
    expect(isFinancingPath('/app/financement')).toBe(true);
    expect(isFinancingPath('/app/financement/dossiers')).toBe(true);
    expect(isFinancingPath('/app/financement-ferme')).toBe(false);
  });
  it('lists the four menu entries in order, one-line labels', () => {
    expect(FINANCING_ENTRIES.map((e) => e.label)).toEqual(['Portefeuille', 'Dossiers', 'Consentements', 'Pièces et cadre']);
    expect(financingHeader('/app/financement/fermes/x')).toBe('Vue 360° d’une ferme');
    expect(financingHeader('/app/financement')).toBe('Portefeuille de financement');
  });
});
