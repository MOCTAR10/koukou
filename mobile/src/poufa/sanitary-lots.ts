// Band list of the sanitary screens. `GET /farms/:farmId/sanitary/lots`
// (SANITAIRE) serves the veterinary services, who hold no TECHNIQUE right
// to `GET …/batches`, and stays readable offline from the local cache.
import type { SanitaryLotView } from '@/api/poufa';
import type { BatchStatus, BatchType, ProductionBatch, Species } from '@/api/types';

const DAY_MS = 86_400_000;

function dayMs(isoDay: string): number {
  return Date.parse(`${isoDay.slice(0, 10)}T00:00:00Z`);
}

/**
 * The band as the sanitary screen reads a lot. The view serves the age
 * today, not the age at opening: J+x = age − days since opening (inverse of
 * the backend `ageOn`), so J0 and the care calendar dates stay right.
 */
export function sanitaryLotAsBatch(view: SanitaryLotView, farmId: string, today: string): ProductionBatch {
  const ageDay = view.closedAt ? view.closedAt.slice(0, 10) : today;
  const elapsed = Math.round((dayMs(ageDay) - dayMs(view.integrationDate)) / DAY_MS);
  return {
    id: view.id,
    farmId,
    batchName: view.name ?? view.code,
    buildingId: view.building?.id ?? null,
    breedCode: null,
    breedName: null,
    integrationDate: view.integrationDate,
    quantityAtStart: view.quantityAtStart,
    quantityAlive: view.quantityAlive,
    type: view.type as BatchType,
    species: view.species as Species,
    status: view.status as BatchStatus,
    code: view.code,
    initialAgeDays: Math.max(0, view.ageDays - elapsed),
    closedAt: view.closedAt,
  };
}

/** Open bands (ACTIF / EN_VENTE), the ones a declaration can target. */
export function openSanitaryLots(views: readonly SanitaryLotView[], farmId: string, today: string): ProductionBatch[] {
  return views
    .filter((v) => v.status !== 'CLOTURE' && !v.closedAt)
    .map((v) => sanitaryLotAsBatch(v, farmId, today));
}
