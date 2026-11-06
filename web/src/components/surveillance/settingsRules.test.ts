import { describe, expect, it } from 'vitest';
import type { Lot } from '../../api/types-flock';
import { refFromLot, refFromSanitaryLot } from './sanitaryLot';
import {
  codeFromLabel,
  emptyStepForm,
  lastActiveWarning,
  newItemBody,
  newItemProblem,
  nextSort,
  sharedCalendars,
  sortedSteps,
  stepBody,
  stepProblem,
} from './settingsRules';

describe('sanitary list items', () => {
  it('derives a stable code from the label', () => {
    expect(codeFromLabel('Diarrhée verte')).toBe('DIARRHEE_VERTE');
    expect(codeFromLabel('  Œdème / tête ')).toBe('DEME_TETE');
    expect(codeFromLabel('a'.repeat(60))).toHaveLength(40);
  });

  it('validates a new item, the family for STATUT_ALERTE only', () => {
    const existing = [{ code: 'TOUX' }];
    expect(newItemProblem('SIGNE_CLINIQUE', { code: 'TOUX', label: 'Toux', family: '' }, existing)).toMatch(/existe déjà/);
    expect(newItemProblem('SIGNE_CLINIQUE', { code: 'RALE', label: 'Râles', family: '' }, existing)).toBeNull();
    expect(newItemProblem('STATUT_ALERTE', { code: 'PRELEV', label: 'Prélèvement', family: '' }, existing)).toMatch(/famille/);
    expect(newItemProblem('PRODUIT_TRAITEMENT', { code: 'x', label: 'X', family: '' }, existing)).toMatch(/code/);
    expect(newItemBody('SIGNE_CLINIQUE', { code: 'RALE', label: ' Râles ', family: 'NOUVELLE' }, 30)).toEqual({ code: 'RALE', label: 'Râles', sort: 30 });
    expect(newItemBody('STATUT_ALERTE', { code: 'P', label: 'P', family: 'EN_ANALYSE' }, 30)).toEqual({ code: 'P', label: 'P', family: 'EN_ANALYSE', sort: 30 });
    expect(nextSort([{ sort: 5 }, { sort: 20 }])).toBe(30);
  });

  it('warns before deactivating the last active status of a family', () => {
    const items = [
      { code: 'A', family: 'EN_ANALYSE', active: true },
      { code: 'B', family: 'EN_ANALYSE', active: false },
      { code: 'C', family: 'CLOSE', active: true },
      { code: 'D', family: 'CLOSE', active: true },
    ];
    expect(lastActiveWarning('STATUT_ALERTE', items[0]!, items)).toMatch(/Dernier statut actif de la famille EN_ANALYSE/);
    expect(lastActiveWarning('STATUT_ALERTE', items[2]!, items)).toBeNull();
    expect(lastActiveWarning('SIGNE_CLINIQUE', items[0]!, items)).toBeNull();
  });
});

describe('calendar steps', () => {
  it('validates the window and builds the body', () => {
    const form = { ...emptyStepForm(1), name: 'Gumboro', dayFrom: '14', dayTo: '12' };
    expect(stepProblem(form)).toMatch(/précéder/);
    expect(stepProblem({ ...form, dayTo: '' })).toMatch(/entiers/);
    const ok = { ...form, dayTo: '16', route: 'Eau de boisson' };
    expect(stepProblem(ok)).toBeNull();
    expect(stepBody(ok)).toEqual({ stepOrder: 1, dayFrom: 14, dayTo: 16, careType: 'VACCIN', name: 'Gumboro', route: 'Eau de boisson', withdrawalDays: 0 });
  });

  it('sorts steps by age and keeps shared calendars only', () => {
    expect(sortedSteps([{ stepOrder: 2, dayFrom: 10 }, { stepOrder: 1, dayFrom: 10 }, { stepOrder: 3, dayFrom: 1 }])).toEqual([
      { stepOrder: 3, dayFrom: 1 },
      { stepOrder: 1, dayFrom: 10 },
      { stepOrder: 2, dayFrom: 10 },
    ]);
    expect(sharedCalendars([{ farmId: null }, { farmId: 'f' }])).toEqual([{ farmId: null }]);
  });
});

describe('sanitary lot refs', () => {
  it('reads a vet’s band (no TECHNIQUE) and a farm lot the same way', () => {
    const ref = refFromSanitaryLot(
      { id: 'b', code: 'G1-0012-B07', name: null, species: 'POULET', type: 'CHAIR', status: 'ACTIF', integrationDate: '2026-11-01', ageDays: 10, quantityAtStart: 500, quantityAlive: 480, closedAt: null, building: null },
      '2026-11-06',
    );
    expect(ref).toMatchObject({ batchName: 'G1-0012-B07', liveCount: 480, ageDays: 10, ageZeroDay: '2026-10-27' });
    const lot = { id: 'l', batchName: 'Lot A', species: 'POULET', type: 'CHAIR', breedName: 'Cobb', integrationDate: '2026-11-01', initialAgeDays: 5, metrics: { liveCount: 90, ageDays: 10 } } as unknown as Lot;
    expect(refFromLot(lot)).toMatchObject({ batchName: 'Lot A', breedName: 'Cobb', liveCount: 90, ageZeroDay: '2026-10-27' });
  });
});
