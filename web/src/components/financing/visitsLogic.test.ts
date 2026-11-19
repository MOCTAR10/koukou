import { describe, expect, it } from 'vitest';
import { dateFr } from '../../lib/format';
import { visitLabel } from './visitsLogic';

const when = dateFr('2026-11-12');

describe('visitLabel', () => {
  it('names date, agent and class', () => {
    expect(visitLabel({ visitedOn: '2026-11-12', agentName: 'Jean Dupont', biosecurityClass: 'B' })).toBe(`${when} · Jean Dupont · classe B`);
  });
  it('says so when the agent or the grid is missing', () => {
    expect(visitLabel({ visitedOn: '2026-11-12', agentName: null, biosecurityClass: null })).toBe(`${when} · Agent inconnu · sans note de biosécurité`);
  });
});
