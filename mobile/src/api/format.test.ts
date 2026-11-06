import { describe, it, expect } from 'vitest';

import { givenName, initials, provinceName } from './format';

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

describe('provinceName', () => {
  const provinces = [
    { id: 'p-1', name: 'Estuaire' },
    { id: 'p-2', name: 'Haut-Ogooué' },
  ];

  it('retrouve la province de la ferme', () => {
    expect(provinceName(provinces, 'p-2')).toBe('Haut-Ogooué');
  });

  it('null sans province, liste absente ou identifiant inconnu', () => {
    expect(provinceName(provinces, null)).toBeNull();
    expect(provinceName(undefined, 'p-1')).toBeNull();
    expect(provinceName(provinces, 'p-9')).toBeNull();
  });
});
