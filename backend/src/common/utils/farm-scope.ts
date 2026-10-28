import { FindOptionsWhere, IsNull } from 'typeorm';

/**
 * Reference rows (breeds, cultures, vaccination programs) are either shared
 * (farmId null, seeded) or a farm's own custom rows. A farm sees and uses
 * the shared rows plus its own; with no farm, only the shared ones.
 */
export function sharedOrFarm<T extends { farmId: string | null }>(
  farmId: string | null | undefined,
  extra: FindOptionsWhere<T> = {},
): FindOptionsWhere<T>[] {
  const shared = { ...extra, farmId: IsNull() } as FindOptionsWhere<T>;
  if (!farmId) return [shared];
  return [shared, { ...extra, farmId } as FindOptionsWhere<T>];
}
