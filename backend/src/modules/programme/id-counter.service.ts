import { Injectable } from '@nestjs/common';
import { InjectDataSource } from '@nestjs/typeorm';
import { DataSource, EntityManager } from 'typeorm';
import { farmCode, farmCounterScope } from './codes.js';

/**
 * Atomic, gap-tolerant sequence numbers per scope. One upsert both creates the
 * counter and increments it, so concurrent callers always get distinct
 * numbers. Inside a caller's transaction the counter row stays locked until
 * commit (callers of one scope are serialized), and a rollback gives the
 * number back: it was never persisted, so a stored number is never reused.
 */
@Injectable()
export class IdCounterService {
  constructor(@InjectDataSource() private readonly dataSource: DataSource) {}

  /** Next number of `scope` (1 for a new scope). */
  async next(scope: string, em?: EntityManager): Promise<number> {
    const rows: { next: number }[] = await (
      em ?? this.dataSource.manager
    ).query(
      `INSERT INTO id_counters (scope, next) VALUES ($1, 1)
       ON CONFLICT (scope) DO UPDATE SET next = id_counters.next + 1
       RETURNING next`,
      [scope],
    );
    return Number(rows[0].next);
  }

  /** Makes sure the next number of `scope` is above `n` (numbers taken by a seed). */
  async reserveUpTo(
    scope: string,
    n: number,
    em?: EntityManager,
  ): Promise<void> {
    await (em ?? this.dataSource.manager).query(
      `INSERT INTO id_counters (scope, next) VALUES ($1, $2)
       ON CONFLICT (scope) DO UPDATE SET next = GREATEST(id_counters.next, EXCLUDED.next)`,
      [scope, n],
    );
  }

  /** Next farm code of a province (`G1-0012`). */
  async nextFarmCode(
    provinceCode: string,
    em?: EntityManager,
  ): Promise<string> {
    return farmCode(
      provinceCode,
      await this.next(farmCounterScope(provinceCode), em),
    );
  }
}
