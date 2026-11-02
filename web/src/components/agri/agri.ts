import { useQuery, type QueryClient } from '@tanstack/react-query';
import { api } from '../../api/client';
import type {
  CropCategory,
  Culture,
  Parcelle,
  ParcelleStatus,
  ParcelleStock,
  Recolte,
  RecolteUnit,
} from '../../api/types-agri';
import { dateFr, num } from '../../lib/format';

export const CROP_CATEGORY_LABELS: Record<CropCategory, string> = {
  TUBERCULE: 'Tubercule',
  MARAICHAGE: 'Maraîchage',
  FRUIT: 'Fruit',
  CEREALE: 'Céréale',
  AUTRE: 'Autre',
};

const CROP_CATEGORY_ORDER: CropCategory[] = ['TUBERCULE', 'MARAICHAGE', 'FRUIT', 'CEREALE', 'AUTRE'];

export const PARCELLE_STATUS_ORDER: ParcelleStatus[] = ['PREPARATION', 'ACTIVE', 'JACHERE', 'CLOTURE'];

export const PARCELLE_STATUS_LABELS: Record<ParcelleStatus, string> = {
  PREPARATION: 'En préparation',
  ACTIVE: 'Active',
  JACHERE: 'Jachère',
  CLOTURE: 'Clôturée',
};

export const PARCELLE_STATUS_HINTS: Record<ParcelleStatus, string> = {
  PREPARATION: 'Sol en préparation : plantation à venir.',
  ACTIVE: 'Culture en place, le cycle est suivi.',
  JACHERE: 'Parcelle au repos, non cultivée.',
  CLOTURE: 'Parcelle arrêtée ou retirée du suivi.',
};

export const RECOLTE_UNITS: RecolteUnit[] = ['KG', 'PIECE', 'SAC'];

export const RECOLTE_UNIT_LABELS: Record<RecolteUnit, string> = {
  KG: 'kg',
  PIECE: 'pièce(s)',
  SAC: 'sac(s)',
};

/** Groups crops by category in display order; empty categories are left out. */
export function groupCulturesByCategory(
  cultures: Culture[],
): { category: CropCategory; label: string; cultures: Culture[] }[] {
  return CROP_CATEGORY_ORDER.map((category) => ({
    category,
    label: CROP_CATEGORY_LABELS[category],
    cultures: cultures
      .filter((c) => c.category === category)
      .sort((a, b) => a.name.localeCompare(b.name, 'fr')),
  })).filter((g) => g.cultures.length > 0);
}

const CULTURE_STAGES = [
  { key: 'PLANTATION', min: 0, max: 0.25, label: 'Plantation' },
  { key: 'CROISSANCE', min: 0.25, max: 0.5, label: 'Croissance' },
  { key: 'DEVELOPPEMENT', min: 0.5, max: 0.75, label: 'Développement' },
  { key: 'MATURATION', min: 0.75, max: 1, label: 'Maturation' },
  { key: 'A_RECOLTER', min: 1, max: Infinity, label: 'À récolter' },
] as const;

export interface CultureStageInfo {
  key: (typeof CULTURE_STAGES)[number]['key'];
  label: string;
  /** 0 = start of the cycle, 1 = theoretical harvest date, above = overdue. */
  progress: number;
  daysRemaining: number;
  /** Null for a crop with no known cycle. */
  harvestDate: Date | null;
}

