import type { Alert, AlertCategory } from './types';

/** Filtre de niveau : tout, ou un niveau précis (VERT = « Infos »). */
export type LevelFilter = 'TOUTES' | 'ROUGE' | 'JAUNE' | 'VERT';
/** Filtre de statut : tout, ou un statut précis (« Résolues » = historique). */
export type StatusFilter = 'TOUTES' | 'ACTIVE' | 'ACQUITTEE' | 'RESOLUE';

export const LEVEL_LABEL: Record<LevelFilter, string> = {
  TOUTES: 'Toutes',
  ROUGE: 'Rouges',
  JAUNE: 'Jaunes',
  VERT: 'Infos',
};

export const STATUS_LABEL: Record<StatusFilter, string> = {
  TOUTES: 'Toutes',
  ACTIVE: 'En cours',
  ACQUITTEE: 'Acquittées',
  RESOLUE: 'Résolues',
};

/** Libellés humains des kinds (alertes stockées) et catégories d'action. */
const KIND_LABEL: Record<string, string> = {
  EAU: 'Eau',
  ALIMENT: 'Alimentation',
  MORTALITE: 'Mortalité',
  SURDENSITE: 'Surdensité',
  DENSITE: 'Densité',
  DENSITE_BATIMENT: 'Densité bâtiment',
  COHABITATION: 'Cohabitation',
  VIDE_SANITAIRE: 'Vide sanitaire',
  IPE: 'IPE',
  GMQ: 'GMQ',
  PEREMPTION: 'Péremption',
  TRACABILITE: 'Traçabilité',
  VENTE: 'Vente',
  DELAI_ATTENTE: "Délai d'attente",
  PROPHYLAXIE: 'Prophylaxie',
  RENTABILITE: 'Rentabilité',
  TACHE: 'Tâche',
  SAISIE_MANQUEE: 'Saisie manquée',
  STOCK_OEUF: "Stock d'œufs",
  HEAT: 'Stress thermique',
  MALADIE: 'Maladie',
  SAISIE: 'Saisie',
  SOIN: 'Soin',
  STOCK_PROVENDE: 'Provende',
  ALERTE: 'Alerte',
};

export function kindLabel(kind: string): string {
  return KIND_LABEL[kind] ?? kind;
}

export interface KindCount {
  kind: string;
  label: string;
  count: number;
}

/** Kinds présents avec leur libellé et leur décompte, triés par fréquence. */
export function kindsWithCounts(alerts: Alert[]): KindCount[] {
  const counts = new Map<string, number>();
  for (const a of alerts) counts.set(a.kind, (counts.get(a.kind) ?? 0) + 1);
  return Array.from(counts.entries())
    .map(([kind, count]) => ({ kind, label: kindLabel(kind), count }))
    .sort((a, b) => b.count - a.count || a.label.localeCompare(b.label));
}

export interface AlertFilters {
  level: LevelFilter;
  status: StatusFilter;
  kind: string | null;
}

export function filterAlerts(alerts: Alert[], f: AlertFilters): Alert[] {
  return alerts.filter((a) => {
    if (f.level !== 'TOUTES' && a.level !== f.level) return false;
    if (f.status !== 'TOUTES' && a.status !== f.status) return false;
    if (f.kind && a.kind !== f.kind) return false;
    return true;
  });
}

export function countLevel(alerts: Alert[], level: 'ROUGE' | 'JAUNE' | 'VERT'): number {
  return alerts.filter((a) => a.level === level).length;
}

export function countStatus(alerts: Alert[], status: Exclude<StatusFilter, 'TOUTES'>): number {
  return alerts.filter((a) => a.status === status).length;
}

/** Réemploi de la catégorie d'action pour un décompte rapide. */
export function countCategory(alerts: Alert[], category: AlertCategory): number {
  return alerts.filter((a) => a.category === category).length;
}