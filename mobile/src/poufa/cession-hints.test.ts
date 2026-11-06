import { describe, expect, it } from 'vitest';

import { POS_NO_DOUBLE_ENTRY_HINT, POS_OPERATOR_NOTICE, isPoultryProduct, posCessionHints } from './cession-hints';

describe('caisse : cession tracée et double saisie', () => {
  it('volailles vives ou abattues seulement', () => {
    expect(['PIECE', 'KG', 'ABATTU_PIECE', 'ABATTU_KG'].every(isPoultryProduct)).toBe(true);
    expect(isPoultryProduct('OEUF')).toBe(false);
    expect(isPoultryProduct('PROVENDE')).toBe(false);
  });

  it('client lié à un opérateur : la vente de volailles crée une cession', () => {
    expect(posCessionHints({ operatorId: 'op-1' }, ['PIECE', 'OEUF'])).toEqual({
      operator: POS_OPERATOR_NOTICE,
      noDoubleEntry: POS_NO_DOUBLE_ENTRY_HINT,
    });
    expect(POS_OPERATOR_NOTICE).toContain('cession tracée (sous-lot et QR)');
  });

  it('sans opérateur : seul le rappel de ne pas ressaisir une sortie', () => {
    expect(posCessionHints({ operatorId: null }, ['KG'])).toEqual({ operator: null, noDoubleEntry: POS_NO_DOUBLE_ENTRY_HINT });
    expect(posCessionHints(null, ['ABATTU_KG']).operator).toBeNull();
  });

  it('pas de volailles au panier : aucun message', () => {
    expect(posCessionHints({ operatorId: 'op-1' }, ['OEUF', 'PROVENDE'])).toEqual({ operator: null, noDoubleEntry: null });
  });
});
