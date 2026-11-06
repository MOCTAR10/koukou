import { describe, expect, it } from 'vitest';

import type { RefItem } from '@/api/poufa';
import {
  allowedSortieReasons,
  buildSortiePayload,
  emptySortieDraft,
  SORTIE_RECIPIENT_REQUIRED,
  SORTIE_SALE_WARNING,
  sortieFamilyHint,
  sortieRefusal,
} from './sorties';

const reason = (code: string, family: string | null, sort: number, active = true): RefItem => ({
  id: code,
  listType: 'MOTIF_SORTIE',
  code,
  label: code,
  family,
  meta: null,
  sort,
  active,
});

const reasons = [
  reason('VENTE_VIF', 'VENTE', 1),
  reason('ABATTOIR', 'ABATTOIR', 2),
  reason('REFORME', 'REFORME', 3),
  reason('DON', 'AUTRE', 5),
  reason('ANCIEN', 'AUTRE', 0, false),
  reason('SANS_FAMILLE', null, 0),
];

const ctx = { family: 'AUTRE', alive: 100, integrationDate: '2026-10-01', today: '2026-11-06', closed: false };

describe('motifs autorisés', () => {
  it('filtre selon le droit de la famille', () => {
    expect(allowedSortieReasons(reasons, () => true).map((r) => r.code)).toEqual(['VENTE_VIF', 'ABATTOIR', 'REFORME', 'DON']);
    expect(allowedSortieReasons(reasons, (c) => c === 'vente:creer').map((r) => r.code)).toEqual(['VENTE_VIF', 'REFORME', 'DON']);
    expect(allowedSortieReasons(reasons, () => false).map((r) => r.code)).toEqual(['REFORME', 'DON']);
  });
});

describe('sortieRefusal', () => {
  const ok = { ...emptySortieDraft('2026-11-06'), reasonCode: 'DON', count: '10', recipientName: 'Paroisse' };

  it('valide une sortie simple', () => {
    expect(sortieRefusal(ok, ctx)).toBeNull();
  });

  it('destinataire obligatoire : un nom libre ou un opérateur', () => {
    expect(sortieRefusal({ ...ok, recipientName: '  ' }, ctx)).toBe(SORTIE_RECIPIENT_REQUIRED);
    expect(sortieRefusal({ ...ok, recipientName: '', operatorId: 'op-1' }, ctx)).toBeNull();
  });

  it('bande clôturée, motif, nombre, date', () => {
    expect(sortieRefusal(ok, { ...ctx, closed: true })).toMatch(/clôturée/);
    expect(sortieRefusal({ ...ok, reasonCode: '' }, { ...ctx, family: null })).toMatch(/motif/);
    expect(sortieRefusal({ ...ok, count: '0' }, ctx)).toMatch(/au moins 1/);
    expect(sortieRefusal({ ...ok, count: '2,5' }, ctx)).toMatch(/entier/);
    expect(sortieRefusal({ ...ok, count: '101' }, ctx)).toMatch(/101 sujet/);
    expect(sortieRefusal({ ...ok, sortieDate: '2026-11-08' }, ctx)).toMatch(/futur/);
    expect(sortieRefusal({ ...ok, sortieDate: '2026-09-30' }, ctx)).toMatch(/précéder/);
    expect(sortieRefusal({ ...ok, weightKg: '0' }, ctx)).toMatch(/poids/i);
  });

  it('vente : prix requis, poids requis au kg', () => {
    const sale = { ...ok, reasonCode: 'VENTE_VIF' };
    const vctx = { ...ctx, family: 'VENTE' };
    expect(sortieRefusal(sale, vctx)).toMatch(/prix/);
    expect(sortieRefusal({ ...sale, unitPriceFcfa: '3500' }, vctx)).toBeNull();
    expect(sortieRefusal({ ...sale, unitPriceFcfa: '1800', priceUnit: 'KG' }, vctx)).toMatch(/poids/);
    expect(sortieRefusal({ ...sale, unitPriceFcfa: '1800', priceUnit: 'KG', weightKg: '22,5' }, vctx)).toBeNull();
  });
});

describe('buildSortiePayload', () => {
  it('champs optionnels seulement si saisis, prix pour une vente', () => {
    const draft = { ...emptySortieDraft('2026-11-06'), reasonCode: 'DON', count: '10', recipientName: ' Paroisse ', weightKg: '' };
    expect(buildSortiePayload(draft, 'AUTRE')).toEqual({ sortieDate: '2026-11-06', count: 10, reasonCode: 'DON', recipientName: 'Paroisse' });
    const sale = { ...draft, reasonCode: 'VENTE_VIF', unitPriceFcfa: '3500', operatorId: 'op-1', weightKg: '20,5' };
    expect(buildSortiePayload(sale, 'VENTE')).toMatchObject({ unitPriceFcfa: 3500, priceUnit: 'TETE', operatorId: 'op-1', weightKg: 20.5 });
  });

  it('explique chaque famille', () => {
    expect(sortieFamilyHint('ABATTOIR')).toMatch(/abattage/);
    expect(sortieFamilyHint('ABATTOIR')).toMatch(/dès la sortie/);
    expect(SORTIE_SALE_WARNING).toMatch(/ne la ressaisissez pas en caisse/);
    expect(sortieFamilyHint(null)).toBe('');
  });
});
