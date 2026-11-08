import { Injectable, Logger } from '@nestjs/common';
import { EntityManager, In, IsNull } from 'typeorm';
import type { AuthUser } from '../../common/decorators/current-user.decorator.js';
import { BatchStatus } from '../../common/enums/batch-type.enum.js';
import { FeedUnit } from '../../common/enums/food-type.enum.js';
import { ImportRowOutcome } from '../../common/enums/import-job.enum.js';
import { Species } from '../../common/enums/species.enum.js';
import { runAfterCommit } from '../../common/utils/after-commit.js';
import { KOUKOU_EVENTS, koukouBus } from '../../common/utils/event-bus.js';
import { BatchesService } from '../batches/batches.service.js';
import { ProductionBatch } from '../batches/entities/production-batch.entity.js';
import { BandeOpeningService } from '../batches/poufa/bande-opening.service.js';
import { BandeStatsService } from '../batches/poufa/bande-stats.service.js';
import { Breed } from '../breeds/entities/breed.entity.js';
import { Building } from '../buildings/entities/building.entity.js';
import { DailyEntriesService } from '../daily-entries/daily-entries.service.js';
import { DailyEntry } from '../daily-entries/entities/daily-entry.entity.js';
import { Farm } from '../farms/entities/farm.entity.js';
import { Province } from '../programme/entities/province.entity.js';
import {
  controlBandRows,
  frDay,
  type BandControlContext,
  type BandPlan,
  type BuildingRef,
  type ExistingBand,
  type LinkedBand,
} from './band-import-rules.js';
import type { ImportJob } from './entities/import-job.entity.js';
import { ImportSourceLink } from './entities/import-source-link.entity.js';
import {
  refusalMessage,
  type RowFinding,
  type RowResult,
  type StagedRow,
} from './recovery-types.js';
import { todayLocal } from '../../common/utils/date.utils.js';

/** A business rule refused one line of a band (its savepoint is rolled back). */
class BandLineRefused extends Error {
  constructor(
    readonly line: number,
    readonly reason: string,
  ) {
    super(reason);
  }
}

/** Mid-day UTC: the same calendar day in Gabon (UTC+1). */
function dayInstant(day: string): Date {
  return new Date(`${day}T12:00:00.000Z`);
}

/**
 * Historical bands (paper/Excel sheets, transitional tool) → POUFA bands.
 * Each band is opened by `BandeOpeningService` (number, J+x through
 * `initialAgeDays`, reference duration, projection) and each day goes
 * through `DailyEntriesService` (every daily-entry rule, catch-up flag,
 * live count, projection, journal), in a savepoint of the job's transaction:
 * a band is all or nothing. Historical feed never touches today's stock
 * (`skipStockDeduction`), and no purchase expense is booked.
 */
@Injectable()
export class BandRecoveryService {
  private readonly logger = new Logger(BandRecoveryService.name);

  constructor(
    private readonly opening: BandeOpeningService,
    private readonly stats: BandeStatsService,
    private readonly entries: DailyEntriesService,
    private readonly batches: BatchesService,
  ) {}

  /** Serializes band recoveries of a programme until commit. */
  async lock(em: EntityManager, programId: string): Promise<void> {
    await em.query('SELECT pg_advisory_xact_lock(hashtext($1))', [
      `import-bands:${programId}`,
    ]);
  }

