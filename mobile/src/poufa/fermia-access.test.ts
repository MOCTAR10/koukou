import { describe, expect, it } from 'vitest';

import {
  FERMIA_READ_CODE,
  fermiaReadOnly,
  fermiaWrites,
  menuItemVisible,
  readsEconomieSynthesis,
  readsFermiaArea,
} from './fermia-access';

const codes = (...list: string[]) => (code: string) => list.includes(code);
const none = codes();

describe('readsFermiaArea', () => {
  it('farm accounts read every area (their screens keep their own codes)', () => {
    for (const role of ['PROPRIETAIRE', 'ELEVEUR', 'PLATFORM_ADMIN'] as const) {
      expect(readsFermiaArea(role, 'VENTES', none)).toBe(true);
      expect(readsFermiaArea(role, 'COMPTABILITE', none)).toBe(true);
    }
  });

  it('an institution reads an area only with the code its matrix grant gives', () => {
    const dge = codes('caisse:lire', 'compta:lire', 'rh:lire', 'market:lire', 'compta:rapports');
    expect(readsFermiaArea('INSTITUTION', 'VENTES', dge)).toBe(true);
    expect(readsFermiaArea('INSTITUTION', 'MARCHE', dge)).toBe(true);
    expect(readsFermiaArea('INSTITUTION', 'COMPTABILITE', dge)).toBe(true);
    expect(readsFermiaArea('INSTITUTION', 'EQUIPE', dge)).toBe(true);
    expect(readsFermiaArea('INSTITUTION', 'ECONOMIQUE', dge)).toBe(true);
    const agent = codes('saisie:creer', 'intrants:lire', 'registre:gps');
    for (const area of Object.keys(FERMIA_READ_CODE) as (keyof typeof FERMIA_READ_CODE)[]) {
      expect(readsFermiaArea('INSTITUTION', area, agent)).toBe(false);
    }
  });

  it('a write code alone does not open the area to an institution', () => {
    expect(readsFermiaArea('INSTITUTION', 'VENTES', codes('vente:creer'))).toBe(false);
  });

  it('buyers, operators and unknown roles read nothing', () => {
    const all = () => true;
    expect(readsFermiaArea('ACHETEUR', 'VENTES', all)).toBe(false);
    expect(readsFermiaArea('OPERATEUR', 'VENTES', all)).toBe(false);
    expect(readsFermiaArea(undefined, 'VENTES', all)).toBe(false);
  });
});

describe('read-only', () => {
  it('institutions never write on a Fermia screen, whatever their codes', () => {
    expect(fermiaReadOnly('INSTITUTION')).toBe(true);
    expect(fermiaWrites('INSTITUTION', true)).toBe(false);
    expect(fermiaReadOnly('PROPRIETAIRE')).toBe(false);
    expect(fermiaWrites('PROPRIETAIRE', true)).toBe(true);
    expect(fermiaWrites('ELEVEUR', false)).toBe(false);
  });
});

describe('readsEconomieSynthesis', () => {
  it('platform admin, or an institution granted ECONOMIQUE:CONSULTER', () => {
    expect(readsEconomieSynthesis('PLATFORM_ADMIN', null)).toBe(true);
    expect(readsEconomieSynthesis('INSTITUTION', { ECONOMIQUE: ['CONSULTER'] })).toBe(true);
    expect(readsEconomieSynthesis('INSTITUTION', { TECHNIQUE: ['CONSULTER'] })).toBe(false);
    expect(readsEconomieSynthesis('INSTITUTION', null)).toBe(false);
    expect(readsEconomieSynthesis('PROPRIETAIRE', { ECONOMIQUE: ['CONSULTER'] })).toBe(false);
  });
});

describe('menuItemVisible', () => {
  const orders = { perms: ['vente:commande'], fermiaArea: 'VENTES' as const };
  const sanitary = { perms: ['sanitaire:lecture'] };

  it('farm accounts follow the permission codes', () => {
    expect(menuItemVisible('ELEVEUR', orders, codes('vente:commande'))).toBe(true);
    expect(menuItemVisible('ELEVEUR', orders, codes('caisse:lire'))).toBe(false);
    expect(menuItemVisible('PROPRIETAIRE', sanitary, () => true)).toBe(true);
  });

  it('an institution sees a Fermia tile with the area read code, not its write perms', () => {
    expect(menuItemVisible('INSTITUTION', orders, codes('caisse:lire'))).toBe(true);
    expect(menuItemVisible('INSTITUTION', orders, codes('vente:commande'))).toBe(false);
    expect(menuItemVisible('INSTITUTION', sanitary, codes('sanitaire:lecture'))).toBe(true);
    expect(menuItemVisible('INSTITUTION', sanitary, none)).toBe(false);
  });

  it('a tile without perms stays visible', () => {
    expect(menuItemVisible('INSTITUTION', {}, none)).toBe(true);
  });
});
