import { describe, expect, it } from 'vitest';
import { vetDecision } from './vetDecision';

describe('vetDecision', () => {
  it('maps each review status to a badge', () => {
    expect(vetDecision('VALIDEE').tone).toBe('emerald');
    expect(vetDecision('INFIRMEE').label).toBe('Infirmée par le vétérinaire');
    expect(vetDecision('ALERTE').tone).toBe('amber');
    expect(vetDecision(null).label).toBe('En attente du vétérinaire');
    expect(vetDecision(undefined).tone).toBe('slate');
  });
});
