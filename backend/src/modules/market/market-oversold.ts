import { EntityManager } from 'typeorm';
import { ProductionBatch } from '../batches/entities/production-batch.entity.js';
import {
  batchReservation,
  sentSlaughterBirds,
} from '../orders/order-reservations.js';

/**
 * True when a lot has promised more birds than it still has: reservations
 * don't stop a POS sale made elsewhere from a stale screen, nor mortality.
 */
export async function batchReservationOverflow(
  em: EntityManager,
  farmId: string,
  batchId: string,
): Promise<boolean> {
  const batch = await em
    .getRepository(ProductionBatch)
    .findOneBy({ id: batchId, farmId });
  if (!batch) return false;
  const [{ birds }, atAbattoir] = await Promise.all([
    batchReservation(em, farmId, batchId),
    sentSlaughterBirds(em, farmId, batchId),
  ]);
  return birds + atAbattoir > batch.quantityAlive;
}
