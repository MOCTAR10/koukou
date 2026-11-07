import { describe, expect, it } from 'vitest';
import type { MyAccess } from '../../api/types-access';
import type { GridCriterion } from '../../api/types-visits';
import { classOf, groupByCategory, scoreLabel, scoreOf, visaError, visitRights } from './visitRules';

const grid: GridCriterion[] = [
  { code: 'A', label: 'a', category: 'Accès', weight: 3 },
  { code: 'B', label: 'b', category: 'Accès', weight: 2 },
  { code: 'C', label: 'c', category: null, weight: 1 },
];

describe('score and class', () => {
  it('weights compliant criteria over assessed ones and leaves NA out', () => {
    expect(scoreOf(grid, { A: 'NON_CONFORME', B: 'CONFORME', C: 'CONFORME' })).toBe(50);
    expect(scoreOf(grid, { A: 'CONFORME', B: 'NA' })).toBe(100);
    expect(scoreOf(grid, {})).toBeNull();
  });
  it('classifies on the thresholds, boundaries included', () => {
    const t = { a: 80, b: 60 };
    expect(classOf(80, t)).toBe('A');
    expect(classOf(60, t)).toBe('B');
    expect(classOf(59.9, t)).toBe('C');
    expect(classOf(null, t)).toBeNull();
  });
  it('words the score in French', () => {
    expect(scoreLabel(72.5)).toBe('72,5 %');
    expect(scoreLabel(null)).toBe('—');
  });
  it('groups criteria by category', () => {
    expect(groupByCategory(grid).map((g) => [g.category, g.items.length])).toEqual([
      ['Accès', 2],
      ['Autres', 1],
    ]);
  });
});

describe('visitRights', () => {
  type P = Pick<MyAccess['profile'], 'matrix' | 'scopeKind'>;
  const agent: P = { scopeKind: 'FARMS', matrix: { TECHNIQUE: ['CONSULTER', 'VALIDER'] } };
  const dge: P = { scopeKind: 'ALL', matrix: { TECHNIQUE: ['CONSULTER'] } };
  const vet: P = { scopeKind: 'ALL', matrix: { SANITAIRE: ['CONSULTER'] } };
  const anif: P = { scopeKind: 'AUDIT', matrix: { AUDIT: ['CONSULTER'] } };
  it('follows the matrix', () => {
    expect(visitRights('INSTITUTION', agent)).toEqual({ view: true, write: true, programme: true });
    expect(visitRights('INSTITUTION', dge)).toEqual({ view: true, write: false, programme: true });
    expect(visitRights('INSTITUTION', vet).view).toBe(true);
    expect(visitRights('INSTITUTION', vet).write).toBe(false);
    expect(visitRights('INSTITUTION', anif).view).toBe(false);
    expect(visitRights('INSTITUTION', null).view).toBe(false);
  });
  it('lets the farm read its visits only, and the platform admin everything', () => {
    expect(visitRights('PROPRIETAIRE', null)).toEqual({ view: true, write: false, programme: false });
    expect(visitRights('ELEVEUR', null).write).toBe(false);
    expect(visitRights('PLATFORM_ADMIN', null)).toEqual({ view: true, write: true, programme: true });
    expect(visitRights('ACHETEUR', null).view).toBe(false);
  });
});

describe('visaError', () => {
  const base = { visitDate: '2026-11-10', batchId: 'b', visaFrom: '2026-11-01', visaTo: '2026-11-09', bandStart: '2026-10-20' };
  it('accepts no visa or a consistent one', () => {
    expect(visaError({ ...base, visaFrom: '', visaTo: '' })).toBeNull();
    expect(visaError(base)).toBeNull();
  });
  it('refuses the inconsistent ones', () => {
    expect(visaError({ ...base, visaTo: '' })).toMatch(/début et la fin/);
    expect(visaError({ ...base, batchId: '' })).toMatch(/bande/);
    expect(visaError({ ...base, visaFrom: '2026-11-09', visaTo: '2026-11-01' })).toMatch(/suit sa fin/);
    expect(visaError({ ...base, visaTo: '2026-11-11' })).toMatch(/postérieures/);
    expect(visaError({ ...base, visaFrom: '2026-10-01' })).toMatch(/avant l’ouverture/);
  });
});
