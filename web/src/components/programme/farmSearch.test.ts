import { describe, expect, it } from 'vitest';
import { farmOptionLabel, foldText, searchFarms } from './farmSearch';

const farms = [
  { id: '1', name: 'Agri Vert', code: 'G2-0001', exploitantName: 'Paul Obame', administrativeCity: 'Franceville', provinceId: 'p2' },
  { id: '2', name: 'Élevage de Ntoum', code: 'G1-0012', exploitantName: 'Jean Mba', administrativeCity: 'Ntoum', provinceId: 'p1' },
  { id: '3', name: 'Ferme G1 Avenir', code: 'G3-0004', exploitantName: null, administrativeCity: 'Lambaréné', provinceId: 'p3' },
];
const provinces = new Map([
  ['p1', 'Estuaire'],
  ['p2', 'Haut-Ogooué'],
  ['p3', 'Moyen-Ogooué'],
]);

describe('searchFarms', () => {
  it('ignores case and accents and needs every word', () => {
    expect(searchFarms(farms, 'elevage NTOUM').map((f) => f.id)).toEqual(['2']);
    expect(searchFarms(farms, 'lambarene').map((f) => f.id)).toEqual(['3']);
    expect(searchFarms(farms, 'jean ogooue')).toEqual([]);
  });

  it('finds by exploitant and province name', () => {
    expect(searchFarms(farms, 'obame').map((f) => f.id)).toEqual(['1']);
    expect(searchFarms(farms, 'estuaire', provinces).map((f) => f.id)).toEqual(['2']);
    expect(searchFarms(farms, 'ogooue', provinces).map((f) => f.id)).toEqual(['1', '3']);
  });

  it('puts the farm whose code starts with the query first', () => {
    expect(searchFarms(farms, 'g1').map((f) => f.id)).toEqual(['2', '3']);
    expect(searchFarms(farms, 'G10012').map((f) => f.id)).toEqual([]);
    expect(searchFarms(farms, 'g1-0012').map((f) => f.id)).toEqual(['2']);
  });

  it('returns every farm for an empty query', () => {
    expect(searchFarms(farms, '  ')).toHaveLength(3);
  });
});

describe('labels', () => {
  it('folds and labels', () => {
    expect(foldText('  Élevage   N’Toum ')).toBe('elevage n’toum');
    expect(farmOptionLabel({ code: 'G1-0012', name: 'Ntoum' })).toBe('G1-0012 · Ntoum');
    expect(farmOptionLabel({ code: null, name: 'Ntoum' })).toBe('Ntoum');
  });
});
