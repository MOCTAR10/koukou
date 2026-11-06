import { describe, expect, it } from 'vitest';
import { emptySortie, reasonChoices, sortieEffect, sortieOutcome, validateSortie, type SortieContext } from './sortieRules';

const ITEMS = [
  { code: 'VENTE_VIF', label: 'Vente de poulets vifs', family: 'VENTE', active: true },
  { code: 'ABATTOIR', label: "Envoi à l'abattoir", family: 'ABATTOIR', active: true },
  { code: 'REFORME', label: 'Réforme', family: 'REFORME', active: true },
  { code: 'DON', label: 'Don', family: 'AUTRE', active: true },
  { code: 'OLD', label: 'Ancien', family: 'AUTRE', active: false },
];

describe('reasonChoices', () => {
  it('greys out the families the account may not use', () => {
    const choices = reasonChoices(ITEMS, (c) => c === 'saisie:creer');
    expect(choices.map((c) => [c.code, c.allowed])).toEqual([
      ['VENTE_VIF', false],
      ['ABATTOIR', false],
      ['REFORME', true],
      ['DON', true],
    ]);
    expect(choices[0]?.why).toBe('Permission manquante pour ce motif : vente:creer.');
  });
});

describe('validateSortie', () => {
  const choices = reasonChoices(ITEMS, () => true);
  const ctx = (code: string, over: Partial<SortieContext> = {}): SortieContext => ({
    reason: choices.find((c) => c.code === code),
    present: 100,
    integrationDate: '2026-10-01',
    closed: false,
    todayUtc: '2026-11-06',
    ...over,
  });
  const draft = (over = {}) => ({ ...emptySortie('2026-11-06'), ...over });

  it('never exceeds the birds present', () => {
    expect(validateSortie(draft({ reasonCode: 'REFORME', count: '120' }), ctx('REFORME')).errors).toEqual([
      'Sortie impossible : 120 sujet(s) pour 100 présent(s).',
    ]);
    expect(validateSortie(draft({ reasonCode: 'REFORME', count: '2,5' }), ctx('REFORME')).errors).toEqual([
      'Le nombre de sujets est un entier, au moins 1.',
    ]);
  });

  it('needs a price for a sale, and the weight for a price per kg', () => {
    expect(validateSortie(draft({ reasonCode: 'VENTE_VIF', count: '10' }), ctx('VENTE_VIF')).errors).toEqual([
      'Une sortie pour vente demande un prix unitaire.',
    ]);
    expect(validateSortie(draft({ reasonCode: 'VENTE_VIF', count: '10', unitPriceFcfa: '2500', priceUnit: 'KG' }), ctx('VENTE_VIF')).errors).toEqual([
      'Un prix au kg demande le poids des sujets sortis.',
    ]);
    expect(
      validateSortie(draft({ reasonCode: 'VENTE_VIF', count: '10', unitPriceFcfa: '2500', recipientName: ' Marché ', slaughterType: 'VIVANT' }), ctx('VENTE_VIF'))
        .payload,
    ).toEqual({ sortieDate: '2026-11-06', count: 10, reasonCode: 'VENTE_VIF', unitPriceFcfa: 2500, priceUnit: 'TETE', recipientName: 'Marché' });
  });

  it('sends the slaughter fields and the operator', () => {
    expect(validateSortie(draft({ reasonCode: 'ABATTOIR', count: '50', weightKg: '110,5', operatorId: 'op1' }), ctx('ABATTOIR')).payload).toEqual({
      sortieDate: '2026-11-06',
      count: 50,
      reasonCode: 'ABATTOIR',
      weightKg: 110.5,
      operatorId: 'op1',
      slaughterType: 'ABATTU',
      destination: 'EXTERNE',
    });
  });

  it('checks the day, the closed band and the permission', () => {
    expect(validateSortie(draft({ reasonCode: 'DON', count: '1', sortieDate: '2026-09-30' }), ctx('DON')).errors).toEqual([
      "La sortie ne peut pas précéder l'ouverture de la bande (2026-10-01).",
    ]);
    expect(validateSortie(draft({ reasonCode: 'DON', count: '1' }), ctx('DON', { closed: true })).errors[0]).toMatch(/clôturée/);
    const noSale = reasonChoices(ITEMS, () => false).find((c) => c.code === 'VENTE_VIF');
    expect(validateSortie(draft({ reasonCode: 'VENTE_VIF', count: '1', unitPriceFcfa: '1' }), ctx('VENTE_VIF', { reason: noSale })).errors).toEqual([
      'Permission manquante pour ce motif : vente:creer.',
    ]);
  });
});

describe('effects and outcomes', () => {
  it('says what the server creates, so nothing is entered twice', () => {
    expect(sortieEffect('VENTE', false)[0]).toMatch(/ne la ressaisissez pas/);
    expect(sortieEffect('ABATTOIR', true)).toHaveLength(2);
    expect(sortieEffect('REFORME', false)[0]).toMatch(/quittent/);
  });

  it('labels what a sortie created', () => {
    expect(sortieOutcome({ reasonFamily: 'VENTE', saleStatus: 'OUTSTANDING', slaughterStatus: null, operatorId: null })).toBe('Vente à encaisser');
    expect(sortieOutcome({ reasonFamily: 'ABATTOIR', saleStatus: null, slaughterStatus: 'DRAFT', operatorId: 'o' })).toBe(
      'Abattage en brouillon · cession (sous-lot)',
    );
    expect(sortieOutcome({ reasonFamily: 'AUTRE', saleStatus: null, slaughterStatus: null, operatorId: null })).toBe('Retrait de l’effectif');
  });
});
