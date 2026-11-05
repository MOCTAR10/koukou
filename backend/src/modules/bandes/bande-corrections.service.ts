import { BadRequestException, Injectable } from '@nestjs/common';
import { InjectDataSource } from '@nestjs/typeorm';
import { DataSource } from 'typeorm';
import type { AuthUser } from '../../common/decorators/current-user.decorator.js';
import { BatchStatus } from '../../common/enums/batch-type.enum.js';
import { ProductionBatch } from '../batches/entities/production-batch.entity.js';
import { FlockReconciliationService } from '../batches/flock-reconciliation.service.js';
import { utcDay } from '../batches/poufa/bande-rules.js';
import { BandeStatsService } from '../batches/poufa/bande-stats.service.js';
import {
  DailyEntry,
  type FieldSyncMeta,
} from '../daily-entries/entities/daily-entry.entity.js';
import { BandeSnapshotsService } from './bande-snapshots.service.js';
import { BandesService } from './bandes.service.js';
import { CorrectClosedBandeDto } from './dto/sortie.dto.js';
import type { BandeSnapshot } from './entities/bande-snapshot.entity.js';

/**
 * A closed band is read-only (CDC: « modification par un profil habilité
 * uniquement, journalisée »). The ordinary write paths refuse a closed band;
 * this is the one privileged path: a mandatory reason, the change journaled
 * (request in `audit_events`, before/after rows in `audit_row_changes`) and a
 * new bilan version, the earlier ones kept as they were.
 */
@Injectable()
export class BandeCorrectionsService {
  constructor(
    private readonly bandes: BandesService,
    private readonly reconciliation: FlockReconciliationService,
    private readonly stats: BandeStatsService,
    private readonly snapshots: BandeSnapshotsService,
    @InjectDataSource() private readonly dataSource: DataSource,
  ) {}

  async correctDailyEntry(
    actor: AuthUser,
    farmId: string,
    batchId: string,
    dto: CorrectClosedBandeDto,
  ): Promise<{ entry: DailyEntry; snapshot: BandeSnapshot }> {
    const reason = dto.reason.trim();
    if (reason.length < 5) {
      throw new BadRequestException(
        'Le motif de la correction est obligatoire (5 caractères au moins).',
      );
    }
    const { batch } = await this.bandes.load(actor, farmId, batchId);
    const day = dto.entryDate.slice(0, 10);
    const entry = await this.dataSource.transaction(async (em) => {
      const locked = await em
        .getRepository(ProductionBatch)
        .createQueryBuilder('batch')
        .setLock('pessimistic_write')
        .where('batch.id = :id', { id: batch.id })
        .getOne();
      if (!locked || locked.status !== BatchStatus.CLOTURE) {
        throw new BadRequestException(
          "La bande n'est pas clôturée : utiliser la saisie journalière.",
        );
      }
      const closedDay = utcDay(locked.closedAt ?? new Date());
      if (day < locked.integrationDate.slice(0, 10) || day > closedDay) {
        throw new BadRequestException(
          `Le jour corrigé doit être entre l'ouverture (${locked.integrationDate.slice(0, 10)}) et la clôture (${closedDay}).`,
        );
      }
      const repo = em.getRepository(DailyEntry);
      const row =
        (await repo.findOne({ where: { batchId: batch.id, entryDate: day } })) ??
        repo.create({ batchId: batch.id, entryDate: day, catchUp: true });
      if (dto.feedQuantityKg !== undefined && row.inputLotId) {
        throw new BadRequestException(
          'Cette consommation est rattachée à un lot de stock : elle ne peut pas être corrigée ici.',
        );
      }
      const sent: Partial<Record<keyof DailyEntry, unknown>> = {
        deaths: dto.deaths,
        feedQuantity: dto.feedQuantityKg,
        waterL: dto.waterL,
        avgWeightKg: dto.avgWeightKg,
        sampleSize: dto.sampleSize,
      };
      const now = new Date();
      const fieldSync: Record<string, FieldSyncMeta> = { ...row.fieldSync };
      let changed = 0;
      for (const [field, value] of Object.entries(sent)) {
        if (value === undefined) continue;
        (row as unknown as Record<string, unknown>)[field] = value;
        fieldSync[field] = {
          capturedAt: now.toISOString(),
          updatedAt: now.toISOString(),
          userId: actor.id,
          deviceId: null,
        };
        changed += 1;
      }
      if (changed === 0) {
        throw new BadRequestException('Aucune valeur à corriger.');
      }
      if (row.sampleSize != null && !(row.avgWeightKg != null && row.avgWeightKg > 0)) {
        throw new BadRequestException(
          'Le nombre de sujets pesés accompagne un poids moyen.',
        );
      }
      row.fieldSync = fieldSync;
      row.updatedAt = now;
      row.createdById = actor.id;
      const saved = await repo.save(row);
      await this.reconciliation.recomputeLiveCount(em, batch.id);
      await this.stats.refresh(em, batch.id);
      return saved;
    });
    const snapshot = await this.snapshots.addVersion(batch.id, reason, actor.id);
    return { entry, snapshot };
  }
}
