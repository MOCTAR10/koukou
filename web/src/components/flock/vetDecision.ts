import type { HealthEvent } from '../../api/types-flock';

/** Veterinary decision on a declaration, as shown on the farm side (CDC n° 26, « à valider vétérinaires »). */
export function vetDecision(status: HealthEvent['vetReviewStatus']): { label: string; tone: 'emerald' | 'red' | 'amber' | 'slate' } {
  switch (status) {
    case 'VALIDEE':
      return { label: 'Validée par le vétérinaire', tone: 'emerald' };
    case 'INFIRMEE':
      return { label: 'Infirmée par le vétérinaire', tone: 'red' };
    case 'ALERTE':
      return { label: 'Alerte officielle ouverte', tone: 'amber' };
    default:
      return { label: 'En attente du vétérinaire', tone: 'slate' };
  }
}
