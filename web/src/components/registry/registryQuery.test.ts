import { describe, expect, it } from 'vitest';
import type { ProvinceView } from '../../api/types-programme';
import {
  EMPTY_FILTERS,
  hasActiveFilter,
  localitesOf,
  pageCount,
  pageRangeLabel,
  parseRegistryParams,
  registryParamsOf,
  registryQueryString,
  withFilter,
} from './registryQuery';

const loc = (id: string, provinceId: string) => ({ id, provinceId, code: id, name: id, kind: 'COMMUNE', chefLieu: null, active: true, sort: 0 });
const provinces: ProvinceView[] = [
  { id: 'p1', code: 'G1', name: 'Estuaire', chefLieu: 'Libreville', sort: 1, hasGeometry: false, localites: [loc('l1', 'p1'), loc('l2', 'p1')] },
  { id: 'p2', code: 'G2', name: 'Haut-Ogooué', chefLieu: 'Franceville', sort: 2, hasGeometry: true, localites: [loc('l3', 'p2')] },
];

describe('registryQueryString', () => {
  it('sends only the filters set, with the page and a capped page size', () => {
    expect(registryQueryString(EMPTY_FILTERS)).toBe('?page=1&pageSize=50');
    expect(registryQueryString({ ...EMPTY_FILTERS, province: 'G1', q: '  Ngoma ', status: 'SUSPENDUE', page: 3 }, 500)).toBe(
      '?province=G1&status=SUSPENDUE&q=Ngoma&page=3&pageSize=200',
    );
  });

  it('encodes the search text', () => {
    expect(registryQueryString({ ...EMPTY_FILTERS, q: 'N’Toum & fils' })).toBe('?q=N%E2%80%99Toum+%26+fils&page=1&pageSize=50');
  });
});

describe('URL parameters', () => {
  it('round-trips the filters and keeps the open sheet', () => {
    const filters = { ...EMPTY_FILTERS, province: 'G2', localiteId: 'l3', cohort: 'COHORTE_1', page: 2 };
    const params = registryParamsOf(filters, new URLSearchParams('ferme=abc&q=old'));
    expect(params.get('ferme')).toBe('abc');
    expect(params.get('q')).toBeNull();
    expect(parseRegistryParams(params)).toEqual(filters);
  });

  it('falls back to page 1 on a bad page', () => {
    expect(parseRegistryParams(new URLSearchParams('page=-4')).page).toBe(1);
    expect(parseRegistryParams(new URLSearchParams('page=abc')).page).toBe(1);
    expect(parseRegistryParams(new URLSearchParams('page=2.5')).page).toBe(1);
    expect(registryParamsOf(EMPTY_FILTERS).toString()).toBe('');
  });
});

describe('withFilter', () => {
  it('goes back to page 1 on any filter change', () => {
    expect(withFilter({ ...EMPTY_FILTERS, page: 4 }, 'status', 'OPERATIONNELLE').page).toBe(1);
    expect(withFilter({ ...EMPTY_FILTERS, page: 4 }, 'page', 5).page).toBe(5);
  });

  it('drops a localité of another province', () => {
    const start = { ...EMPTY_FILTERS, province: 'G1', localiteId: 'l1' };
    expect(withFilter(start, 'province', 'G2', provinces).localiteId).toBe('');
    expect(withFilter({ ...start, province: '' }, 'province', 'G1', provinces).localiteId).toBe('l1');
  });

  it('tells whether something narrows the list', () => {
    expect(hasActiveFilter(EMPTY_FILTERS)).toBe(false);
    expect(hasActiveFilter({ ...EMPTY_FILTERS, page: 3 })).toBe(false);
    expect(hasActiveFilter({ ...EMPTY_FILTERS, q: 'x' })).toBe(true);
  });
});

describe('localitesOf', () => {
  it('offers the province’s localités, or all of them', () => {
    expect(localitesOf(provinces, 'g2').map((l) => l.id)).toEqual(['l3']);
    expect(localitesOf(provinces, '').map((l) => l.id)).toEqual(['l1', 'l2', 'l3']);
    expect(localitesOf(provinces, 'G9')).toEqual([]);
  });
});

describe('pagination', () => {
  it('counts pages and words the range', () => {
    expect(pageCount(0, 50)).toBe(1);
    expect(pageCount(152, 50)).toBe(4);
    expect(pageRangeLabel(152, 2, 50)).toBe('51–100 sur 152');
    expect(pageRangeLabel(152, 4, 50)).toBe('151–152 sur 152');
    expect(pageRangeLabel(0, 1, 50)).toBe('Aucune ferme');
  });
});
