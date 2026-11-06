import { Injectable } from '@nestjs/common';
import { InjectDataSource } from '@nestjs/typeorm';
import { DataSource, EntityManager } from 'typeorm';
import { BatchStatus } from '../../../common/enums/batch-type.enum.js';
import { runAfterCommit } from '../../../common/utils/after-commit.js';
import { KOUKOU_EVENTS, koukouBus } from '../../../common/utils/event-bus.js';
import { day1WeightKg } from '../../../common/utils/species-day1-weight.js';
import { DailyEntry } from '../../daily-entries/entities/daily-entry.entity.js';
import {
  evaluateOfficialIndicators,
  formulasInForce,
  indicatorValue,
} from '../../indicators/official-indicators.js';
import {
  ParametersService,
  type ParameterResolver,
} from '../../programme/parameters.service.js';
import { BandeDailyStat } from '../entities/bande-daily-stat.entity.js';
import { ProductionBatch } from '../entities/production-batch.entity.js';
import { FlockReconciliationService } from '../flock-reconciliation.service.js';
import {
  buildDailyStats,
  factInstant,
  utcDay,
  type DailyStatRow,
} from './bande-rules.js';

/** Columns per insert statement (PostgreSQL caps parameters at 65535). */
const INSERT_CHUNK = 500;

/**
 * Keeps `bande_daily_stats` in step with a POUFA band, inside the caller's
 * transaction (daily entry, sortie, sale, slaughter, sanitary removal), and
 * closes the band automatically once its headcount reaches zero (CDC « Clôture
 * à effectif nul »).
 */
@Injectable()
export class BandeStatsService {
  constructor(
    private readonly reconciliation: FlockReconciliationService,
    private readonly parameters: ParametersService,
    @InjectDataSource() private readonly dataSource: DataSource,
  ) {}

  /** Programme of the band's farm, or null when the band does not exist. */
  async programIdOf(
    batchId: string,
    em: EntityManager = this.dataSource.manager,
  ): Promise<string | null> {
    const rows: { programId: string | null }[] = await em.query(
      `SELECT f.program_id AS "programId"
         FROM production_batches b JOIN farms f ON f.id = b.farm_id
        WHERE b.id = $1`,
      [batchId],
    );
    return rows[0]?.programId ?? null;
  }

  /**
   * Rewrites the band's projection in `em` (no-op for an unknown band) and
   * closes it when nobody is left. Takes the band's row lock: callers that
   * lock other rows lock the band first (same order as sales and slaughter).
   */
  async refresh(em: EntityManager, batchId: string): Promise<void> {
    const programId = await this.programIdOf(batchId, em);
    if (!programId) return;
    const batch = await em
      .getRepository(ProductionBatch)
      .createQueryBuilder('batch')
      .setLock('pessimistic_write')
      .where('batch.id = :id', { id: batchId })
      .getOne();
    if (!batch) return;
    if (batch.status !== BatchStatus.CLOTURE && batch.quantityAlive <= 0) {
      await this.autoClose(em, batch);
    }
    await this.write(em, batch, programId);
  }

  /** Rebuilds a band's projection from its source rows (own transaction). */
  async rebuild(batchId: string): Promise<void> {
    await this.dataSource.transaction((em) => this.refresh(em, batchId));
  }

  /**
   * Extends to today the projection of open bands nobody wrote to
   * since an earlier day (their "entry not done" days must still appear).
   * Returns the number of bands refreshed.
   */
  async refreshStale(today: string = utcDay()): Promise<number> {
    const stale: { id: string }[] = await this.dataSource.query(
      `SELECT b.id
         FROM production_batches b
         LEFT JOIN LATERAL (
           SELECT MAX(s.day) AS last FROM bande_daily_stats s WHERE s.batch_id = b.id
         ) s ON TRUE
        WHERE b.status <> $1
          AND (s.last IS NULL OR s.last < $2::date)`,
      [BatchStatus.CLOTURE, today],
    );
    for (const { id } of stale) await this.rebuild(id);
    return stale.length;
  }

