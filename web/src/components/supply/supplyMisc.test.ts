import { describe, expect, it } from 'vitest';
import type { DeclarativeStockRow } from '../../api/types-supply';
import { declarativeSummary, physicalGap, sortDeclarativeRows, stockFigure, stockTone, stockUnitLabel } from './declarative';
import { deliveryParamsOf, deliveryQueryString, parseDeliveryParams, withDeliveryFilter } from './deliveryQuery';
import { farmDeliveryRights, programmeDeliveryRights } from './supplyAccess';

const row = (over: Partial<DeclarativeStockRow>): DeclarativeStockRow => ({
  key: 'k',
  intrantCode: 'ALIMENT_DEMARRAGE',
  intrantFamily: 'ALIMENT',
  intrantLabel: 'Aliment démarrage',
  unitCode: 'KG',
  unitLabel: null,
  feedPhases: ['DEMARRAGE'],
  trackedSince: '2026-11-01',
  shipped: 1000,
  received: 1000,
  consumed: 300,
  lost: 0,
  sold: 0,
  used: 300,
  stock: 700,
  physicalStock: 650,
  negative: false,
  ...over,
});

describe('declarative stock display', () => {
  it('shows the stock unit and figures', () => {
    expect(stockUnitLabel(row({}))).toBe('kg');
    expect(stockUnitLabel(row({ unitCode: 'TETE' }))).toBe('têtes');
    expect(stockUnitLabel(row({ unitCode: 'DOSE', unitLabel: 'Dose' }))).toBe('dose');
    expect(stockFigure(12.3456, row({}))).toBe('12,346');
    expect(stockFigure(null, row({}))).toBe('—');
  });

  it('puts negative rows first and highlights them', () => {
    const rows = [
      row({ key: 'a', intrantFamily: 'VACCIN', intrantLabel: 'Vaccin' }),
      row({ key: 'b', intrantFamily: 'POUSSIN', intrantLabel: 'Poussins', stock: 0 }),
      row({ key: 'c', intrantLabel: 'Aliment finition', stock: -40, negative: true }),
    ];
    expect(sortDeclarativeRows(rows).map((r) => r.key)).toEqual(['c', 'b', 'a']);
    expect(stockTone(rows[2]!)).toBe('red');
    expect(stockTone(rows[1]!)).toBe('amber');
    expect(stockTone(rows[0]!)).toBe('plain');
    expect(declarativeSummary(rows)).toMatch(/^Stock négatif pour 1 intrant \(Aliment finition\)/);
    expect(declarativeSummary([])).toMatch(/vide/);
  });

  it('gives the gap to the physical stock (none for chicks)', () => {
    expect(physicalGap(row({}))).toBe(50);
    expect(physicalGap(row({ physicalStock: null }))).toBeNull();
  });
});

describe('delivery list filters', () => {
  it('round-trips the URL and builds the server query', () => {
    const f = parseDeliveryParams(new URLSearchParams('province=g1&statut=EXPEDIEE&du=2026-11-01&page=2&x=1'));
    expect(f).toEqual({ province: 'G1', status: 'EXPEDIEE', farmId: '', from: '2026-11-01', to: '', page: 2 });
    expect(deliveryQueryString(f)).toBe('?province=G1&status=EXPEDIEE&from=2026-11-01&page=2&pageSize=25');
    expect(deliveryParamsOf(withDeliveryFilter(f, 'status', ''), new URLSearchParams('x=1')).toString()).toBe('x=1&province=G1&du=2026-11-01');
    expect(parseDeliveryParams(new URLSearchParams('statut=NIMPORTE&du=hier')).status).toBe('');
  });
});

describe('delivery rights', () => {
  it('gives the programme screens from the INTRANTS matrix', () => {
    expect(programmeDeliveryRights('PLATFORM_ADMIN', null)).toEqual({ view: true, record: true });
    expect(programmeDeliveryRights('INSTITUTION', { scopeKind: 'ALL', matrix: { INTRANTS: ['CONSULTER', 'CREER'] } })).toEqual({ view: true, record: true });
    expect(programmeDeliveryRights('INSTITUTION', { scopeKind: 'FARMS', matrix: { INTRANTS: ['CONSULTER'] } })).toEqual({ view: true, record: false });
    expect(programmeDeliveryRights('INSTITUTION', { scopeKind: 'AGGREGATE', matrix: { INTRANTS: ['CONSULTER'] } }).view).toBe(false);
    expect(programmeDeliveryRights('PROPRIETAIRE', null).view).toBe(false);
  });

  it('keeps the confirmation with the farmer holding stock:gerer', () => {
    const all = () => true;
    const none = () => false;
    expect(farmDeliveryRights('PROPRIETAIRE', all)).toEqual({ confirm: true, openBand: true });
    expect(farmDeliveryRights('ELEVEUR', none)).toEqual({ confirm: false, openBand: false });
    expect(farmDeliveryRights('PLATFORM_ADMIN', all).confirm).toBe(false);
    expect(farmDeliveryRights('INSTITUTION', all).confirm).toBe(false);
    expect(farmDeliveryRights('ELEVEUR', (c) => c === 'stock:gerer')).toEqual({ confirm: true, openBand: false });
  });
});
