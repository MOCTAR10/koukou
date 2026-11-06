import { computeWithdrawalEndDate } from './entities/treatment-record.entity.js';
import {
  animalCountError,
  farmProtocolRefusal,
  resolveTreatmentProduct,
  treatmentPeriodError,
} from './treatment-rules.js';

const LIST = [
  { code: 'AMOX', label: 'Amoxicilline 10 %' },
  { code: 'VITA', label: 'Vitamines AD3E' },
];

describe('treatment product (PRODUIT_TRAITEMENT)', () => {
  it('takes the label of an active list item', () => {
    expect(resolveTreatmentProduct({ productCode: ' AMOX ' }, LIST)).toEqual({
      ok: true,
      productCode: 'AMOX',
      productName: 'Amoxicilline 10 %',
    });
  });

  it('ignores a free name once the list is filled', () => {
    const r = resolveTreatmentProduct(
      { productCode: 'VITA', productName: 'autre chose' },
      LIST,
    );
    expect(r).toMatchObject({ ok: true, productName: 'Vitamines AD3E' });
  });

  it('refuses free text when the list has active items', () => {
    const r = resolveTreatmentProduct({ productName: 'Mon produit' }, LIST);
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.error).toContain('PRODUIT_TRAITEMENT');
  });

  it('refuses an unknown or deactivated code', () => {
    const r = resolveTreatmentProduct({ productCode: 'OXY' }, LIST);
    expect(r).toEqual({
      ok: false,
      error: 'Produit « OXY » inconnu ou désactivé dans la liste PRODUIT_TRAITEMENT.',
    });
  });

  it('accepts free text only while the list is empty', () => {
    expect(resolveTreatmentProduct({ productName: '  Oxytétracycline ' }, [])).toEqual({
      ok: true,
      productCode: null,
      productName: 'Oxytétracycline',
    });
    expect(resolveTreatmentProduct({ productCode: 'AMOX' }, []).ok).toBe(false);
    expect(resolveTreatmentProduct({ productName: '  ' }, [])).toEqual({
      ok: false,
      error: 'Le nom du produit est obligatoire.',
    });
    expect(resolveTreatmentProduct({ productName: 'x'.repeat(201) }, []).ok).toBe(false);
  });
});

describe('treatment period', () => {
  it('allows a one-day treatment or an end on or after the start', () => {
    expect(treatmentPeriodError('2026-11-01', null)).toBeNull();
    expect(treatmentPeriodError('2026-11-01', '2026-11-01')).toBeNull();
    expect(treatmentPeriodError('2026-11-01', '2026-11-05')).toBeNull();
  });

  it('refuses an end before the start', () => {
    expect(treatmentPeriodError('2026-11-05', '2026-11-01')).toMatch(/précéder/);
  });

  it('runs the withdrawal period from the last day of treatment', () => {
    const start = new Date('2026-11-01T08:00:00Z');
    expect(computeWithdrawalEndDate(start, 7)).toBe('2026-11-08');
    expect(computeWithdrawalEndDate(start, 7, '2026-11-05')).toBe('2026-11-12');
    expect(computeWithdrawalEndDate(start, 0, '2026-11-05')).toBeNull();
  });
});

describe('animal count', () => {
  it('is optional and bounded by the birds placed', () => {
    expect(animalCountError(undefined, 500)).toBeNull();
    expect(animalCountError(500, 500)).toBeNull();
    expect(animalCountError(501, 500)).toMatch(/501.*500/);
  });
});

describe('farm vaccination programme', () => {
  it('is created by an institution holding SANITAIRE:CREER only', () => {
    expect(farmProtocolRefusal('INSTITUTION')).toBeNull();
    expect(farmProtocolRefusal('PROPRIETAIRE')).toMatch(/services vétérinaires/);
    expect(farmProtocolRefusal('PLATFORM_ADMIN')).toMatch(/services vétérinaires/);
    expect(farmProtocolRefusal('ELEVEUR')).not.toBeNull();
  });
});
