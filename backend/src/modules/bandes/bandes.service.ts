import { Injectable, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import type { AuthUser } from '../../common/decorators/current-user.decorator.js';
import { BatchStatus } from '../../common/enums/batch-type.enum.js';
import { ProductionBatch } from '../batches/entities/production-batch.entity.js';
import {
  ageOn,
  completenessPct,
  expectedEndDate,
  utcDay,
  type WeighingStatus,
} from '../batches/poufa/bande-rules.js';
import { BandeStatsService } from '../batches/poufa/bande-stats.service.js';
import { Farm } from '../farms/entities/farm.entity.js';
import { FarmsService } from '../farms/farms.service.js';
import { BandeSnapshot } from './entities/bande-snapshot.entity.js';
import { WeighingsService } from './weighings.service.js';

export interface Band {
  farm: Farm & { programId: string };
  batch: ProductionBatch;
}

export interface BandSheet {
  id: string;
  code: string | null;
  batchName: string | null;
  status: BatchStatus;
  integrationDate: string;
  initialAgeDays: number | null;
  initialAvgWeightG: number | null;
  referenceDurationDays: number | null;
  expectedEndDate: string | null;
  /** Age today, or at closure for a closed band. */
  ageDays: number;
  quantityAtStart: number;
  quantityAlive: number;
  closedAt: Date | null;
  completenessPct: number | null;
  weighing: WeighingStatus;
  lastSnapshotVersion: number | null;
}

export const NOT_A_BAND =
  'Bande introuvable : cette ferme ne fait pas partie du programme.';

/** Read side of POUFA bands and the access check shared by the band routes. */
@Injectable()
export class BandesService {
  constructor(
    private readonly farms: FarmsService,
    private readonly stats: BandeStatsService,
    private readonly weighings: WeighingsService,
    @InjectRepository(ProductionBatch)
    private readonly batches: Repository<ProductionBatch>,
    @InjectRepository(BandeSnapshot)
    private readonly snapshots: Repository<BandeSnapshot>,
  ) {}

  /** Farm access + programme farm + band of that farm, or 403/404. */
  async load(user: AuthUser, farmId: string, batchId: string): Promise<Band> {
    const farm = await this.programmeFarm(user, farmId);
    const batch = await this.batches.findOne({
      where: { id: batchId, farmId },
    });
    if (!batch) throw new NotFoundException('Bande introuvable dans cette ferme.');
    return { farm, batch };
  }

  async programmeFarm(
    user: AuthUser,
    farmId: string,
  ): Promise<Farm & { programId: string }> {
    const farm = await this.farms.assertAccessible(user, farmId);
    if (!farm.programId) throw new NotFoundException(NOT_A_BAND);
    return farm as Farm & { programId: string };
  }

  async sheet(user: AuthUser, farmId: string, batchId: string) {
    return this.sheetOf(await this.load(user, farmId, batchId));
  }

  /** Every band of a programme farm, newest first (history, comparison). */
  async list(user: AuthUser, farmId: string): Promise<BandSheet[]> {
    const farm = await this.programmeFarm(user, farmId);
    const batches = await this.batches.find({
      where: { farmId },
      order: { integrationDate: 'DESC', createdAt: 'DESC' },
    });
    const out: BandSheet[] = [];
    for (const batch of batches) out.push(await this.sheetOf({ farm, batch }));
    return out;
  }

  async sheetOf({ farm, batch }: Band): Promise<BandSheet> {
    const today = utcDay();
    const rows = await this.stats.rows(batch.id);
    const last = await this.snapshots.findOne({
      where: { batchId: batch.id },
      order: { version: 'DESC' },
    });
    const endDay = batch.closedAt ? utcDay(batch.closedAt) : today;
    return {
      id: batch.id,
      code: batch.code,
      batchName: batch.batchName,
      status: batch.status,
      integrationDate: batch.integrationDate,
      initialAgeDays: batch.initialAgeDays,
      initialAvgWeightG: batch.initialAvgWeightG,
      referenceDurationDays: batch.referenceDurationDays,
      expectedEndDate: expectedEndDate(
        batch.integrationDate,
        batch.initialAgeDays,
        batch.referenceDurationDays,
      ),
      ageDays: ageOn(batch.integrationDate, batch.initialAgeDays, endDay),
      quantityAtStart: batch.quantityAtStart,
      quantityAlive: batch.quantityAlive,
      closedAt: batch.closedAt,
      completenessPct: completenessPct(
        rows,
        batch.integrationDate.slice(0, 10),
        endDay,
        today,
      ),
      weighing: await this.weighings.status(farm.programId, batch),
      lastSnapshotVersion: last?.version ?? null,
    };
  }
}
