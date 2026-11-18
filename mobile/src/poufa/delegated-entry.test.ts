import { describe, expect, it } from 'vitest';

import {
  DAY_NOT_CACHED,
  STOCK_NOT_CACHED,
  delegatedActions,
  delegatedBlock,
  onBehalfBanner,
  onBehalfLabel,
} from './delegated-entry';

describe('onBehalfLabel', () => {
  it('names the agent and his profile', () => {
    expect(onBehalfLabel({ enteredOnBehalf: true, enteredByName: 'Jean Obame', enteredByProfile: 'Agent technique' })).toBe(
      'Saisi par Jean Obame (Agent technique)',
    );
  });

  it('copes with a missing profile or name', () => {
    expect(onBehalfLabel({ enteredOnBehalf: true, enteredByName: 'Jean Obame', enteredByProfile: null })).toBe('Saisi par Jean Obame');
    expect(onBehalfLabel({ enteredOnBehalf: true })).toBe('Saisi par un agent du programme');
  });

  it('shows nothing for the farmer’s own entries or an older server', () => {
    expect(onBehalfLabel({ enteredOnBehalf: false, enteredByName: 'X' })).toBeNull();
    expect(onBehalfLabel({})).toBeNull();
    expect(onBehalfLabel(null)).toBeNull();
    expect(onBehalfLabel(undefined)).toBeNull();
  });
});

describe('onBehalfBanner', () => {
  it('names the farm', () => {
    expect(onBehalfBanner('Ferme Mba')).toBe('Vous saisissez pour le compte de Ferme Mba');
    expect(onBehalfBanner(null)).toBe('Vous saisissez pour le compte de cet éleveur');
    expect(onBehalfBanner('  ')).toBe('Vous saisissez pour le compte de cet éleveur');
  });
});

describe('delegatedActions', () => {
  it('daily right: the daily tiles, eggs only for layers, never vaccine or sale', () => {
    expect(delegatedActions({ isLayer: false, daily: true, declaration: false })).toEqual(['morts', 'aliment', 'eau', 'pesee']);
    expect(delegatedActions({ isLayer: true, daily: true, declaration: false })).toEqual(['morts', 'aliment', 'eau', 'oeufs', 'pesee']);
  });

  it('declaration right alone: only the problem report', () => {
    expect(delegatedActions({ isLayer: true, daily: false, declaration: true })).toEqual(['probleme']);
  });

  it('both rights, none', () => {
    expect(delegatedActions({ isLayer: false, daily: true, declaration: true })).toEqual(['morts', 'aliment', 'eau', 'pesee', 'probleme']);
    expect(delegatedActions({ isLayer: true, daily: false, declaration: false })).toEqual([]);
  });
});

describe('delegatedBlock', () => {
  it('a daily entry needs the day’s entry on the phone', () => {
    expect(delegatedBlock('morts', { day: false, stock: true })).toBe(DAY_NOT_CACHED);
    expect(delegatedBlock('morts', { day: true, stock: false })).toBeNull();
  });

  it('the feed entry also needs the stock', () => {
    expect(delegatedBlock('aliment', { day: true, stock: false })).toBe(STOCK_NOT_CACHED);
    expect(delegatedBlock('aliment', { day: true, stock: true })).toBeNull();
  });

  it('the problem report never waits for the cache', () => {
    expect(delegatedBlock('probleme', { day: false, stock: false })).toBeNull();
  });
});
