import { describe, expect, it } from 'vitest';

import {
  collectionRate,
  compactFcfa,
  deltaPct,
  marginPct,
  periodLabel,
  plainPct,
  rankBreakdown,
  sharePct,
  shiftWindow,
  signedPct,
  sumFcfa,
  toDateStr,
} from './pnlAnalytics';

describe('shiftWindow', () => {
  it('recule la fenêtre de la même longueur', () => {
    expect(shiftWindow('2026-09-01', '2026-09-30')).toEqual({ from: '2026-08-02', to: '2026-08-31' });
  });

  it('gère une fenêtre d’un seul jour', () => {
    expect(shiftWindow('2026-09-10', '2026-09-10')).toEqual({ from: '2026-09-09', to: '2026-09-09' });
  });

  it('traverse le mois et l’année', () => {
    // 31 jours (1 → 31 janvier) : la fenêtre précédente fait le même nombre de jours.
    expect(shiftWindow('2026-01-01', '2026-01-31')).toEqual({ from: '2025-12-01', to: '2025-12-31' });
  });

  it('reste inerte sans bornes', () => {
    expect(shiftWindow(undefined, '2026-09-30')).toEqual({ from: undefined, to: undefined });
    expect(shiftWindow('2026-09-01', undefined)).toEqual({ from: undefined, to: undefined });
  });
});

describe('periodLabel', () => {
  it('compacte un mois entier', () => {
    expect(periodLabel('2026-09-01', '2026-09-30', 30)).toBe('1 – 30 septembre 2026');
  });

  it('garde le jour quand le début est dans le mois précédent', () => {
    expect(periodLabel('2026-08-28', '2026-09-26', 30)).toBe('28 août – 26 septembre 2026');
  });

  it('distingue deux années', () => {
    expect(periodLabel('2025-12-20', '2026-01-19', 30)).toBe('20 déc. 2025 – 19 janv. 2026');
  });

  it('annonce l’historique complet', () => {
    expect(periodLabel(undefined, '2026-09-30', 'all')).toBe('Tout l’historique');
  });

  it('ne jette pas sur des bornes invalides', () => {
    expect(periodLabel('pas-une-date', '2026-09-30', 30)).toBe('pas-une-date → 2026-09-30');
  });
});

describe('toDateStr', () => {
  it('formate en YYYY-MM-DD avec zéros', () => {
    expect(toDateStr(new Date(2026, 0, 5))).toBe('2026-01-05');
  });
});

describe('deltaPct', () => {
  it('calcule la variation signée', () => {
    expect(deltaPct(150, 100)).toBeCloseTo(50);
    expect(deltaPct(50, 100)).toBeCloseTo(-50);
  });

  it('renvoie null si la base est nulle ou absente', () => {
    expect(deltaPct(100, 0)).toBeNull();
    expect(deltaPct(100, undefined)).toBeNull();
    expect(deltaPct(undefined, 100)).toBeNull();
  });

  it('reste correct sur une base négative (perte)', () => {
    // -50 contre -100 : on est passé de -100 à -50, donc 50 % de mieux.
    expect(deltaPct(-50, -100)).toBeCloseTo(50);
  });
});

describe('marginPct', () => {
  it('divise le net par le chiffre d’affaires', () => {
    expect(marginPct(25_000, 100_000)).toBeCloseTo(25);
  });

  it('renvoie null sans chiffre d’affaires', () => {
    expect(marginPct(0, 0)).toBeNull();
  });
});

describe('collectionRate', () => {
  it('calcule le taux d’encaissement', () => {
    expect(collectionRate(75_000, 100_000)).toBeCloseTo(75);
  });

  it('borne entre 0 et 100', () => {
    expect(collectionRate(150_000, 100_000)).toBe(100);
    expect(collectionRate(-5_000, 100_000)).toBe(0);
  });

  it('renvoie null sans vente', () => {
    expect(collectionRate(0, 0)).toBeNull();
  });
});

describe('sharePct', () => {
  it('calcule la part', () => {
    expect(sharePct(30_000, 120_000)).toBeCloseTo(25);
  });

  it('renvoie 0 sur un total nul ou négatif', () => {
    expect(sharePct(1_000, 0)).toBe(0);
    expect(sharePct(1_000, -5)).toBe(0);
  });
});

describe('rankBreakdown', () => {
  const items = [
    { label: 'Aliment', amountFcfa: 60_000 },
    { label: 'Main-d’œuvre', amountFcfa: 30_000 },
    { label: 'Vide', amountFcfa: 0 },
  ];

  it('trie du plus gros au plus petit et donne la part', () => {
    const ranked = rankBreakdown(items, 100_000);
    expect(ranked.map((r) => r.item.label)).toEqual(['Aliment', 'Main-d’œuvre']);
    expect(ranked[0].pct).toBeCloseTo(60);
    expect(ranked[1].pct).toBeCloseTo(30);
  });

  it('écarte les postes à zéro', () => {
    expect(rankBreakdown(items, 100_000)).toHaveLength(2);
  });

  it('donne 0 % quand le total est nul (pas de division par zéro)', () => {
    const ranked = rankBreakdown([{ label: 'X', amountFcfa: 5_000 }], 0);
    expect(ranked[0].pct).toBe(0);
  });

  it('ne mute pas la source', () => {
    const source = [...items];
    rankBreakdown(source, 100_000);
    expect(source.map((i) => i.label)).toEqual(['Aliment', 'Main-d’œuvre', 'Vide']);
  });
});

describe('sumFcfa', () => {
  it('additionne les montants', () => {
    expect(sumFcfa([{ amountFcfa: 10 }, { amountFcfa: 20 }])).toBe(30);
  });

  it('tolère l’absence de liste', () => {
    expect(sumFcfa(undefined)).toBe(0);
  });
});

describe('format', () => {
  /** `fr-FR` insère une espace fine insécable (U+202F) comme séparateur de milliers. */
  const sp = (s: string) => s.replace(/\u202f/g, ' ');

  it('compacte les grands montants', () => {
    expect(sp(compactFcfa(2_400_000))).toBe('2,4 M');
    expect(sp(compactFcfa(340_000))).toBe('340 k');
    expect(sp(compactFcfa(1_500))).toBe('1 500');
    expect(sp(compactFcfa(-2_400_000))).toBe('-2,4 M');
  });

  it('signe les variations', () => {
    expect(sp(signedPct(12.44) ?? '')).toBe('+12,4 %');
    expect(sp(signedPct(-3) ?? '')).toBe('-3 %');
    expect(sp(signedPct(0) ?? '')).toBe('0 %');
    expect(signedPct(null)).toBeNull();
  });

  it('formate un pourcentage neutre', () => {
    expect(sp(plainPct(4.25) ?? '')).toBe('4,3 %');
    expect(plainPct(null)).toBeNull();
  });
});