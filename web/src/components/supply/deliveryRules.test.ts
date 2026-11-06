import { describe, expect, it } from 'vitest';
import type { DeliveryView, ListItemWithMeta } from '../../api/types-supply';
import {
  cancelReasonError,
  draftTotals,
  emptyLine,
  isAfterTomorrow,
  itemsByCode,
  kgPerUnit,
  openBandHintOf,
  parseDecimal,
  subsidySplit,
  unitsFor,
  validateDelivery,
  validateLine,
  type DeliveryDraft,
  type LineDraft,
} from './deliveryRules';

const item = (code: string, label: string, family: string | null, meta: Record<string, unknown> = {}): ListItemWithMeta => ({
  id: code,
  code,
  label,
  family,
  sort: 0,
  active: true,
  meta,
});

const INTRANTS = [
  item('POUSSINS', "Poussins d'un jour", 'POUSSIN'),
  item('ALIMENT_DEMARRAGE', 'Aliment démarrage', 'ALIMENT', { feedPhase: 'DEMARRAGE' }),
  item('ALIMENT_CROISSANCE', 'Aliment croissance', 'ALIMENT'),
  item('VACCIN', 'Vaccin', 'VACCIN'),
];
const UNITS = [
  item('TETE', 'Tête', null, { symbol: 'tête' }),
  item('KG', 'Kilogramme', null),
  item('TONNE', 'Tonne', null),
  item('SAC', 'Sac', null),
  item('DOSE', 'Dose', null),
  item('BIDON', 'Bidon 25 kg', null, { kgPerUnit: 25 }),
];
const items = itemsByCode(INTRANTS, UNITS);

const line = (over: Partial<LineDraft>): LineDraft => ({ ...emptyLine('k'), ...over });

describe('units and numbers', () => {
  it('weighs units like the server', () => {
    expect(kgPerUnit(UNITS[1]!)).toBe(1);
    expect(kgPerUnit(UNITS[2]!)).toBe(1000);
    expect(kgPerUnit(UNITS[3]!, 25)).toBe(25);
    expect(kgPerUnit(UNITS[3]!, null, 40)).toBe(40);
    expect(kgPerUnit(UNITS[3]!)).toBe(50);
    expect(kgPerUnit(UNITS[5]!)).toBe(25);
    expect(kgPerUnit(UNITS[0]!)).toBeNull();
  });

  it('offers mass units for feed and head units for chicks', () => {
    expect(unitsFor('ALIMENT', UNITS).map((u) => u.code)).toEqual(['KG', 'TONNE', 'SAC', 'BIDON']);
    expect(unitsFor('POUSSIN', UNITS).map((u) => u.code)).toEqual(['TETE', 'DOSE']);
    expect(unitsFor('VACCIN', UNITS)).toHaveLength(UNITS.length);
  });

  it('reads French decimals', () => {
    expect(parseDecimal('12,5')).toBe(12.5);
    expect(parseDecimal(' 1 000 ')).toBe(1000);
    expect(parseDecimal('')).toBeUndefined();
    expect(parseDecimal('abc')).toBeNaN();
  });

  it('tolerates tomorrow, not later', () => {
    expect(isAfterTomorrow('2026-11-07', '2026-11-06')).toBe(false);
    expect(isAfterTomorrow('2026-11-08', '2026-11-06')).toBe(true);
  });
});

describe('validateLine', () => {
  it('counts chicks as whole heads', () => {
    expect(validateLine(line({ intrantCode: 'POUSSINS', unitCode: 'TETE', quantity: '500,5' }), items).errors).toContain(
      'le nombre de poussins doit être un entier',
    );
    expect(validateLine(line({ intrantCode: 'POUSSINS', unitCode: 'KG', quantity: '10' }), items).errors[0]).toMatch(/par tête/);
    expect(validateLine(line({ intrantCode: 'POUSSINS', unitCode: 'TETE', quantity: '500' }), items).payload).toEqual({
      intrantCode: 'POUSSINS',
      unitCode: 'TETE',
      quantity: 500,
    });
  });

  it('needs a mass unit and a phase for feed, defaulting to the intrant phase', () => {
    expect(validateLine(line({ intrantCode: 'ALIMENT_CROISSANCE', unitCode: 'DOSE', quantity: '3' }), items).errors).toEqual([
      "l'aliment se compte en masse (kg, tonne, sac), pas en « Dose »",
      "indiquez la phase de l'aliment (démarrage, croissance, finition…)",
    ]);
    const res = validateLine(line({ intrantCode: 'ALIMENT_DEMARRAGE', unitCode: 'SAC', quantity: '20', bagSizeKg: '25' }), items);
    expect(res.payload).toMatchObject({ feedPhase: 'DEMARRAGE', bagSizeKg: 25 });
  });

  it('ties the rate to the subsidy', () => {
    const base = { intrantCode: 'VACCIN', unitCode: 'DOSE', quantity: '1000' };
    expect(validateLine(line({ ...base, subsidized: true }), items).errors).toContain(
      "indiquez le taux de subvention de l'intrant subventionné",
    );
    // A rate typed then « subventionné » unticked is simply not sent.
    expect(validateLine(line({ ...base, subsidized: false, subsidyRate: '70' }), items).payload).not.toHaveProperty('subsidyRate');
    expect(validateLine(line({ ...base, subsidized: true, subsidyRate: '70' }), items).payload).toMatchObject({
      subsidized: true,
      subsidyRate: 70,
    });
  });

  it('refuses a decimal FCFA value and drops the phase of a non-feed line', () => {
    expect(validateLine(line({ intrantCode: 'VACCIN', unitCode: 'DOSE', quantity: '5', unitValueFcfa: '12,5' }), items).errors).toContain(
      'la valeur unitaire est un entier positif (FCFA)',
    );
    expect(validateLine(line({ intrantCode: 'VACCIN', unitCode: 'DOSE', quantity: '5', feedPhase: 'DEMARRAGE' }), items).payload).not.toHaveProperty(
      'feedPhase',
    );
  });
});

