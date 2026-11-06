import { describe, expect, it } from 'vitest';
import { teamAccessState, teamRoleLabel, toggleActiveBody } from './teamRules';

describe('team accounts (F13)', () => {
  it('labels roles and access', () => {
    expect(teamRoleLabel('ADMIN')).toBe('Administrateur de ferme');
    expect(teamRoleLabel('ELEVEUR')).toBe('Membre');
    expect(teamAccessState({ linkActive: true, accountActive: true }).label).toBe('Accès actif');
    expect(teamAccessState({ linkActive: false, accountActive: true }).label).toBe('Accès suspendu');
    expect(teamAccessState({ linkActive: true, accountActive: false }).label).toBe('Compte désactivé');
  });
  it('flips the farm access', () => {
    expect(toggleActiveBody({ linkActive: true })).toEqual({ active: false });
    expect(toggleActiveBody({ linkActive: false })).toEqual({ active: true });
  });
});
