import {
  BadRequestException,
  Injectable,
  Logger,
  OnModuleDestroy,
  OnModuleInit,
} from '@nestjs/common';
import { InjectDataSource } from '@nestjs/typeorm';
import { DataSource, EntityManager, IsNull, Not } from 'typeorm';
import { BatchStatus } from '../../common/enums/batch-type.enum.js';
import {
  LotEventType,
  TraceLotKind,
  TraceLotStatus,
} from '../../common/enums/trace.enum.js';
import {
  KOUKOU_EVENTS,
  koukouBus,
  type BatchClosedEvent,
} from '../../common/utils/event-bus.js';
import type { Sortie } from '../bandes/entities/sortie.entity.js';
import type { SortieCessionHook } from '../bandes/sorties.service.js';
import { ProductionBatch } from '../batches/entities/production-batch.entity.js';
import { Farm } from '../farms/entities/farm.entity.js';
import { IdCounterService } from '../programme/id-counter.service.js';
import type { RefItem } from '../programme/entities/ref-item.entity.js';
import { LotEvent } from './entities/lot-event.entity.js';
import { Operator } from './entities/operator.entity.js';
import { TraceLot } from './entities/trace-lot.entity.js';
import {
  lotCode,
  lotCounterScope,
  subLotCode,
  subLotCounterScope,
} from './trace-codes.js';
import { TraceConfigService } from './trace-config.service.js';

type BandRef = Pick<
  ProductionBatch,
  'id' | 'farmId' | 'code' | 'quantityAtStart' | 'status' | 'closedAt'
>;

export const CESSION_OPERATOR_MESSAGE =
  "Opérateur inconnu ou inactif : une cession vise un opérateur actif du registre du programme.";

/**
 * Lot status as it stands: a root lot is closed with its band (the stored
 * status follows on BATCH_CLOSED; this also covers a missed event).
 */
export function effectiveLotStatus(
  lot: Pick<TraceLot, 'status' | 'parentId'>,
  bandStatus: BatchStatus | null | undefined,
): TraceLotStatus {
  if (
    lot.parentId == null &&
    lot.status === TraceLotStatus.OUVERT &&
    bandStatus === BatchStatus.CLOTURE
  ) {
    return TraceLotStatus.CLOS;
  }
  return lot.status;
}

/**
 * Traceability lots (CDC §6.1, architecture §11). The root lot is created
 * with its band (`BandeOpeningService`, same transaction). Bands opened
 * before traceability existed get theirs on first need (lot list, history,
 * first cession), under the band row lock. A sub-lot is created at each
 * cession, i.e. a sortie towards a programme operator (`SORTIE_CESSION_HOOK`,
 * in the sortie's transaction), with its CESSION event.
 */