/** Cycle progress of a planted parcel, in UTC (same rule as the mobile app). */
export function cultureStage(
  plantedAt: string | null,
  cycleDays: number | null | undefined,
  today = new Date(),
): CultureStageInfo | null {
  if (!plantedAt) return null;
  const start = new Date(`${plantedAt.slice(0, 10)}T00:00:00Z`);
  if (Number.isNaN(start.getTime())) return null;
  const now = Date.UTC(today.getUTCFullYear(), today.getUTCMonth(), today.getUTCDate());
  const daysElapsed = Math.floor((now - start.getTime()) / 86_400_000);
  if (!cycleDays || cycleDays <= 0) {
    return { key: 'A_RECOLTER', label: 'Cycle libre', progress: 0, daysRemaining: 0, harvestDate: null };
  }
  const progress = Math.max(0, daysElapsed / cycleDays);
  const stage =
    CULTURE_STAGES.find((s) => progress >= s.min && progress < s.max) ??
    CULTURE_STAGES[CULTURE_STAGES.length - 1];
  return {
    key: stage.key,
    label: stage.label,
    progress,
    daysRemaining: Math.max(0, cycleDays - daysElapsed),
    harvestDate: new Date(start.getTime() + cycleDays * 86_400_000),
  };
}

export function harvestDateFr(date: Date | null): string {
  return date ? dateFr(date.toISOString()) : '—';
}

const CULTURE_TIPS: Record<CropCategory, string> = {
  TUBERCULE: 'Buttage pour favoriser le développement des tubercules.',
  MARAICHAGE: 'Arrosage régulier léger : le stress hydrique abîme la production.',
  FRUIT: 'Apport d’eau plus important en début de fructification.',
  CEREALE: 'Semis clair et sol ressuyé pour un bon tallage.',
  AUTRE: 'Tenez un carnet de parcelles : dates, intrants, rendements.',
};

export function adviceForCulture(culture: Culture): string {
  return CULTURE_TIPS[culture.category] ?? CULTURE_TIPS.AUTRE;
}

export function waterNeedLabel(culture: Culture | null): string | null {
  if (!culture?.waterNeedsLPlantDay) return null;
  return `${num(culture.waterNeedsLPlantDay)} L/plant/jour`;
}

export function hectaresToM2Label(ha: number): string {
  return `${Math.round(ha * 10_000).toLocaleString('fr-FR')} m²`;
}

/** Area as « 1,5 ha · 15 000 m² »; a parcel saved without an area has 0. */
export function formatArea(p: Parcelle): string {
  if (!p.areaHa) return 'Non renseignée';
  return `${num(p.areaHa, 2)} ha · ${hectaresToM2Label(p.areaHa)}`;
}

/** Reads a typed decimal, comma or dot. Blank or malformed gives null. */
export function parseDecimal(raw: string): number | null {
  const text = raw.replace(/\s/g, '').replace(',', '.');
  if (!/^(\d+\.?\d*|\.\d+)$/.test(text)) return null;
  return Number(text);
}

/** Today on the farmer's calendar; the API tolerates a one-day lead over UTC. */
export function localYmd(d = new Date()): string {
  const month = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${d.getFullYear()}-${month}-${day}`;
}

export function useParcelles(farmId: string | null) {
  return useQuery({
    queryKey: ['parcelles', farmId],
    queryFn: () => api.get<Parcelle[]>(`/farms/${farmId}/parcelles`),
    enabled: !!farmId,
  });
}

export function useRecoltes(farmId: string | null) {
  return useQuery({
    queryKey: ['recoltes', farmId],
    queryFn: () => api.get<Recolte[]>(`/farms/${farmId}/recoltes`),
    enabled: !!farmId,
  });
}

export function useRecolteStock(farmId: string | null) {
  return useQuery({
    queryKey: ['recoltes-stock', farmId],
    queryFn: () => api.get<ParcelleStock[]>(`/farms/${farmId}/recoltes/stock`),
    enabled: !!farmId,
  });
}

export function useCultures(farmId: string | null) {
  return useQuery({
    queryKey: ['cultures', farmId],
    queryFn: () => api.get<Culture[]>(`/cultures?farmId=${encodeURIComponent(farmId ?? '')}`),
    enabled: !!farmId,
  });
}

/** Deleting a parcel also deletes its harvests, so the three lists move together. */
export function invalidateAgri(queryClient: QueryClient, farmId: string | null): void {
  for (const key of ['parcelles', 'recoltes', 'recoltes-stock']) {
    void queryClient.invalidateQueries({ queryKey: [key, farmId] });
  }
}
