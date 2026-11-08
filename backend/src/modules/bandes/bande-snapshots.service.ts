import {
  Injectable,
  Logger,
  OnModuleDestroy,
  OnModuleInit,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import type { AuthUser } from '../../common/decorators/current-user.decorator.js';
import { BatchStatus } from '../../common/enums/batch-type.enum.js';
import { UserRole } from '../../common/enums/role.enum.js';
import {
  KOUKOU_EVENTS,
  koukouBus,
  type BatchClosedEvent,
} from '../../common/utils/event-bus.js';
import { BatchesService } from '../batches/batches.service.js';
import { ProductionBatch } from '../batches/entities/production-batch.entity.js';
import { daysBetween } from '../batches/flock-performance.js';
import { Farm } from '../farms/entities/farm.entity.js';
import { indicatorValue } from '../indicators/official-indicators.js';
import { BandeIndicatorsService } from './bande-indicators.service.js';
import {
  summaryFromLive,
  summaryFromSnapshot,
  type BandStatusFilter,
  type BandSummary,
} from './band-summary.js';
import { productionCostOf } from './band-production-cost.js';
import type {
  BandProductionCostPort,
  LotProductionCost,
} from '../indicators/official-band-indicators.port.js';
import { BandesService, type BandSheet } from './bandes.service.js';
import {
  BandeSnapshot,
  type BandeSnapshotTrigger,
} from './entities/bande-snapshot.entity.js';

function isUniqueViolation(err: unknown): boolean {
  return (
    typeof err === 'object' &&
    err !== null &&
    (err as { code?: string }).code === '23505'
  );
}

const toFcfa = (n: number | null): number | null =>
  n == null ? null : Math.round(n);

/**
 * Frozen bilans of closed POUFA bands. Closing a band (automatically at zero
 * headcount, or `POST …/batches/:id/close`) emits BATCH_CLOSED; version 1 is
 * then computed from the closed band. Each privileged correction adds a
 * version: earlier ones are never rewritten (DB trigger).
 */
@Injectable()
export class BandeSnapshotsService
  implements OnModuleInit, OnModuleDestroy, BandProductionCostPort
{
  private readonly logger = new Logger(BandeSnapshotsService.name);

  constructor(
    private readonly bandes: BandesService,
    private readonly indicators: BandeIndicatorsService,
    private readonly batchesService: BatchesService,
    @InjectRepository(BandeSnapshot)
    private readonly snapshots: Repository<BandeSnapshot>,
    @InjectRepository(ProductionBatch)
    private readonly batches: Repository<ProductionBatch>,
    @InjectRepository(Farm)
    private readonly farms: Repository<Farm>,
  ) {}

  private readonly onBatchClosed = (event: BatchClosedEvent) => {
    void this.handleClosed(event).catch((err: unknown) =>
      this.logger.error(
        `Bilan de la bande ${event.batchId} : ${String(err)}`,
      ),
    );
  };

  onModuleInit(): void {
    koukouBus.on(KOUKOU_EVENTS.BATCH_CLOSED, this.onBatchClosed);
  }

  onModuleDestroy(): void {
    koukouBus.off(KOUKOU_EVENTS.BATCH_CLOSED, this.onBatchClosed);
  }

  private async handleClosed(event: BatchClosedEvent): Promise<void> {
    await this.ensureClosureSnapshot(event.batchId);
    // A manual close already ran the advisory (lot alerts resolved).
    if (event.auto) await this.batchesService.runAdvisoryForBatch(event.batchId);
  }

  /** Version 1 of a closed band, created once. */
  async ensureClosureSnapshot(batchId: string): Promise<BandeSnapshot | null> {
    const existing = await this.snapshots.findOne({
      where: { batchId, version: 1 },
    });
    if (existing) return existing;
    const batch = await this.batches.findOne({ where: { id: batchId } });
    if (!batch || batch.status !== BatchStatus.CLOTURE) return null;
    const farm = await this.farms.findOne({ where: { id: batch.farmId } });
    if (!farm) return null;
    try {
      return await this.build(
        farm,
        batch,
        1,
        batch.closureKind === 'AUTO' ? 'CLOTURE_AUTO' : 'CLOTURE_MANUELLE',
        null,
        null,
      );
    } catch (err) {
      if (!isUniqueViolation(err)) throw err;
      return this.snapshots.findOne({ where: { batchId, version: 1 } });
    }
  }

  /** New version after a privileged correction of a closed band. */
  async addVersion(
    batchId: string,
    reason: string,
    actorId: string,
  ): Promise<BandeSnapshot> {
    const batch = await this.batches.findOneOrFail({ where: { id: batchId } });
    const farm = await this.farms.findOneOrFail({
      where: { id: batch.farmId },
    });
    await this.ensureClosureSnapshot(batchId);
    for (let attempt = 0; ; attempt++) {
      const last = await this.snapshots.findOne({
        where: { batchId },
        order: { version: 'DESC' },
      });
      try {
        return await this.build(
          farm,
          batch,
          (last?.version ?? 0) + 1,
          'CORRECTION',
          reason,
          actorId,
        );
      } catch (err) {
        if (!isUniqueViolation(err) || attempt >= 3) throw err;
      }
    }
  }

  async list(
    user: AuthUser,
    farmId: string,
    batchId: string,
  ): Promise<BandeSnapshot[]> {
    const { batch } = await this.bandes.load(user, farmId, batchId);
    // The bus listener may still be running right after the close.
    if (
      batch.status === BatchStatus.CLOTURE &&
      user.role !== UserRole.INSTITUTION
    ) {
      await this.ensureClosureSnapshot(batch.id);
    }
    return this.snapshots.find({
      where: { batchId: batch.id },
      order: { version: 'ASC' },
    });
  }

  /**
   * The farm's band history (CDC n° 11): every band (or only the closed /
   * open ones) with its official headline, so the farm compares its bands.
   * A closed band reads its latest frozen bilan, an open one today's
   * indicators; a band whose indicators can't be computed gets `summary`
   * null rather than failing the whole list.
   */
  async history(
    user: AuthUser,
    farmId: string,
    status?: BandStatusFilter,
  ): Promise<(BandSheet & { summary: BandSummary | null })[]> {
    const farm = await this.bandes.programmeFarm(user, farmId);
    const sheets = await this.bandes.list(user, farmId, status);
    const out: (BandSheet & { summary: BandSummary | null })[] = [];
    for (const sheet of sheets) {
      const mayWrite = user.role !== UserRole.INSTITUTION;
      out.push({
        ...sheet,
        summary: await this.summaryOf(farm, sheet, mayWrite),
      });
    }
    return out;
  }

  /** Official production cost per kg of one band (lot sheet, lot list). */
  async productionCost(
    farm: Farm,
    batch: ProductionBatch,
    mayWrite = true,
  ): Promise<LotProductionCost> {
    return productionCostOf(
      await this.summaryOf(
        farm,
        { id: batch.id, status: batch.status },
        mayWrite,
      ),
    );
  }

  private async summaryOf(
    farm: Farm,
    sheet: Pick<BandSheet, 'id' | 'status'>,
    mayWrite = true,
  ): Promise<BandSummary | null> {
    try {
      if (sheet.status === BatchStatus.CLOTURE) {
        if (mayWrite) await this.ensureClosureSnapshot(sheet.id);
        const last = await this.snapshots.findOne({
          where: { batchId: sheet.id },
          order: { version: 'DESC' },
        });
        if (last) return summaryFromSnapshot(last);
      }
      const batch = await this.batches.findOneOrFail({
        where: { id: sheet.id },
      });
      const live = await this.indicators.compute(farm, batch);
      return summaryFromLive(
        live,
        daysBetween(batch.integrationDate.slice(0, 10), live.asOf),
      );
    } catch (err) {
      this.logger.warn(
        `Résumé de la bande ${sheet.id} indisponible : ${String(err)}`,
      );
      return null;
    }
  }

  private async build(
    farm: Farm,
    batch: ProductionBatch,
    version: number,
    trigger: BandeSnapshotTrigger,
    reason: string | null,
    actorId: string | null,
  ): Promise<BandeSnapshot> {
    const result = await this.indicators.compute(farm, batch);
    const duration = daysBetween(
      batch.integrationDate.slice(0, 10),
      result.asOf,
    );
    const revenue = toFcfa(result.variables.ca_fcfa);
    const charges = toFcfa(result.variables.charges_fcfa);
    const margin =
      indicatorValue(result.indicators, 'marge_fcfa') ??
      (revenue != null && charges != null ? revenue - charges : null);
    return this.snapshots.save(
      this.snapshots.create({
        batchId: batch.id,
        farmId: batch.farmId,
        version,
        trigger,
        reason,
        asOf: result.asOf,
        durationDays: duration,
        ageDays: result.ageDays,
        variables: result.variables,
        indicators: result.indicators.map((i) => ({
          key: i.key,
          label: i.label,
          unit: i.unit,
          value: i.value,
          expression: i.expression,
          parameterKey: i.parameterKey,
          parameterVersionId: i.parameterVersionId,
          validFrom: i.validFrom,
        })),
        revenueFcfa: revenue,
        chargesFcfa: charges,
        marginFcfa: toFcfa(margin),
        completenessPct: result.completenessPct,
        createdById: actorId,
      }),
    );
  }
}
