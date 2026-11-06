import { describe, expect, it } from 'vitest';
import {
  canRemoveCare,
  careNeedsTreatmentDetails,
  careOpensTreatment,
  careTreatmentBody,
  completionBody,
  postponedLabel,
  treatmentBody,
  treatmentPeriodLabel,
  withdrawalEndPreview,
  type TreatmentForm,
} from './sanitary-records';

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

describe('careTreatmentBody (POUFA lot A2: « Fait » of a care)', () => {
  const LIST = [{ code: 'DOXY', label: 'Doxycycline' }];
  const manual = { name: 'Doxycycline', withdrawalDays: 4, protocolStepId: null, productCode: null };
  const empty = { productCode: '', endDate: '', reason: '' };

  it('sends nothing for a care without withdrawal period', () => {
    expect(careOpensTreatment({ withdrawalDays: 0 })).toBe(false);
    expect(careTreatmentBody({ ...manual, withdrawalDays: 0 }, empty, '2026-11-06', LIST)).toEqual({ ok: true, body: {} });
  });

  it('a manual care needs the product from the list, the reason and the end day', () => {
    expect(careNeedsTreatmentDetails(manual)).toBe(true);
    expect(careTreatmentBody(manual, { ...empty, reason: 'Coryza', endDate: '2026-11-08' }, '2026-11-06', LIST)).toMatchObject({
      ok: false,
      error: expect.stringContaining('liste'),
    });
    expect(careTreatmentBody(manual, { ...empty, productCode: 'DOXY', endDate: '2026-11-08' }, '2026-11-06', LIST)).toMatchObject({
      ok: false,
      error: expect.stringContaining('motif'),
    });
    expect(careTreatmentBody(manual, { ...empty, productCode: 'DOXY', reason: 'Coryza' }, '2026-11-06', LIST)).toMatchObject({
      ok: false,
      error: expect.stringContaining('date de fin'),
    });
    expect(
      careTreatmentBody(manual, { productCode: 'DOXY', reason: ' Coryza ', endDate: '2026-11-08' }, '2026-11-06', LIST),
    ).toEqual({ ok: true, body: { productCode: 'DOXY', reason: 'Coryza', endDate: '2026-11-08' } });
  });

  it('keeps the product picked at planning, and sends none while the list is empty or unknown', () => {
    const planned = { ...manual, productCode: 'DOXY' };
    const form = { productCode: '', reason: 'Coryza', endDate: '2026-11-06' };
    expect(careTreatmentBody(planned, form, '2026-11-06', LIST)).toMatchObject({ ok: true, body: { productCode: 'DOXY' } });
    expect(careTreatmentBody(manual, form, '2026-11-06', [])).toEqual({ ok: true, body: { reason: 'Coryza', endDate: '2026-11-06' } });
    expect(careTreatmentBody(manual, form, '2026-11-06', null)).toMatchObject({ ok: true });
  });

  it('refuses an end before the completion; a programme step needs nothing more', () => {
    expect(careTreatmentBody(manual, { productCode: 'DOXY', reason: 'Coryza', endDate: '2026-11-01' }, '2026-11-06', LIST)).toMatchObject({
      ok: false,
    });
    const step = { ...manual, protocolStepId: 'step-1' };
    expect(careNeedsTreatmentDetails(step)).toBe(false);
    expect(careTreatmentBody(step, empty, '2026-11-06', LIST)).toEqual({ ok: true, body: {} });
  });
});

describe('reference calendar steps', () => {
  const fmt = (d: string) => d.split('-').reverse().join('/');

  it('labels a postponement with its reference date', () => {
    expect(postponedLabel({ isReference: true, originalDate: '2026-11-10' }, fmt)).toBe('Reporté · date de référence 10/11/2026');
    expect(postponedLabel({ isReference: false, originalDate: '2026-11-10' }, fmt)).toBe('Reporté · prévu le 10/11/2026');
    expect(postponedLabel({ isReference: true, originalDate: null }, fmt)).toBeNull();
  });

  it('only an institution may withdraw a reference step', () => {
    expect(canRemoveCare({ isReference: true }, false)).toBe(false);
    expect(canRemoveCare({ isReference: true }, true)).toBe(true);
    expect(canRemoveCare({ isReference: false }, false)).toBe(true);
  });
});