@Injectable()
export class TraceLotsService
  implements SortieCessionHook, OnModuleInit, OnModuleDestroy
{
  private readonly logger = new Logger(TraceLotsService.name);

  constructor(
    private readonly idCounter: IdCounterService,
    private readonly config: TraceConfigService,
    @InjectDataSource() private readonly dataSource: DataSource,
  ) {}

  private readonly onBatchClosed = (event: BatchClosedEvent) => {
    void this.closeRootLot(event.batchId).catch((err: unknown) =>
      this.logger.error(
        `Clôture du lot de la bande ${event.batchId} : ${String(err)}`,
      ),
    );
  };

  onModuleInit(): void {
    koukouBus.on(KOUKOU_EVENTS.BATCH_CLOSED, this.onBatchClosed);
  }

  onModuleDestroy(): void {
    koukouBus.off(KOUKOU_EVENTS.BATCH_CLOSED, this.onBatchClosed);
  }

  /**
   * Root lot of a new band, in the opening transaction. Null for a band
   * without a programme number (none since every lot is a band).
   */
  async openRootLot(
    em: EntityManager,
    programId: string,
    band: BandRef,
  ): Promise<TraceLot | null> {
    if (!band.code) return null;
    const rank = await this.idCounter.next(lotCounterScope(band.code), em);
    const code = lotCode(band.code, rank);
    const closed = band.status === BatchStatus.CLOTURE;
    const repo = em.getRepository(TraceLot);
    return repo.save(
      repo.create({
        programId,
        farmId: band.farmId,
        batchId: band.id,
        parentId: null,
        kind: TraceLotKind.LOT,
        code,
        quantity: band.quantityAtStart,
        weightKg: null,
        status: closed ? TraceLotStatus.CLOS : TraceLotStatus.OUVERT,
        qrToken: this.config.sign(code),
        closedAt: closed ? (band.closedAt ?? new Date()) : null,
      }),
    );
  }

  /** The band's root lot, created if missing. The caller holds the band lock. */
  async ensureRootLotLocked(
    em: EntityManager,
    band: BandRef,
  ): Promise<TraceLot | null> {
    const existing = await em
      .getRepository(TraceLot)
      .findOne({ where: { batchId: band.id, parentId: IsNull() } });
    if (existing || !band.code) return existing;
    const farm = await em.getRepository(Farm).findOne({
      where: { id: band.farmId },
      select: { id: true, programId: true },
    });
    if (!farm) return null;
    return this.openRootLot(em, farm.programId, band);
  }

  /**
   * Root lots of a farm's bands opened before traceability (lazy creation,
   * one transaction per band, under its row lock).
   */
  async ensureRootLots(farmId: string, batchId?: string): Promise<void> {
    const missing: { id: string }[] = await this.dataSource.query(
      `SELECT b.id FROM production_batches b
        WHERE b.farm_id = $1 AND b.code IS NOT NULL
          AND ($2::uuid IS NULL OR b.id = $2::uuid)
          AND NOT EXISTS (
            SELECT 1 FROM trace_lots l
             WHERE l.batch_id = b.id AND l.parent_id IS NULL)
        ORDER BY b.integration_date, b."createdAt"`,
      [farmId, batchId ?? null],
    );
    for (const { id } of missing) {
      await this.dataSource.transaction(async (em) => {
        const band = await em
          .getRepository(ProductionBatch)
          .createQueryBuilder('b')
          .setLock('pessimistic_write')
          .where('b.id = :id', { id })
          .getOne();
        if (band) await this.ensureRootLotLocked(em, band);
      });
    }
  }

  /**
   * Cession hook, before the sortie is stored: refuses an unknown, inactive or
   * foreign operator with a French 400 (instead of the foreign key's 500).
   * @throws BadRequestException
   */
  async beforeSortie(
    em: EntityManager,
    farmId: string,
    operatorId: string | null,
  ): Promise<void> {
    if (!operatorId) return;
    await this.assertCessionOperator(em, farmId, operatorId);
  }

  private async assertCessionOperator(
    em: EntityManager,
    farmId: string,
    operatorId: string,
  ): Promise<Operator> {
    const farm = await em.getRepository(Farm).findOne({
      where: { id: farmId },
      select: { id: true, programId: true },
    });
    const operator = await em
      .getRepository(Operator)
      .findOne({ where: { id: operatorId } });
    if (
      !farm ||
      !operator ||
      !operator.active ||
      operator.programId !== farm.programId
    ) {
      throw new BadRequestException(CESSION_OPERATOR_MESSAGE);
    }
    return operator;
  }

  /**
   * Cession hook: a sortie towards an operator creates a sub-lot of the
   * band's root lot and its CESSION event, in the sortie's transaction (the
   * band row is already locked). A sortie without an operator is no cession.
   * @throws BadRequestException on an unknown, inactive or foreign operator
   */
  async onSortie(
    em: EntityManager,
    sortie: Sortie,
    reason: RefItem,
  ): Promise<void> {
    await this.cede(em, sortie, reason);
  }

  /** The sub-lot of a cession (see `onSortie`), or null without an operator. */
  async cede(
    em: EntityManager,
    sortie: Sortie,
    reason: Pick<RefItem, 'code' | 'label' | 'family'>,
  ): Promise<TraceLot | null> {
    if (!sortie.operatorId) return null;
    const operator = await this.assertCessionOperator(
      em,
      sortie.farmId,
      sortie.operatorId,
    );
    const band = await em
      .getRepository(ProductionBatch)
      .findOne({ where: { id: sortie.batchId } });
    if (!band) throw new BadRequestException(CESSION_OPERATOR_MESSAGE);
    const root = await this.ensureRootLotLocked(em, band);
    if (!root) return null;
    const rank = await this.idCounter.next(subLotCounterScope(root.code), em);
    const code = subLotCode(root.code, rank);
    const lots = em.getRepository(TraceLot);
    const sub = await lots.save(
      lots.create({
        programId: operator.programId,
        farmId: sortie.farmId,
        batchId: sortie.batchId,
        parentId: root.id,
        kind: TraceLotKind.SOUS_LOT,
        code,
        quantity: sortie.count,
        weightKg: sortie.weightKg,
        status: TraceLotStatus.CEDE,
        qrToken: this.config.sign(code),
        operatorId: operator.id,
        sortieId: sortie.id,
        cededOn: sortie.sortieDate,
        createdById: sortie.createdById,
      }),
    );
    const events = em.getRepository(LotEvent);
    await events.save(
      events.create({
        lotId: sub.id,
        type: LotEventType.CESSION,
        occurredAt: sortie.capturedAt ?? new Date(),
        actorId: sortie.createdById,
        operatorId: operator.id,
        sortieId: sortie.id,
        data: {
          sortieDate: sortie.sortieDate,
          count: sortie.count,
          weightKg: sortie.weightKg,
          reasonCode: reason.code,
          reasonLabel: reason.label,
          reasonFamily: reason.family,
          saleId: sortie.saleId,
          slaughterOrderId: sortie.slaughterOrderId,
          operatorCode: operator.code,
          operatorName: operator.name,
        },
      }),
    );
    return sub;
  }

  /** BATCH_CLOSED: the band's root lot is closed (its QR is then rejected). */
  async closeRootLot(batchId: string): Promise<void> {
    await this.dataSource.transaction(async (em) => {
      const band = await em
        .getRepository(ProductionBatch)
        .findOne({ where: { id: batchId } });
      if (!band || band.status !== BatchStatus.CLOTURE) return;
      await em.getRepository(TraceLot).update(
        {
          batchId,
          parentId: IsNull(),
          status: Not(TraceLotStatus.CLOS),
        },
        { status: TraceLotStatus.CLOS, closedAt: band.closedAt ?? new Date() },
      );
    });
  }
}