describe('validateDelivery', () => {
  const draft = (over: Partial<DeliveryDraft> = {}): DeliveryDraft => ({
    farmId: 'f1',
    bandId: '',
    source: 'ETAT_SMAG',
    supplierName: '',
    shippedAt: '2026-11-05',
    notes: '',
    lines: [line({ intrantCode: 'POUSSINS', unitCode: 'TETE', quantity: '500' })],
    ...over,
  });

  it('builds the body', () => {
    expect(validateDelivery(draft({ notes: ' lot A ' }), items, '2026-11-06').payload).toEqual({
      farmId: 'f1',
      source: 'ETAT_SMAG',
      shippedAt: '2026-11-05',
      notes: 'lot A',
      lines: [{ intrantCode: 'POUSSINS', unitCode: 'TETE', quantity: 500 }],
    });
  });

  it('needs the supplier for AUTRE, a past shipping day and 1 to 50 lines, line-prefixed', () => {
    const res = validateDelivery(
      draft({ source: 'AUTRE', shippedAt: '2026-11-20', lines: [line({ intrantCode: 'POUSSINS', unitCode: 'TETE', quantity: '' })] }),
      items,
      '2026-11-06',
    );
    expect(res.payload).toBeNull();
    expect(res.errors).toEqual([
      "La date d'expédition ne peut pas être dans le futur.",
      'Indiquez le fournisseur pour une livraison hors État / SMAG.',
      'Ligne 1 : indiquez la quantité expédiée.',
    ]);
    expect(validateDelivery(draft({ lines: [] }), items, '2026-11-06').errors).toContain('Une livraison compte au moins une ligne.');
    const many = Array.from({ length: 51 }, () => line({ intrantCode: 'POUSSINS', unitCode: 'TETE', quantity: '1' }));
    expect(validateDelivery(draft({ lines: many }), items, '2026-11-06').errors).toContain('Au plus 50 lignes par livraison.');
  });
});

describe('totals and hints', () => {
  it('splits the subsidy in integer FCFA that add up', () => {
    expect(subsidySplit(3, 333, true, 70)).toEqual({ grossFcfa: 999, farmerCostFcfa: 300, subsidyFcfa: 699 });
    expect(subsidySplit(3, null, true, 70)).toBeNull();
    expect(draftTotals([{ intrantCode: 'A', unitCode: 'SAC', quantity: 10, unitValueFcfa: 15000, subsidized: true, subsidyRate: 50 }])).toEqual({
      shippedValueFcfa: 150000,
      farmerCostFcfa: 75000,
      subsidyFcfa: 75000,
    });
  });

  it('asks for 3 characters to cancel', () => {
    expect(cancelReasonError(' ab ')).not.toBeNull();
    expect(cancelReasonError('Erreur de saisie')).toBeNull();
  });

  it('offers to open the band after chicks received without a band', () => {
    const view = {
      id: 'd1',
      code: 'G1-0001-L01',
      status: 'CONFIRMEE',
      band: null,
      supplierName: null,
      shippedAt: '2026-11-04',
      receivedDate: '2026-11-05',
      lines: [
        { intrantFamily: 'POUSSIN', receivedQuantity: 480, farmerCostFcfa: 0, supplierLotNumber: 'C-12' },
        { intrantFamily: 'ALIMENT', receivedQuantity: 10, farmerCostFcfa: 5000, supplierLotNumber: null },
      ],
    } as unknown as DeliveryView;
    expect(openBandHintOf(view)).toMatchObject({
      quantityAtStart: 480,
      integrationDate: '2026-11-05',
      couvoirSupplier: 'État / SMAG',
      chickLotNumber: 'C-12',
      chickCostBooked: false,
    });
    expect(openBandHintOf({ ...view, band: { id: 'b', code: null, batchName: null } })).toBeNull();
    expect(openBandHintOf({ ...view, status: 'EXPEDIEE' })).toBeNull();
  });
});
