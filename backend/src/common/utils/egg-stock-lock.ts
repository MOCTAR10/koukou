import { EntityManager } from 'typeorm';

/**
 * Serializes egg stock checks of one farm until the transaction ends. Egg
 * stock is derived (produced − sold − transferred), so there is no row to
 * lock: without this, two tills selling the last trays at the same moment
 * both pass the availability check.
 */
export async function lockFarmEggStock(
  em: EntityManager,
  farmId: string,
): Promise<void> {
  await em.query('SELECT pg_advisory_xact_lock(hashtext($1))', [
    `egg-stock:${farmId}`,
  ]);
}
