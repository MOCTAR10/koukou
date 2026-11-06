import { describe, expect, it } from 'vitest';
import { ReferenceKey } from '../../common/enums/reference-key.enum.js';
import { referenceGroup, referenceOwner } from './reference-owners.js';

describe('referenceOwner (F8)', () => {
  it('gives the sanitary thresholds to the veterinary services', () => {
    for (const key of [
      ReferenceKey.VIDE_SANITAIRE_MIN_DAYS,
      ReferenceKey.VIDE_SANITAIRE_MAX_DAYS,
      ReferenceKey.PROPHYLAXIE_RETARD_WARN_DAYS,
    ]) {
      expect(referenceOwner(key)).toBe('VETERINAIRE');
      expect(referenceGroup(key)).toBe('SANITAIRE');
    }
  });

  it('gives margins, feed autonomy and the rest to the DGE', () => {
    for (const key of [
      ReferenceKey.RENTABILITE_MARGE_MIN_PCT,
      ReferenceKey.FEED_STOCK_WARN_DAYS,
      ReferenceKey.FEED_STOCK_CRITICAL_DAYS,
      ReferenceKey.DENSITY_WARN,
      'unknown_key',
    ]) {
      expect(referenceOwner(key)).toBe('DGE');
      expect(referenceGroup(key)).toBe('CONDUITE');
    }
  });
});
