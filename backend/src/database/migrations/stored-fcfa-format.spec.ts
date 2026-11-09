import { fcfaFr } from '../../common/utils/date.utils.js';
import { formatStoredFcfa } from './1794570000000-StoredFcfaFormat.js';

describe('StoredFcfaFormat migration', () => {
  it('formats raw amounts in an old loss alert', () => {
    const old =
      'Le lot Bande 1 est en perte : revenus 30000 FCFA pour des dépenses de 975000 FCFA.';
    expect(formatStoredFcfa(old)).toBe(
      `Le lot Bande 1 est en perte : revenus ${fcfaFr(30000)} pour des dépenses de ${fcfaFr(975000)}.`,
    );
  });
  it('leaves small and already formatted amounts alone', () => {
    const text = `revenus 0 FCFA, coût 500 FCFA, total ${fcfaFr(975000)}`;
    expect(formatStoredFcfa(text)).toBe(text);
  });
});
