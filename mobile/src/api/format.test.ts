import { describe, it, expect } from 'vitest';

import { farmProvinceLabel, givenName, initials } from './format';

describe('format', () => {
  it('initials : deux premières initiales en majuscules', () => {
    expect(initials('M. Joseph Ndong')).toBe('MJ');
    expect(initials('Jean-Marc Ondo')).toBe('JO');
    expect(initials('Binta')).toBe('B');
    expect(initials('  ')).toBe('');
  });

  it('givenName : ignore la civilité', () => {
    expect(givenName('M. Joseph Ndong')).toBe('Joseph');
    expect(givenName('Mme Binta Ako')).toBe('Binta');
    expect(givenName('Joseph Ndong')).toBe('Joseph');
    expect(givenName('Binta')).toBe('Binta');
  });
});

describe('farmProvinceLabel', () => {
  it('affiche la province servie par GET /farms', () => {
    expect(farmProvinceLabel({ provinceCode: 'G2', provinceName: 'Haut-Ogooué' })).toBe('Haut-Ogooué');
  });

  it('repli sur le code quand le nom manque', () => {
    expect(farmProvinceLabel({ provinceCode: 'G1', provinceName: null })).toBe('G1');
    expect(farmProvinceLabel({ provinceCode: 'G1', provinceName: '  ' })).toBe('G1');
  });

  it('null sans province ou sans ferme (session enregistrée avant ces champs)', () => {
    expect(farmProvinceLabel({ provinceCode: null, provinceName: null })).toBeNull();
    expect(farmProvinceLabel({})).toBeNull();
    expect(farmProvinceLabel(undefined)).toBeNull();
  });
});