  /** The projection rows of a band, oldest first. */
  async rows(batchId: string): Promise<BandeDailyStat[]> {
    return this.dataSource.getRepository(BandeDailyStat).find({
      where: { batchId },
      order: { day: 'ASC' },
    });
  }

  private async autoClose(
    em: EntityManager,
    batch: ProductionBatch,
  ): Promise<void> {
    const closedAt = new Date();
    await em
      .getRepository(ProductionBatch)
      .update(batch.id, {
        status: BatchStatus.CLOTURE,
        closedAt,
        closureKind: 'AUTO',
      });
    batch.status = BatchStatus.CLOTURE;
    batch.closedAt = closedAt;
    batch.closureKind = 'AUTO';
    // Listeners (frozen bilan, P&L alerts, advisory) read committed rows.
    const event = { farmId: batch.farmId, batchId: batch.id, auto: true };
    runAfterCommit(em, () =>
      koukouBus.emit(KOUKOU_EVENTS.BATCH_CLOSED, event),
    );
  }

  private async write(
    em: EntityManager,
    batch: ProductionBatch,
    programId: string,
  ): Promise<void> {
    const rows = await this.compute(em, batch, programId);
    const repo = em.getRepository(BandeDailyStat);
    await repo.delete({ batchId: batch.id });
    const records = rows.map((r) =>
      repo.create({ ...r, batchId: batch.id, farmId: batch.farmId, programId }),
    );
    for (let i = 0; i < records.length; i += INSERT_CHUNK) {
      await repo.insert(records.slice(i, i + INSERT_CHUNK));
    }
  }

  private async compute(
    em: EntityManager,
    batch: ProductionBatch,
    programId: string,
  ): Promise<DailyStatRow[]> {
    const [entries, removalsByDate, deathEvents, resolver] = await Promise.all([
      em.getRepository(DailyEntry).find({ where: { batchId: batch.id } }),
      this.reconciliation.removalsByDate(batch.id, em),
      this.reconciliation.deathEvents([batch.id], em),
      this.parameters.resolver(programId, em),
    ]);
    const start = batch.integrationDate.slice(0, 10);
    let endDay = batch.closedAt ? utcDay(batch.closedAt) : utcDay();
    for (const e of entries) {
      const d = e.entryDate.slice(0, 10);
      if (d > endDay) endDay = d;
    }
    if (!batch.closedAt) {
      for (const d of removalsByDate.keys()) if (d > endDay) endDay = d;
    }
    if (endDay < start) endDay = start;
    const mortality = this.mortalityFormula(resolver);
    return buildDailyStats({
      integrationDate: start,
      initialAgeDays: batch.initialAgeDays,
      quantityAtStart: batch.quantityAtStart,
      initialWeightG:
        batch.initialAvgWeightG ?? day1WeightKg(batch.species) * 1000,
      endDay,
      entries: entries.map((e) => ({
        entryDate: e.entryDate.slice(0, 10),
        deaths: e.deaths,
        feedQuantity: e.feedQuantity,
        avgWeightKg: e.avgWeightKg,
        sampleSize: e.sampleSize,
        catchUp: e.catchUp,
      })),
      removalsByDate,
      deathEventsByDate: new Map(deathEvents.map((d) => [d.date, d.quantity])),
      mortalityPct: (day, deaths, presentStart) =>
        mortality(day, { morts_jour: deaths, presents_veille: presentStart }),
    });
  }

  /**
   * `mortalite_jour_pct` with the formulas in force on each day. The set is
   * evaluated whole: an indicator may reference another one.
   */
  private mortalityFormula(resolver: ParameterResolver) {
    return (day: string, vars: Record<string, number>): number | null =>
      indicatorValue(
        evaluateOfficialIndicators(
          formulasInForce(resolver, factInstant(day)),
          vars,
        ),
        'mortalite_jour_pct',
      );
  }
}
