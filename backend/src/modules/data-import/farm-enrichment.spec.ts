import { describe, expect, it } from 'vitest';
import { planEnrichment, type FarmSheet } from './farm-enrichment.js';

const sheet: FarmSheet = {
  id: 'f1',
  code: 'G1-0001',
  localiteId: null,
  exploitantName: null,
  exploitantPhone: '+24174000001',
  amiRef: null,
  cohort: null,
  capacityPlaces: 1500,
  latitude: null,
  longitude: null,
  statusCode: 'EN_PREPARATION',
};

const ctx = {
  localites: [{ id: 'l1', code: 'G1-02', name: 'Komo-Mondah' }],
  localiteNames: new Map([['l1', 'Komo-Mondah']]),
  cohorts: [{ code: 'COHORTE_1', label: 'Cohorte 1' }],
  statuses: [
    { code: 'EN_PREPARATION', label: 'En préparation' },
    { code: 'OPERATIONNELLE', label: 'Opérationnelle' },
  ],
  takenAmiRefs: new Set<string>(['AMI-9']),
};

describe('planEnrichment', () => {
  it('fills only the empty fields of the sheet', () => {
    const plan = planEnrichment(
      sheet,
      {
        amiRef: 'ami-1',
        localite: 'komo mondah',
        exploitantName: 'Jean Mba',
        exploitantPhone: '+241 74 00 00 01',
        cohort: '1',
        capacityPlaces: '1500',
        latitude: '0,39',
        longitude: '9,45',
      },
      ctx,
    );
    expect(plan.patch).toEqual({
      amiRef: 'AMI-1',
      localiteId: 'l1',
      exploitantName: 'Jean Mba',
      cohort: 'COHORTE_1',
    });
    expect(plan.gps).toEqual({ latitude: 0.39, longitude: 9.45 });
    expect(plan.fields).toEqual([
      'référence AMI',
      'localité',
      'exploitant',
      'cohorte',
      'position GPS',
    ]);
    expect(plan.warnings).toEqual([]);
  });

  it('never overwrites a different value and never takes a status', () => {
    const plan = planEnrichment(
      { ...sheet, latitude: 0.1, longitude: 9.1 },
      {
        exploitantPhone: '074999999',
        capacityPlaces: '3000',
        latitude: '0.2',
        longitude: '9.1',
        status: 'Opérationnelle',
        amiRef: 'AMI-9',
      },
      ctx,
    );
    expect(plan.patch).toEqual({});
    expect(plan.gps).toBeNull();
    expect(plan.warnings).toHaveLength(5);
    expect(plan.warnings.join(' ')).toMatch(/téléphone.*non modifiée/);
    expect(plan.warnings.join(' ')).toMatch(
      /Statut « Opérationnelle » non repris/,
    );
    expect(plan.warnings.join(' ')).toMatch(/AMI-9.*déjà attribuée/);
  });
});
