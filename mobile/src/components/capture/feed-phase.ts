// Feed phase rules shared by the daily-entry sheet and the simple (SIMPLE mode) flows.
// Pure: no React, no network.
import type { BatchWithMetrics, FeedPhase } from '@/api/types';

/** Phase conseillée selon l'âge du lot (même logique que la création de lot). */
export function suggestedPhaseFor(b: BatchWithMetrics | undefined): FeedPhase {
  if (!b) return 'DEMARRAGE';
  const age = b.metrics.ageDays;
  if (b.type === 'PONDEUSE') {
    if (age <= 10) return 'POUSSIN';
    if (age <= 24) return 'DEMARRAGE';
    if (age <= 112) return 'CROISSANCE';
    if (age <= 126) return 'PRE_PONTE';
    return 'PONTE_PHASE_1';
  }
  if (age <= 10) return 'POUSSIN';
  if (age <= 24) return 'DEMARRAGE';
  if (age <= 35) return 'CROISSANCE';
  return 'FINITION';
}

/** Phases pertinentes pour le type de lot (au lieu des 9 d'office). */
export function phasesForLot(b: BatchWithMetrics | undefined): FeedPhase[] {
  if (!b) return ['DEMARRAGE'];
  return b.type === 'PONDEUSE'
    ? ['POUSSIN', 'DEMARRAGE', 'CROISSANCE', 'PRE_PONTE', 'PONTE_PHASE_1', 'PONTE_PHASE_2', 'PONTE_PHASE_3', 'PERSONNALISE']
    : ['POUSSIN', 'DEMARRAGE', 'CROISSANCE', 'FINITION', 'PERSONNALISE'];
}

/** Borne les phases à celle du lot quand la phase saisie n'existe plus. */
export function normalizePhase(phase: FeedPhase | null | undefined, allowed: FeedPhase[]): FeedPhase | null {
  return phase && allowed.includes(phase) ? phase : null;
}
