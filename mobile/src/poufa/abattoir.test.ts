import { describe, expect, it } from 'vitest';
import { abattoirOperators, slaughterOperatorId } from './abattoir';

const op = (id: string, name: string, typeCode: string, active = true) => ({ id, code: id, name, typeCode, active });
const types = [
  { code: 'ABATTOIR_INDUSTRIEL', family: 'ABATTOIR' },
  { code: 'COLLECTEUR', family: 'COLLECTE' },
  { code: 'LIBRE', family: null },
];

describe('abattoirOperators', () => {
  it('keeps active ABATTOIR-family operators, sorted by name', () => {
    const list = [op('1', 'Zeta', 'ABATTOIR_INDUSTRIEL'), op('2', 'Col', 'COLLECTEUR'), op('3', 'Alpha', 'ABATTOIR_INDUSTRIEL'), op('4', 'Off', 'ABATTOIR_INDUSTRIEL', false)];
    expect(abattoirOperators(list, types).map((o) => o.id)).toEqual(['3', '1']);
  });
  it('is empty while a list is unknown', () => {
    expect(abattoirOperators(undefined, types)).toEqual([]);
    expect(abattoirOperators([op('1', 'A', 'ABATTOIR_INDUSTRIEL')], undefined)).toEqual([]);
  });
});

describe('slaughterOperatorId', () => {
  const choices = [{ id: 'a' }];
  it('only an external order with a listed abattoir carries it', () => {
    expect(slaughterOperatorId('EXTERNE', 'a', choices)).toBe('a');
    expect(slaughterOperatorId('INTERNE', 'a', choices)).toBeUndefined();
    expect(slaughterOperatorId('EXTERNE', 'zz', choices)).toBeUndefined();
    expect(slaughterOperatorId('EXTERNE', null, choices)).toBeUndefined();
  });
});
