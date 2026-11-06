import { BatchStatus } from '../../common/enums/batch-type.enum.js';
import { TraceLotStatus } from '../../common/enums/trace.enum.js';
import { operatorNameKey } from './operators.service.js';
import {
  isLotCodeShape,
  lotCode,
  lotCounterScope,
  operatorCode,
  subLotCode,
  subLotCounterScope,
} from './trace-codes.js';
import { effectiveLotStatus } from './trace-lots.service.js';

describe('traceability codes', () => {
  it('builds lot, sub-lot and operator codes (CDC §7.5)', () => {
    expect(lotCode('G1-0012-B07', 1)).toBe('G1-0012-B07-L01');
    expect(subLotCode('G1-0012-B07-L01', 3)).toBe('G1-0012-B07-L01-03');
    expect(operatorCode(1)).toBe('OP-0001');
  });

  it('widens past the padding instead of wrapping', () => {
    expect(lotCode('G1-0012-B07', 100)).toBe('G1-0012-B07-L100');
    expect(subLotCode('G1-0012-B07-L01', 123)).toBe('G1-0012-B07-L01-123');
    expect(operatorCode(12345)).toBe('OP-12345');
  });

  it('refuses a rank that is not a positive integer', () => {
    for (const bad of [0, -1, 1.5, Number.NaN]) {
      expect(() => lotCode('G1-0012-B07', bad)).toThrow(RangeError);
      expect(() => subLotCode('X', bad)).toThrow(RangeError);
      expect(() => operatorCode(bad)).toThrow(RangeError);
    }
  });

  it('counts sub-lots per lot and lots per band', () => {
    expect(lotCounterScope('G1-0012-B07')).toBe('LOT:G1-0012-B07');
    expect(subLotCounterScope('G1-0012-B07-L01')).toBe(
      'SOUS_LOT:G1-0012-B07-L01',
    );
  });

  it('accepts only lot-shaped codes from a QR address', () => {
    expect(isLotCodeShape('G1-0012-B07-L01-03')).toBe(true);
    expect(isLotCodeShape('g1-0012')).toBe(false);
    expect(isLotCodeShape("G1'; DROP TABLE")).toBe(false);
    expect(isLotCodeShape('AB')).toBe(false);
    expect(isLotCodeShape('A'.repeat(61))).toBe(false);
  });
});

describe('effectiveLotStatus', () => {
  const root = { parentId: null, status: TraceLotStatus.OUVERT };
  it('closes a root lot with its band', () => {
    expect(effectiveLotStatus(root, BatchStatus.CLOTURE)).toBe(
      TraceLotStatus.CLOS,
    );
    expect(effectiveLotStatus(root, BatchStatus.ACTIF)).toBe(
      TraceLotStatus.OUVERT,
    );
    // An exhausted lot (FINI) can come back with a cancelled sale.
    expect(effectiveLotStatus(root, BatchStatus.FINI)).toBe(
      TraceLotStatus.OUVERT,
    );
  });

  it('keeps a ceded sub-lot valid after the band closes', () => {
    expect(
      effectiveLotStatus(
        { parentId: 'root', status: TraceLotStatus.CEDE },
        BatchStatus.CLOTURE,
      ),
    ).toBe(TraceLotStatus.CEDE);
  });
});

describe('operatorNameKey', () => {
  it('ignores accents, case, punctuation and spaces', () => {
    expect(operatorNameKey('Abattoir d’Owendo')).toBe(
      operatorNameKey('ABATTOIR  D OWENDO'),
    );
    expect(operatorNameKey('Société Générale')).toBe('societegenerale');
  });
});