  private async context(
    em: EntityManager,
    programId: string,
    confirmDuplicate: boolean,
  ): Promise<BandControlContext> {
    const [farms, provinces] = await Promise.all([
      em.getRepository(Farm).find({
        where: { programId },
        select: {
          id: true,
          code: true,
          name: true,
          provinceId: true,
          amiRef: true,
          capacityPlaces: true,
        },
      }),
      em.getRepository(Province).find({
        where: { programId },
        select: { id: true, code: true, name: true },
      }),
    ]);
    const provinceOf = new Map(provinces.map((p) => [p.id, p]));
    const farmIds = farms.map((f) => f.id);
    const [breeds, buildings, bands, links] = await Promise.all([
      em.getRepository(Breed).find({
        where: [
          { farmId: IsNull(), active: true },
          ...(farmIds.length > 0
            ? [{ farmId: In(farmIds), active: true }]
            : []),
        ],
      }),
      farmIds.length > 0
        ? em.getRepository(Building).find({
            where: { farmId: In(farmIds) },
            select: { id: true, name: true, farmId: true },
          })
        : Promise.resolve([] as Building[]),
      farmIds.length > 0
        ? em.getRepository(ProductionBatch).find({
            where: { farmId: In(farmIds) },
            select: {
              id: true,
              farmId: true,
              code: true,
              integrationDate: true,
              quantityAtStart: true,
              status: true,
            },
          })
        : Promise.resolve([] as ProductionBatch[]),
      em
        .getRepository(ImportSourceLink)
        .find({ where: { programId, kind: 'BANDE' } }),
    ]);
    const buildingsByFarm = new Map<string, BuildingRef[]>();
    for (const b of buildings) {
      const list = buildingsByFarm.get(b.farmId) ?? [];
      list.push({ id: b.id, name: b.name });
      buildingsByFarm.set(b.farmId, list);
    }
    const bandsByFarm = new Map<string, ExistingBand[]>();
    const bandById = new Map<string, ProductionBatch>();
    for (const b of bands) {
      bandById.set(b.id, b);
      const list = bandsByFarm.get(b.farmId) ?? [];
      list.push({
        id: b.id,
        code: b.code,
        integrationDate: b.integrationDate,
        quantityAtStart: b.quantityAtStart,
      });
      bandsByFarm.set(b.farmId, list);
    }
    const linkedIds = links
      .map((l) => l.targetId)
      .filter((id) => bandById.has(id));
    const entryRows: { batchId: string; entryDate: string }[] =
      linkedIds.length > 0
        ? await em.getRepository(DailyEntry).find({
            where: { batchId: In(linkedIds) },
            select: { batchId: true, entryDate: true },
          })
        : [];
    const datesOf = new Map<string, Set<string>>();
    for (const e of entryRows) {
      const set = datesOf.get(e.batchId) ?? new Set<string>();
      set.add(String(e.entryDate).slice(0, 10));
      datesOf.set(e.batchId, set);
    }
    const linkMap = new Map<string, LinkedBand>();
    for (const l of links) {
      const b = bandById.get(l.targetId);
      if (!b) continue;
      linkMap.set(l.sourceKey, {
        batchId: b.id,
        code: b.code,
        closed: b.status === BatchStatus.CLOTURE,
        integrationDate: String(b.integrationDate).slice(0, 10),
        quantityAtStart: b.quantityAtStart,
        entryDates: datesOf.get(b.id) ?? new Set(),
      });
    }
    return {
      today: todayLocal(),
      farms: farms
        .filter((f) => !!f.code)
        .map((f) => {
          const p = f.provinceId ? provinceOf.get(f.provinceId) : undefined;
          return {
            id: f.id,
            code: f.code as string,
            name: f.name,
            provinceCode: p?.code ?? null,
            provinceName: p?.name ?? null,
            amiRef: f.amiRef,
            capacityPlaces: f.capacityPlaces,
          };
        }),
      breeds: breeds.map((b) => ({
        id: b.id,
        name: b.name,
        refCode: b.refCode,
        type: b.type,
        farmId: b.farmId,
      })),
      buildingsByFarm,
      links: linkMap,
      bandsByFarm,
      confirmDuplicate,
    };
  }

  /** Controls every line against the registry and the bands in `em`. */
  async control(
    em: EntityManager,
    job: ImportJob,
    rows: readonly StagedRow[],
  ): Promise<{ findings: Map<number, RowFinding>; plans: BandPlan[] }> {
    const ctx = await this.context(
      em,
      job.programId,
      job.options.confirmDuplicate,
    );
    const result = controlBandRows(
      rows
        .filter((r) => !r.excluded)
        .map((r) => ({ line: r.line, values: r.values })),
      ctx,
    );
    const findings = new Map<number, RowFinding>();
    for (const r of result.rows) {
      findings.set(r.line, {
        errors: r.errors,
        warnings: r.warnings,
        planned: r.planned,
        groupKey: r.groupKey,
        sourceKey: r.sourceKey,
        details: r.details,
      });
    }
    return { findings, plans: result.plans };
  }

