import { IsOptional, IsString, MaxLength } from 'class-validator';
import type { EntityManager, FindOptionsWhere, ObjectLiteral, Repository } from 'typeorm';

/** Postgres unique_violation (23505). */
export function isUniqueViolation(err: unknown): boolean {
  return (err as { code?: unknown })?.code === '23505';
}

/** 23505 raised by a unique index on a generated reference (not an idempotency key). */
export function isReferenceCollision(err: unknown): boolean {
  if (!isUniqueViolation(err)) return false;
  const e = err as { constraint?: string; detail?: string };
  return /reference/i.test(`${e.constraint ?? ''} ${e.detail ?? ''}`);
}

/**
 * Generated references (VTE-/CMD-/ABT-/EC- + day + 6 random digits) are checked before
 * insert, but two concurrent transactions can still draw the same one: the
 * loser fails with 23505. Re-run the whole unit of work (new draw) instead of
 * answering 500.
 */
export async function retryOnReferenceCollision<T>(
  work: () => Promise<T>,
  attempts = 4,
): Promise<T> {
  for (let i = 1; ; i++) {
    try {
      return await work();
    } catch (err) {
      if (i >= attempts || !isReferenceCollision(err)) throw err;
    }
  }
}

/**
 * Same retry for a reference inserted INSIDE a caller's transaction: a failed
 * statement aborts a Postgres transaction, so each attempt runs in its own
 * savepoint (nested `em.transaction`) and only that insert is redone.
 */
export function retryReferenceInSavepoint<T>(
  em: EntityManager,
  work: (sub: EntityManager) => Promise<T>,
): Promise<T> {
  return retryOnReferenceCollision(() => em.transaction(work));
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
