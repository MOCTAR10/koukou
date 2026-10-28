import { IsOptional, IsString, MaxLength } from 'class-validator';
import type { FindOptionsWhere, ObjectLiteral, Repository } from 'typeorm';

/** Postgres unique_violation (23505). */
export function isUniqueViolation(err: unknown): boolean {
  return (err as { code?: unknown })?.code === '23505';
}

/**
 * Offline replay guard: runs `create` unless a row with the same
 * (farmId, idempotencyKey) already exists, in which case that row is returned.
 * A concurrent duplicate loses on the unique index and also gets the winner.
 * Without a key, `create` runs as usual.
 */
export async function createOnce<T extends ObjectLiteral>(
  repo: Repository<T>,
  farmId: string,
  key: string | null | undefined,
  create: () => Promise<T>,
): Promise<T> {
  if (!key) return create();
  const where = {
    farmId,
    idempotencyKey: key,
  } as unknown as FindOptionsWhere<T>;
  const existing = await repo.findOne({ where });
  if (existing) return existing;
  try {
    return await create();
  } catch (err) {
    if (!isUniqueViolation(err)) throw err;
    const winner = await repo.findOne({ where });
    if (winner) return winner;
    throw err;
  }
}

/** DTO mixin field: client-generated key, one per offline operation. */
export class IdempotentDto {
  @IsOptional()
  @IsString({ message: 'La clé d’idempotence doit être une chaîne.' })
  @MaxLength(100, { message: 'La clé d’idempotence est trop longue.' })
  idempotencyKey?: string;
}
