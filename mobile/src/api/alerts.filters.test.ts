import { describe, expect, it } from 'vitest';

import { filterAlerts, kindLabel, kindsWithCounts, countLevel, countStatus } from './alerts.filters';
import type { Alert } from './types';

function alert(over: Partial<Alert>): Alert {
  return {
    id: 'a1',
    farmId: 'f-1',
    batchId: null,
    batchName: null,
    category: 'ALERTE',
    kind: 'EAU',
    level: 'JAUNE',
    status: 'ACTIVE',
    message: 'Baisse de consommation',
    recommendation: null,
    why: [],
    createdAt: '2026-08-28T06:00:00.000Z',
    dueDate: null,
    ...over,
  };
}

const list: Alert[] = [
  alert({ id: 'r', kind: 'MORTALITE', level: 'ROUGE', status: 'ACTIVE' }),
  alert({ id: 'a', kind: 'EAU', level: 'JAUNE', status: 'ACQUITTEE' }),
  alert({ id: 's', category: 'SAISIE', kind: 'SAISIE', level: 'JAUNE', status: 'ACTIVE' }),
  alert({ id: 'z', kind: 'EAU', level: 'VERT', status: 'RESOLUE' }),
];

describe('kindLabel', () => {
  it('traduit les kinds connus et se replie sur la valeur brute', () => {
    expect(kindLabel('MORTALITE')).toBe('Mortalité');
    expect(kindLabel('HEAT')).toBe('Stress thermique');
    expect(kindLabel('INCONNU_XYZ')).toBe('INCONNU_XYZ');
  });
});

describe('kindsWithCounts', () => {
  it('décompte et trie par fréquence', () => {
    const kinds = kindsWithCounts(list);
    expect(kinds).toEqual([
      { kind: 'EAU', label: 'Eau', count: 2 },
      { kind: 'MORTALITE', label: 'Mortalité', count: 1 },
      { kind: 'SAISIE', label: 'Saisie', count: 1 },
    ]);
  });

  it('retourne vide sans alerte', () => {
    expect(kindsWithCounts([])).toEqual([]);
  });
});

describe('filterAlerts', () => {
  it('applique niveau, statut et kind', () => {
    expect(filterAlerts(list, { level: 'ROUGE', status: 'TOUTES', kind: null }).map((a) => a.id)).toEqual(['r']);
  });

  it('filtre par statut ACTIVE / ACQUITTEE / RESOLUE', () => {
    expect(filterAlerts(list, { level: 'TOUTES', status: 'ACTIVE', kind: null }).map((a) => a.id)).toEqual(['r', 's']);
    expect(filterAlerts(list, { level: 'TOUTES', status: 'RESOLUE', kind: null }).map((a) => a.id)).toEqual(['z']);
    expect(filterAlerts(list, { level: 'TOUTES', status: 'TOUTES', kind: null })).toHaveLength(4);
  });

  it('filtre par kind', () => {
    expect(filterAlerts(list, { level: 'TOUTES', status: 'TOUTES', kind: 'EAU' }).map((a) => a.id)).toEqual(['a', 'z']);
  });

  it('retourne vide quand aucun ne matche', () => {
    expect(filterAlerts(list, { level: 'VERT', status: 'ACTIVE', kind: null })).toEqual([]);
  });
});

describe('countLevel / countStatus', () => {
  it('décompte par niveau et statut', () => {
    expect(countLevel(list, 'ROUGE')).toBe(1);
    expect(countLevel(list, 'VERT')).toBe(1);
    expect(countStatus(list, 'ACTIVE')).toBe(2);
    expect(countStatus(list, 'RESOLUE')).toBe(1);
  });
});