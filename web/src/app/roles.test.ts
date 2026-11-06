import { describe, expect, it } from 'vitest';
import type { Role } from '../api/client';
import {
  canUseBuyerArea,
  farmSpaceState,
  homePathFor,
  landingAfterLogin,
  noFarmMessage,
  worksWithoutFarm,
} from './roles';

describe('homePathFor', () => {
  it('sends a buyer to the Market and everyone else to the farm space', () => {
    expect(homePathFor('ACHETEUR')).toBe('/marche');
    for (const role of ['PROPRIETAIRE', 'ELEVEUR', 'PLATFORM_ADMIN', 'INSTITUTION'] as Role[]) {
      expect(homePathFor(role)).toBe('/app');
    }
  });
});

describe('landingAfterLogin', () => {
  it('keeps a buyer in the Market, whatever page asked', () => {
    expect(landingAfterLogin('ACHETEUR')).toBe('/marche');
    expect(landingAfterLogin('ACHETEUR', '/marche/abc')).toBe('/marche/abc');
    expect(landingAfterLogin('ACHETEUR', '/marche/commandes')).toBe('/marche/commandes');
    expect(landingAfterLogin('ACHETEUR', '/app/batches')).toBe('/marche');
    expect(landingAfterLogin('ACHETEUR', '/marcheX')).toBe('/marche');
  });

  it('never lands a farm account on the Market front page by default', () => {
    expect(landingAfterLogin('PROPRIETAIRE')).toBe('/app');
    expect(landingAfterLogin('PROPRIETAIRE', '/marche')).toBe('/app');
    expect(landingAfterLogin('ELEVEUR', '/app/finance/ventes')).toBe('/app/finance/ventes');
  });

  it('lets a farm account back to a Market page it opened itself', () => {
    expect(landingAfterLogin('PROPRIETAIRE', '/marche/abc')).toBe('/marche/abc');
    expect(landingAfterLogin('PLATFORM_ADMIN', '/marche/commandes')).toBe('/marche/commandes');
  });

  it('keeps an institution out of the buyer area', () => {
    expect(landingAfterLogin('INSTITUTION', '/marche/commandes')).toBe('/app');
    expect(landingAfterLogin('INSTITUTION', '/app/alerts')).toBe('/app/alerts');
  });

  it('ignores pages outside both spaces', () => {
    expect(landingAfterLogin('PROPRIETAIRE', '/login')).toBe('/app');
    expect(landingAfterLogin('PROPRIETAIRE', '/register')).toBe('/app');
  });
});

describe('canUseBuyerArea', () => {
  it('matches the server roles of the buyer routes', () => {
    expect(canUseBuyerArea('ACHETEUR')).toBe(true);
    expect(canUseBuyerArea('PROPRIETAIRE')).toBe(true);
    expect(canUseBuyerArea('INSTITUTION')).toBe(false);
    expect(canUseBuyerArea(null)).toBe(false);
  });
});

describe('farmSpaceState', () => {
  it('is ready as soon as a farm is listed', () => {
    expect(farmSpaceState({ farmsLoading: true, farmsFailed: false, farmCount: 2 })).toBe('ready');
  });

  it('waits for the list, then says there is no farm instead of loading forever', () => {
    expect(farmSpaceState({ farmsLoading: true, farmsFailed: false, farmCount: 0 })).toBe('loading');
    expect(farmSpaceState({ farmsLoading: false, farmsFailed: false, farmCount: 0 })).toBe('no-farm');
  });

  it('tells an unreadable list apart from an empty one', () => {
    expect(farmSpaceState({ farmsLoading: false, farmsFailed: true, farmCount: 0 })).toBe('error');
  });
});

describe('worksWithoutFarm', () => {
  it('keeps the platform console and the help open', () => {
    expect(worksWithoutFarm('/app/platform')).toBe(true);
    expect(worksWithoutFarm('/app/help')).toBe(true);
    expect(worksWithoutFarm('/app/dashboard')).toBe(false);
    expect(worksWithoutFarm('/app/helpdesk')).toBe(false);
    expect(worksWithoutFarm('/app/acces/comptes')).toBe(true);
    expect(worksWithoutFarm('/app/mon-acces')).toBe(true);
  });
});

describe('noFarmMessage', () => {
  it('explains the situation per account, in French', () => {
    expect(noFarmMessage('PROPRIETAIRE').body).toMatch(/registre/);
    expect(noFarmMessage('ELEVEUR').body).toMatch(/équipe/);
    expect(noFarmMessage('INSTITUTION').title).toMatch(/périmètre/);
    expect(noFarmMessage(undefined).title).toBe('Aucune ferme');
  });

  it('never invites the owner to sign up or create a farm', () => {
    expect(noFarmMessage('PROPRIETAIRE').body).not.toMatch(/inscri|créez/i);
  });
});
