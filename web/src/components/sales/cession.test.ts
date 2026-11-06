import { describe, expect, it } from 'vitest';
import { OPERATOR_CESSION_NOTICE, SORTIE_ALREADY_SOLD_HINT, hasBirdLines, saleCessionNotices } from './cession';

describe('sale cession notices', () => {
  it('spots bird lines of the register and of an order', () => {
    expect(hasBirdLines([{ product: 'ABATTU_KG' }])).toBe(true);
    expect(hasBirdLines([{ productType: 'POULET_PIECE' }])).toBe(true);
    expect(hasBirdLines([{ product: 'OEUF_PLATEAU' }])).toBe(false);
    expect(hasBirdLines([])).toBe(false);
  });

  it('announces a cession only for a customer linked to an operator', () => {
    expect(saleCessionNotices({ operatorId: 'op-1' }, [{ product: 'PIECE' }])).toEqual({
      cession: OPERATOR_CESSION_NOTICE,
      noDoubleEntry: SORTIE_ALREADY_SOLD_HINT,
    });
    expect(saleCessionNotices({ operatorId: null }, [{ product: 'PIECE' }])).toEqual({ cession: null, noDoubleEntry: SORTIE_ALREADY_SOLD_HINT });
    expect(saleCessionNotices({ operatorId: 'op-1' }, [{ product: 'OEUF_PLATEAU' }])).toEqual({ cession: null, noDoubleEntry: null });
    expect(saleCessionNotices(null, [])).toEqual({ cession: null, noDoubleEntry: null });
  });
});
