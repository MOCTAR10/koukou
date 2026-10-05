import type { MortalityStatus } from '@/api/types';

/**
 * Normalise le statut mortalité d'une bande. La référence est le statut
 * calculé côté serveur (comparé au référentiel de mortalité attendue à l'âge
 * du lot). À défaut (payloads anciens), on retombe sur les anciens seuils
 * fixes de mortalité cumulée.
 */
export function normalizeMortalityStatus(
  status: MortalityStatus | null | undefined,
  pct: number | null | undefined,
): MortalityStatus {
  if (status === 'normal' || status === 'elevated' || status === 'critical') {
    return status;
  }
  const p = pct ?? 0;
  if (p > 5) return 'critical';
  if (p > 1.5) return 'elevated';
  return 'normal';
}