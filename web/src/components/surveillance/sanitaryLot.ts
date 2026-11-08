import type { Lot } from '../../api/types-flock';
import type { SanitaryLotView } from '../../api/types-surveillance';
import { ageZeroDay } from '../flock/band';
import { librevilleDay } from '../../lib/libreville';

/**
 * A band as the sanitary screens need it. Two sources: the farm's lots
 * (`/batches`, TECHNIQUE, with the breed and metrics) or, for a profile
 * without TECHNIQUE (the veterinary services), `GET /farms/:farmId/sanitary/lots`
 * (SANITAIRE). The sanitary page and its forms read this shape only.
 */
export interface SanitaryLotRef {
  id: string;
  code: string | null;
  batchName: string | null;
  species: string;
  customSpecies?: string | null;
  type: string;
  breedName: string | null;
  liveCount: number;
  ageDays: number;
  /** J0 of the birds (`YYYY-MM-DD`): a protocol day N falls on J0 + N. */
  ageZeroDay: string;
}

function addDays(ymd: string, days: number): string {
  const d = new Date(`${ymd.slice(0, 10)}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + days);
  return d.toISOString().slice(0, 10);
}

/** Open band statuses the sanitary page lists (same as before: ACTIF, EN_VENTE). */
export function isOpenLot(status: string): boolean {
  return status === 'ACTIF' || status === 'EN_VENTE';
}

export function refFromLot(lot: Lot): SanitaryLotRef {
  return {
    id: lot.id,
    code: (lot as { code?: string | null }).code ?? null,
    batchName: lot.batchName ?? null,
    species: lot.species,
    customSpecies: lot.customSpecies ?? null,
    type: lot.type,
    breedName: lot.breedName,
    liveCount: lot.metrics.liveCount,
    ageDays: lot.metrics.ageDays,
    ageZeroDay: ageZeroDay(lot.integrationDate, lot.initialAgeDays),
  };
}

/** `today` is the UTC day the server counted `ageDays` on. */
export function refFromSanitaryLot(lot: SanitaryLotView, today: string = librevilleDay()): SanitaryLotRef {
  return {
    id: lot.id,
    code: lot.code,
    batchName: lot.name ?? lot.code,
    species: lot.species,
    type: lot.type,
    breedName: null,
    liveCount: lot.quantityAlive,
    ageDays: lot.ageDays,
    ageZeroDay: addDays(today, -lot.ageDays),
  };
}

export function lotRefOption(lot: SanitaryLotRef, kind: string): string {
  const name = lot.batchName ?? lot.code ?? 'Lot sans nom';
  return `${name}${lot.code && lot.batchName !== lot.code ? ` (${lot.code})` : ''} · ${kind} · ${lot.liveCount.toLocaleString('fr-FR')} vivants`;
}