  /**
   * Writes the planned bands in `em` (the job's transaction), each in its
   * own savepoint. Lines in error are not in a plan: the caller reports
   * them rejected with the controls' reasons.
   */
  async apply(
    em: EntityManager,
    user: AuthUser,
    job: ImportJob,
    plans: readonly BandPlan[],
    dryRun: boolean,
  ): Promise<Map<number, RowResult>> {
    const results = new Map<number, RowResult>();
    const touched: {
      farmId: string;
      batchId: string;
      lastDay: string | null;
      closed: boolean;
    }[] = [];
    for (const plan of plans) {
      try {
        const done = await em.transaction((sp) =>
          this.applyBand(sp, user, job, plan),
        );
        const code = done.code ?? null;
        const suffix = dryRun ? ' (simulé)' : '';
        const entryLines = new Map(plan.entries.map((e) => [e.line, e]));
        const present = new Set(plan.alreadyPresentLines);
        for (const line of plan.lines) {
          const entry = entryLines.get(line);
          if (entry) {
            results.set(line, {
              outcome: ImportRowOutcome.INTEGREE,
              message: `Saisie du ${frDay(entry.entryDate)} reprise dans la bande ${code}${suffix}.`,
              targetId: done.batchId,
              targetCode: code,
            });
          } else if (present.has(line)) {
            results.set(line, {
              outcome: ImportRowOutcome.DEJA_PRESENTE,
              message: `Saisie déjà reprise dans la bande ${code}.`,
              targetId: done.batchId,
              targetCode: code,
            });
          } else if (done.created) {
            results.set(line, {
              outcome: ImportRowOutcome.INTEGREE,
              message: `Bande ouverte : ${code}${suffix}.`,
              targetId: done.batchId,
              targetCode: code,
            });
          } else {
            results.set(line, {
              outcome: ImportRowOutcome.DEJA_PRESENTE,
              message: `Bande déjà reprise : ${code}.`,
              targetId: done.batchId,
              targetCode: code,
            });
          }
        }
        touched.push({
          farmId: plan.farm.id,
          batchId: done.batchId,
          lastDay: plan.entries.at(-1)?.entryDate ?? null,
          closed: done.closed,
        });
      } catch (error) {
        const refused =
          error instanceof BandLineRefused
            ? error
            : refusalMessage(error) !== null
              ? new BandLineRefused(
                  plan.lines[0],
                  refusalMessage(error) as string,
                )
              : null;
        if (!refused) throw error;
        for (const line of plan.lines) {
          results.set(line, {
            outcome: ImportRowOutcome.REJETEE,
            message:
              line === refused.line
                ? refused.reason
                : `Bande ${plan.bandRef} non reprise : la ligne ${refused.line} est refusée (${refused.reason})`,
            targetId: null,
            targetCode: null,
          });
        }
      }
    }
    if (!dryRun) this.afterCommit(em, touched);
    return results;
  }

