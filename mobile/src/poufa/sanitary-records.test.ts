import { describe, expect, it } from 'vitest';
import { completionBody, treatmentBody, treatmentPeriodLabel, withdrawalEndPreview, type TreatmentForm } from './sanitary-records';

const form = (over: Partial<TreatmentForm> = {}): TreatmentForm => ({
  careType: 'ANTIBIOTIQUE',
  productCode: '',
  productName: 'Oxytétracycline',
  dosage: '',
  route: '',
  administeredAt: '2026-11-01',
  endDate: '',
  reason: 'Coryza',
  animalCount: '480',
  withdrawalDays: '5',
  notes: '',
  ...over,
});
const LIST = [{ code: 'AMOX', label: 'Amoxicilline' }];

describe('treatmentBody', () => {
  it('sends free text while the list is empty', () => {
    const r = treatmentBody(form({ endDate: '2026-11-03' }), []);
    expect(r).toEqual({
      ok: true,
      body: {
        careType: 'ANTIBIOTIQUE',
        productName: 'Oxytétracycline',
        administeredAt: '2026-11-01',
        endDate: '2026-11-03',
        reason: 'Coryza',
        animalCount: 480,
        withdrawalDays: 5,
      },
    });
  });

  it('sends the code once the vets filled the list, never the free text', () => {
    const r = treatmentBody(form({ productCode: 'AMOX' }), LIST);
    expect(r.ok && r.body.productCode).toBe('AMOX');
    expect(r.ok && r.body.productName).toBeUndefined();
    expect(treatmentBody(form({ productCode: '' }), LIST)).toMatchObject({ ok: false });
  });

  it('falls back to free text when the list is unknown (offline)', () => {
    expect(treatmentBody(form(), null)).toMatchObject({ ok: true, body: { productName: 'Oxytétracycline' } });
  });

  it('requires the CDC data: reason, animals, a coherent period', () => {
    expect(treatmentBody(form({ reason: ' ' }), [])).toMatchObject({ ok: false, error: expect.stringContaining('motif') });
    expect(treatmentBody(form({ animalCount: '0' }), [])).toMatchObject({ ok: false });
    expect(treatmentBody(form({ animalCount: '12,5' }), [])).toMatchObject({ ok: false });
    expect(treatmentBody(form({ endDate: '2026-10-30' }), [])).toMatchObject({ ok: false, error: expect.stringContaining('précéder') });
    expect(treatmentBody(form({ productName: '' }), [])).toMatchObject({ ok: false });
  });
});

describe('withdrawalEndPreview', () => {
  it('counts from the last day of treatment, like the server', () => {
    expect(withdrawalEndPreview('2026-11-01', '', '7')).toBe('2026-11-08');
    expect(withdrawalEndPreview('2026-11-01', '2026-11-05', '7')).toBe('2026-11-12');
    expect(withdrawalEndPreview('2026-11-01', '', '0')).toBeNull();
  });
});

describe('completionBody', () => {
  it('keeps the animal count and sends the route only when it changed', () => {
    const base = { completedAt: '2026-11-06', animalCount: '495', route: 'Eau de boisson', notes: '' };
    expect(completionBody(base, 'Eau de boisson')).toEqual({ ok: true, body: { completedAt: '2026-11-06', animalCount: 495 } });
    expect(completionBody({ ...base, route: 'Nébulisation' }, 'Eau de boisson')).toMatchObject({
      ok: true,
      body: { route: 'Nébulisation' },
    });
    expect(completionBody({ ...base, animalCount: '' }, null)).toMatchObject({ ok: false });
  });
});

describe('treatmentPeriodLabel', () => {
  it('shows one day or a period', () => {
    const fmt = (d: string) => d.slice(0, 10);
    expect(treatmentPeriodLabel('2026-11-01T08:00:00Z', null, fmt)).toBe('2026-11-01');
    expect(treatmentPeriodLabel('2026-11-01T08:00:00Z', '2026-11-03', fmt)).toBe('du 2026-11-01 au 2026-11-03');
  });
});
