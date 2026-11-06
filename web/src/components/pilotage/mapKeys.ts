/**
 * Map colour keys (mortality, completeness, alert) → colours and legend,
 * from the thresholds the server serves (`CARTE_*` parameters). Pure,
 * unit-tested; the Leaflet canvas only draws what this returns.
 */
import type { ColourLevel, MapColours, PilotageMap } from '../../api/types-pilotage';

export type ColourKey = keyof MapColours;

export const COLOUR_KEYS: readonly ColourKey[] = ['mortality', 'completeness', 'alert'];

export const COLOUR_KEY_LABELS: Record<ColourKey, string> = {
  mortality: 'Mortalité',
  completeness: 'Complétude',
  alert: 'Alertes',
};

export function parseColourKey(raw: string | null | undefined): ColourKey {
  return (COLOUR_KEYS as readonly string[]).includes(raw ?? '') ? (raw as ColourKey) : 'mortality';
}

/** Fill colours (Tailwind emerald-500, amber-500, red-600, slate-400). */
export const LEVEL_COLOURS: Record<ColourLevel | 'NONE', string> = {
  VERT: '#10b981',
  JAUNE: '#f59e0b',
  ROUGE: '#dc2626',
  NONE: '#94a3b8',
};

export function colourOf(level: ColourLevel | null | undefined): string {
  return LEVEL_COLOURS[level ?? 'NONE'];
}

/** The level of a point or a cluster on the chosen key (null: no data, or hidden). */
export function levelOn(colours: MapColours | null | undefined, key: ColourKey): ColourLevel | null {
  return colours ? colours[key] : null;
}

export interface LegendItem {
  level: ColourLevel | 'NONE';
  colour: string;
  label: string;
}

function n(v: number): string {
  return v.toLocaleString('fr-FR', { maximumFractionDigits: 1 });
}

/**
 * Legend of a key. Mortality: red from the red threshold, yellow from the
 * yellow one. Completeness: red under the red threshold, yellow under the
 * yellow one. Alert: the server's rule (red alert or published sanitary
 * alert = red, any other active alert = yellow).
 */
export function legendFor(key: ColourKey, legend: PilotageMap['legend']): LegendItem[] {
  const item = (level: LegendItem['level'], label: string): LegendItem => ({ level, colour: LEVEL_COLOURS[level], label });
  if (key === 'mortality') {
    const { jaune, rouge } = legend.mortality;
    return [
      item('VERT', `moins de ${n(jaune)} %`),
      item('JAUNE', `${n(jaune)} % à moins de ${n(rouge)} %`),
      item('ROUGE', `${n(rouge)} % ou plus`),
      item('NONE', 'pas de donnée sur la période'),
    ];
  }
  if (key === 'completeness') {
    const { jaune, rouge } = legend.completeness;
    return [
      item('VERT', `${n(jaune)} % ou plus`),
      item('JAUNE', `${n(rouge)} % à moins de ${n(jaune)} %`),
      item('ROUGE', `moins de ${n(rouge)} %`),
      item('NONE', 'pas de donnée sur la période'),
    ];
  }
  return [
    item('VERT', 'aucune alerte active'),
    item('JAUNE', 'alerte active (jaune)'),
    item('ROUGE', 'alerte rouge active ou alerte sanitaire publiée'),
  ];
}

/** Radius (px) of a province cluster: grows with the farms, bounded. */
export function clusterRadius(farms: number): number {
  return Math.round(Math.min(34, 12 + Math.sqrt(Math.max(0, farms)) * 3));
}

/** Gabon, when nothing is placed yet. */
export const GABON_CENTER: [number, number] = [-0.6, 11.6];
export const COUNTRY_ZOOM = 6;
