import { describe, expect, it } from 'vitest';

import {
  buildVisitPayload,
  canWriteVisits,
  classOf,
  emptyVisitDraft,
  groupByCategory,
  readsVisits,
  scoreLabel,
  scoreOf,
  visitHistoryLabel,
  visitInBand,
  visitRefusal,
} from './visits';

const grid = [
  { code: 'PEDILUVE', label: 'Pédiluve', category: 'Accès', weight: 3 },
  { code: 'CLOTURE', label: 'Clôture', category: 'Accès', weight: 2 },
  { code: 'MAINS', label: 'Lavage des mains', category: null, weight: 1 },
];

describe('score et classe', () => {
  it('pondère les critères conformes sur les critères évalués, sans les « sans objet »', () => {
    expect(scoreOf(grid, { PEDILUVE: 'NON_CONFORME', CLOTURE: 'CONFORME', MAINS: 'CONFORME' })).toBe(50);
    expect(scoreOf(grid, { PEDILUVE: 'CONFORME', MAINS: 'NA' })).toBe(100);
    expect(scoreOf(grid, {})).toBeNull();
  });
  it('classe sur les seuils, bornes comprises', () => {
    const t = { a: 80, b: 60 };
    expect(classOf(80, t)).toBe('A');
    expect(classOf(60, t)).toBe('B');
    expect(classOf(59.9, t)).toBe('C');
    expect(classOf(null, t)).toBeNull();
  });
  it('écrit le score en français', () => {
    expect(scoreLabel(72.5)).toBe('72,5 %');
    expect(scoreLabel(null)).toBe('—');
  });
  it('groupe par rubrique', () => {
    expect(groupByCategory(grid).map((g) => [g.category, g.items.length])).toEqual([
      ['Accès', 2],
      ['Autres', 1],
    ]);
  });
});

describe('droits', () => {
  const agent = { TECHNIQUE: ['CONSULTER', 'VALIDER'] } as never;
  const dge = { TECHNIQUE: ['CONSULTER'] } as never;
  const vet = { SANITAIRE: ['CONSULTER'] } as never;
  it("l'écriture suit TECHNIQUE:VALIDER", () => {
    expect(canWriteVisits('INSTITUTION', agent)).toBe(true);
    expect(canWriteVisits('INSTITUTION', dge)).toBe(false);
    expect(canWriteVisits('PROPRIETAIRE', null)).toBe(false);
    expect(canWriteVisits('PLATFORM_ADMIN', null)).toBe(true);
  });
  it('la lecture : la ferme, la DGE, les vétérinaires', () => {
    expect(readsVisits('PROPRIETAIRE', null)).toBe(true);
    expect(readsVisits('INSTITUTION', dge)).toBe(true);
    expect(readsVisits('INSTITUTION', vet)).toBe(true);
    expect(readsVisits('INSTITUTION', { AUDIT: ['CONSULTER'] } as never)).toBe(false);
    expect(readsVisits('ACHETEUR', null)).toBe(false);
  });
});

describe('contrôles avant envoi', () => {
  const base = { ...emptyVisitDraft('2026-11-10'), batchId: 'b-1' };
  const ctx = { today: '2026-11-10', bandStart: '2026-10-20' };
  it('accepte une visite simple et un visa cohérent', () => {
    expect(visitRefusal(base, ctx)).toBeNull();
    expect(visitRefusal({ ...base, visaFrom: '2026-11-01', visaTo: '2026-11-09' }, ctx)).toBeNull();
  });
  it('refuse les incohérences', () => {
    expect(visitRefusal({ ...base, visitDate: '2026-11-12' }, ctx)).toMatch(/futur/);
    expect(visitRefusal({ ...base, nextVisitDate: '2026-11-01' }, ctx)).toMatch(/prochaine/);
    expect(visitRefusal({ ...base, visaFrom: '2026-11-01' }, ctx)).toMatch(/début et la fin/);
    expect(visitRefusal({ ...base, batchId: '', visaFrom: '2026-11-01', visaTo: '2026-11-02' }, ctx)).toMatch(/bande/);
    expect(visitRefusal({ ...base, visaFrom: '2026-11-05', visaTo: '2026-11-01' }, ctx)).toMatch(/suit sa fin/);
    expect(visitRefusal({ ...base, visaFrom: '2026-10-01', visaTo: '2026-11-01' }, ctx)).toMatch(/avant l’ouverture/);
    expect(visitRefusal({ ...base, type: 'BIOSECURITE' }, ctx)).toMatch(/au moins un critère/);
    expect(visitRefusal({ ...base, type: 'BIOSECURITE', answers: { PEDILUVE: 'NA' } }, ctx)).toMatch(/au moins un critère/);
    expect(visitRefusal({ ...base, type: 'BIOSECURITE', answers: { PEDILUVE: 'CONFORME' } }, ctx)).toBeNull();
  });
});

describe('corps envoyé', () => {
  it('ne garde que ce qui est renseigné', () => {
    const draft = {
      ...emptyVisitDraft('2026-11-10'),
      type: 'BIOSECURITE' as const,
      batchId: 'b-1',
      observations: '  RAS ',
      visaFrom: '2026-11-01',
      visaTo: '2026-11-09',
      position: { latitude: 0.3912345678, longitude: 9.4512345678 },
      answers: { PEDILUVE: 'NON_CONFORME' as const, CLOTURE: 'CONFORME' as const },
      comments: { PEDILUVE: ' à sec ', CLOTURE: '' },
    };
    expect(buildVisitPayload(draft, grid)).toEqual({
      visitDate: '2026-11-10',
      type: 'BIOSECURITE',
      batchId: 'b-1',
      observations: 'RAS',
      visaFrom: '2026-11-01',
      visaTo: '2026-11-09',
      latitude: 0.391235,
      longitude: 9.451235,
      answers: [
        { criterionCode: 'PEDILUVE', answer: 'NON_CONFORME', comment: 'à sec' },
        { criterionCode: 'CLOTURE', answer: 'CONFORME' },
      ],
    });
    expect(buildVisitPayload(emptyVisitDraft('2026-11-10'), grid)).toEqual({ visitDate: '2026-11-10', type: 'TECHNIQUE', answers: [] });
  });
});

describe('historique de la bande', () => {
  it('écrit la ligne comme le serveur', () => {
    expect(visitHistoryLabel({ type: 'BIOSECURITE', scorePct: 72.5, classification: 'B', visaFrom: null, visaTo: null })).toBe(
      'Contrôle de biosécurité : score 72,5 %, classe B',
    );
    expect(visitHistoryLabel({ type: 'TECHNIQUE', scorePct: null, classification: null, visaFrom: null, visaTo: null })).toBe('Visite technique');
  });
  it('rattache une visite de ferme à la bande en cours à sa date', () => {
    const band = { id: 'b-1', integrationDate: '2026-10-20', closedAt: null };
    expect(visitInBand({ batchId: 'b-1', visitDate: '2026-01-01' }, band, '2026-11-10')).toBe(true);
    expect(visitInBand({ batchId: 'b-2', visitDate: '2026-11-01' }, band, '2026-11-10')).toBe(false);
    expect(visitInBand({ batchId: null, visitDate: '2026-11-01' }, band, '2026-11-10')).toBe(true);
    expect(visitInBand({ batchId: null, visitDate: '2026-10-01' }, band, '2026-11-10')).toBe(false);
    expect(visitInBand({ batchId: null, visitDate: '2026-11-09' }, { ...band, closedAt: '2026-11-05T12:00:00Z' }, '2026-11-10')).toBe(false);
  });
});
