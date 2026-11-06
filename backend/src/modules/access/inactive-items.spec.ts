import { describe, expect, it } from 'vitest';
import type { AccessMatrix } from './access-domains.js';
import { mayReadInactiveItems } from './access-rules.js';
import { DEFAULT_PROFILES, PROFILE_CODES } from './data/default-profiles.js';

const matrixOf = (code: string) =>
  DEFAULT_PROFILES.find((p) => p.code === code)!.matrix;

describe('mayReadInactiveItems (?all=true on lists and localités)', () => {
  it('opens deactivated items to the profiles that manage the lists', () => {
    expect(mayReadInactiveItems(matrixOf(PROFILE_CODES.ADMIN))).toBe(true);
    expect(mayReadInactiveItems(matrixOf(PROFILE_CODES.DGE))).toBe(true);
    expect(mayReadInactiveItems(matrixOf(PROFILE_CODES.VETERINAIRE))).toBe(
      true,
    );
  });

  it('refuses profiles that only read the settings', () => {
    expect(mayReadInactiveItems(matrixOf(PROFILE_CODES.AGENT_TECHNIQUE))).toBe(
      false,
    );
    expect(mayReadInactiveItems(matrixOf(PROFILE_CODES.MAEDR))).toBe(false);
    expect(mayReadInactiveItems(matrixOf(PROFILE_CODES.ANINF))).toBe(false);
    expect(mayReadInactiveItems(matrixOf(PROFILE_CODES.BCEG))).toBe(false);
  });

  it('follows the matrix, not the profile code', () => {
    expect(mayReadInactiveItems({ ADMINISTRATION: ['CONSULTER'] })).toBe(true);
    expect(mayReadInactiveItems({ PARAMETRES: ['CONSULTER'] })).toBe(false);
    // A vet profile stripped of PARAMETRES still manages the sanitary lists.
    const vet: AccessMatrix = { SANITAIRE: ['CONSULTER', 'MODIFIER'] };
    expect(mayReadInactiveItems({ ...vet })).toBe(false);
    expect(mayReadInactiveItems({ ...vet }, { sanitaryList: true })).toBe(true);
    expect(
      mayReadInactiveItems({ SANITAIRE: ['CONSULTER'] }, { sanitaryList: true }),
    ).toBe(false);
  });
});
