import { describe, expect, it } from 'vitest';
import { shareText, totalOverdue, totalOverdueFiles } from './riskLogic';

const ageing = [
  { key: 'J1_30', label: '1 à 30 jours', files: 2, overdueFcfa: 300 },
  { key: 'J31_60', label: '31 à 60 jours', files: 0, overdueFcfa: 0 },
  { key: 'J61_90', label: '61 à 90 jours', files: 1, overdueFcfa: 50 },
  { key: 'J90_PLUS', label: 'Plus de 90 jours', files: 1, overdueFcfa: 400 },
] as const;

describe('riskLogic', () => {
  it('adds the buckets up', () => {
    expect(totalOverdue([...ageing])).toBe(750);
    expect(totalOverdueFiles([...ageing])).toBe(4);
  });
  it('prints a share in French, a missing one as a dash', () => {
    expect(shareText(62.5)).toBe('62,5 %');
    expect(shareText(100)).toBe('100 %');
    expect(shareText(null)).toBe('—');
  });
});
