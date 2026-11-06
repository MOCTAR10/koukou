import { describe, expect, it } from 'vitest';

import { posCatalog } from './catalog';

describe('posCatalog', () => {
  it('ne propose pas la récolte : les cultures sont masquées', () => {
    expect(posCatalog('FERME').map((p) => p.key)).not.toContain('RECOLTE');
    expect(posCatalog('BOUTIQUE').map((p) => p.key)).not.toContain('RECOLTE');
  });

  it('le point de vente ferme garde la volaille et les œufs', () => {
    expect(posCatalog().map((p) => p.key)).toEqual(['PIECE', 'KG', 'ABATTU_PIECE', 'ABATTU_KG', 'OEUF', 'AUTRE']);
  });
});