  private async applyBand(
    sp: EntityManager,
    user: AuthUser,
    job: ImportJob,
    plan: BandPlan,
  ): Promise<{
    batchId: string;
    code: string | null;
    created: boolean;
    closed: boolean;
  }> {
    const farm = await sp
      .getRepository(Farm)
      .findOneByOrFail({ id: plan.farm.id });
    const repo = sp.getRepository(ProductionBatch);
    let batch: ProductionBatch;
    let created = false;
    if (plan.linked) {
      batch = await repo.findOneByOrFail({ id: plan.linked.batchId });
    } else {
      const o = plan.opening;
      const building = o.buildingId
        ? await sp.getRepository(Building).findOneBy({ id: o.buildingId })
        : null;
      const draft = repo.create({
        farmId: farm.id,
        breedId: o.breedId,
        buildingId: o.buildingId,
        batchName: `Reprise ${plan.bandRef}`,
        integrationDate: o.integrationDate,
        quantityAtStart: o.quantityAtStart,
        quantityAlive: o.quantityAtStart,
        type: o.type,
        species: Species.POULET,
        status: BatchStatus.ACTIF,
        buildingAreaM2: building?.buildingAreaM2 ?? farm.buildingAreaM2 ?? null,
        feedUnitSacKg: farm.defaultSacKg,
      });
      try {
        batch = await this.opening.open(sp, farm, draft, {
          initialAgeDays: o.initialAgeDays,
          initialAvgWeightG: o.initialWeightG ?? undefined,
        });
      } catch (error) {
        const reason = refusalMessage(error);
        if (reason) throw new BandLineRefused(plan.lines[0], reason);
        throw error;
      }
      await sp.getRepository(ImportSourceLink).insert({
        programId: job.programId,
        kind: 'BANDE',
        sourceKey: plan.sourceKey,
        targetId: batch.id,
        targetCode: batch.code,
        jobId: job.id,
      });
      created = true;
    }
    for (const e of plan.entries) {
      try {
        await this.entries.create(
          user,
          farm.id,
          batch.id,
          {
            entryDate: e.entryDate,
            deaths: e.deaths,
            ...(e.feedKg !== undefined
              ? { feedQuantity: e.feedKg, feedUnit: FeedUnit.KG }
              : {}),
            // Historical feed was eaten from stock never recorded here.
            skipStockDeduction: true,
            waterL: e.waterL,
            avgWeightKg: e.avgWeightKg,
            sampleSize: e.sampleSize,
          },
          { em: sp, farm },
        );
      } catch (error) {
        const reason = refusalMessage(error);
        if (reason) throw new BandLineRefused(e.line, reason);
        throw error;
      }
    }
    const fresh = await repo.findOneByOrFail({ id: batch.id });
    let closed = fresh.status === BatchStatus.CLOTURE;
    const closeOn = plan.opening.closureDate;
    if (!closed && closeOn) {
      await repo.update(batch.id, {
        status: BatchStatus.CLOTURE,
        closedAt: dayInstant(closeOn),
        closureKind: null,
      });
      await this.stats.refresh(sp, batch.id);
      const event = { farmId: farm.id, batchId: batch.id };
      runAfterCommit(sp, () =>
        koukouBus.emit(KOUKOU_EVENTS.BATCH_CLOSED, event),
      );
      closed = true;
    } else if (
      closed &&
      fresh.closureKind === 'AUTO' &&
      !plan.linked?.closed &&
      plan.entries.length > 0
    ) {
      // Nobody left after the last historical day: the band ended then, not
      // on the day of the recovery (the vide sanitaire counts from it).
      const lastDay = closeOn ?? (plan.entries.at(-1)?.entryDate as string);
      await repo.update(batch.id, { closedAt: dayInstant(lastDay) });
      await this.stats.refresh(sp, batch.id);
    }
    return { batchId: batch.id, code: batch.code, created, closed };
  }

  /** Dashboards and advisory once the bands are committed (never blocking). */
  private afterCommit(
    em: EntityManager,
    touched: readonly {
      farmId: string;
      batchId: string;
      lastDay: string | null;
      closed: boolean;
    }[],
  ): void {
    if (touched.length === 0) return;
    runAfterCommit(em, async () => {
      const lastByFarm = new Map<string, { batchId: string; day: string }>();
      for (const t of touched) {
        if (!t.lastDay) continue;
        const prev = lastByFarm.get(t.farmId);
        if (!prev || prev.day < t.lastDay) {
          lastByFarm.set(t.farmId, { batchId: t.batchId, day: t.lastDay });
        }
      }
      for (const [farmId, { batchId, day }] of lastByFarm) {
        koukouBus.emit(KOUKOU_EVENTS.DAILY_ENTRY_CREATED, {
          farmId,
          batchId,
          entryDate: day,
        });
      }
      for (const t of touched) {
        if (t.closed) continue;
        await this.batches
          .runAdvisoryForBatch(t.batchId)
          .catch((err: unknown) =>
            this.logger.error(
              `Conseil après reprise (bande ${t.batchId}) : ${String(err)}`,
            ),
          );
      }
    });
  }
}
