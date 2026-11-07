import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { DataSource, In, Repository } from 'typeorm';
import type { AuthUser } from '../../common/decorators/current-user.decorator.js';
import { AlertLevel } from '../../common/enums/alert-level.enum.js';
import { DiseaseSeverity } from '../../common/enums/disease-severity.enum.js';
import { ReferenceKey } from '../../common/enums/reference-key.enum.js';
import {
  BatchStatus,
  BatchType,
} from '../../common/enums/batch-type.enum.js';
import { SanitaryDeclarationPolicy } from '../access/sanitary-declaration.policy.js';
import { FarmsService } from '../farms/farms.service.js';
import { ReferenceConstantsService } from '../reference-constants/reference-constants.service.js';
import { BatchesService } from '../batches/batches.service.js';
import { FlockReconciliationService } from '../batches/flock-reconciliation.service.js';
import { MetricsService } from '../batches/metrics.service.js';
import type { BatchMetrics } from '../batches/models/batch-metrics.model.js';
import { ProductionBatch } from '../batches/entities/production-batch.entity.js';
import { DailyEntry } from '../daily-entries/entities/daily-entry.entity.js';
import { HealthEvent } from './entities/health-event.entity.js';
import { HealthEventKind } from '../../common/enums/health-event-kind.enum.js';
import { HealthEventStatus } from '../../common/enums/health-event-status.enum.js';
import { CreateHealthEventDto } from './dto/create-health-event.dto.js';
import { BandeStatsService } from '../batches/poufa/bande-stats.service.js';
import { createHash, randomUUID } from 'node:crypto';
import { mkdir, readFile, unlink, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { ProgramListType } from '../../common/enums/program-list-type.enum.js';
import { runAfterCommit } from '../../common/utils/after-commit.js';
import {
  KOUKOU_EVENTS,
  koukouBus,
  type DeclarationReceivedEvent,
} from '../../common/utils/event-bus.js';
import { createOnce } from '../../common/utils/idempotency.js';
import {
  hasImageSignature,
  uploadsRoot,
  type UploadedImageFile,
} from '../farms/farms.service.js';
import { RefListsService } from '../programme/ref-lists.service.js';
import { SanitaryAlertsService } from '../surveillance/sanitary-alerts.service.js';
import { HealthEventPhoto } from './entities/health-event-photo.entity.js';

const EGGS_PER_TRAY = 30;

/** Photos of a declaration (CDC « Proposé : photo »), sent after its text. */
export const DECLARATION_PHOTO_MAX_BYTES = 5 * 1024 * 1024;
export const DECLARATION_PHOTOS_MAX = 5;
const PHOTO_EXTENSIONS: Record<string, string> = {
  'image/png': 'png',
  'image/jpeg': 'jpg',
  'image/jpg': 'jpg',
  'image/webp': 'webp',
};

/** Directory of a farm's declaration photos (never served statically). */
export function declarationPhotosDir(farmId: string): string {
  return join(uploadsRoot(), 'sanitary', farmId);
}

/** A photo as the declaration list serves it (no path). */
export interface HealthEventPhotoView {
  id: string;
  mimeType: string;
  sizeBytes: number;
  createdAt: Date;
}

export type HealthEventWithPhotos = HealthEvent & {
  photos: HealthEventPhotoView[];
};
const round2 = (n: number): number => Math.round(n * 100) / 100;

const DISEASE_SEVERITY_TO_LEVEL: Record<DiseaseSeverity, AlertLevel> = {
  [DiseaseSeverity.LOW]: AlertLevel.VERT,
  [DiseaseSeverity.MEDIUM]: AlertLevel.JAUNE,
  [DiseaseSeverity.HIGH]: AlertLevel.ROUGE,
  [DiseaseSeverity.CRITICAL]: AlertLevel.ROUGE,
};

function todayIso(): string {
  return new Date().toISOString().slice(0, 10);
}

function addDaysIso(date: string, days: number): string {
  const d = new Date(`${date}T12:00:00Z`);
  d.setUTCDate(d.getUTCDate() + days);
  return d.toISOString().slice(0, 10);
}

export interface TipItem {
  level: AlertLevel;
  text: string;
}

@Injectable()
export class HealthService {
  constructor(
    @InjectRepository(HealthEvent)
    private readonly eventRepo: Repository<HealthEvent>,
    @InjectRepository(ProductionBatch)
    private readonly batchRepo: Repository<ProductionBatch>,
    @InjectRepository(DailyEntry)
    private readonly entriesRepo: Repository<DailyEntry>,
    private readonly farmsService: FarmsService,
    private readonly constants: ReferenceConstantsService,
    private readonly metrics: MetricsService,
    private readonly dataSource: DataSource,
    private readonly flockReconciliation: FlockReconciliationService,
    private readonly batchesService: BatchesService,
    private readonly declarations: SanitaryDeclarationPolicy,
    private readonly bandeStats: BandeStatsService,
    @InjectRepository(HealthEventPhoto)
    private readonly photoRepo: Repository<HealthEventPhoto>,
    private readonly lists: RefListsService,
    private readonly sanitaryAlerts: SanitaryAlertsService,
  ) {}

  async getHealth(user: AuthUser, farmId: string, batchId: string) {
    await this.farmsService.assertAccessible(user, farmId);
    const batch = await this.assertBatchInFarm(farmId, batchId);
    const [m, breed, entries, deathEvents] = await Promise.all([
      this.metrics.compute(batch),
      this.metrics.breedStatus(batch),
      this.entriesRepo.find({
        where: { batchId: batch.id },
        order: { entryDate: 'ASC' },
      }),
      this.flockReconciliation.deathEvents([batch.id]),
    ]);

    const waterNormL =
      (await this.constants.get(ReferenceKey.WATER_PER_BIRD_L_DAY, 0.2)) ?? 0.2;

    const trays = m.eggBreakdown.sellable > 0
      ? Math.floor(m.eggBreakdown.sellable / EGGS_PER_TRAY)
      : 0;
    // Per bird AND per day (recette A7): the cumulative feed over the days
    // since placement, not the whole-bande total per bird.
    const feedDays = (() => {
      const last = entries.length ? entries[entries.length - 1].entryDate : null;
      if (!last || !batch.integrationDate) return 1;
      const ms = Date.parse(`${last}T00:00:00Z`) - Date.parse(`${batch.integrationDate}T00:00:00Z`);
      return Math.max(1, Math.round(ms / 86_400_000) + 1);
    })();
    const feedPerBirdGrams =
      m.liveCount > 0 ? (m.totalFeedKg * 1000) / m.liveCount / feedDays : 0;

    const healthScore = this.computeHealthScore(m.mortalityPercent, m.fcr);
    const tips = this.buildTips({
      metrics: m,
      breed,
      waterNormL,
      batchType: batch.type,
    });

    const trends = this.buildTrends(entries, deathEvents);

    return {
      farmId,
      batchId,
      batchName: batch.batchName ?? batch.id,
      batchType: batch.type,
      computedAt: new Date().toISOString(),
      ageDays: m.ageDays,
      quantityAtStart: batch.quantityAtStart,
      liveCount: m.liveCount,
      totalDeaths: m.totalDeaths,
      mortalityPercent: round2(m.mortalityPercent),
      viabilityPercent: round2(m.viabilityPercent),
      fcr: m.fcr != null ? round2(m.fcr) : null,
      gmq: m.gmqGramsPerDay != null ? round2(m.gmqGramsPerDay) : null,
      ipe: m.ipe != null ? round2(m.ipe) : null,
      trays,
      eggsCollectedTotal: m.eggsCollectedTotal,
      layRatePercent:
        m.layRatePercent != null ? round2(m.layRatePercent) : null,
      feedPerBirdGrams: round2(feedPerBirdGrams),
      waterLPerBird:
        m.waterLPerBird != null ? round2(m.waterLPerBird) : null,
      healthScore,
      tips,
      trends,
      check: {
        insights: this.buildInsights({ metrics: m, breed }),
        advice: this.buildAdvice({ metrics: m, breed }),
      },
    };
  }

  async listEvents(
    user: AuthUser,
    farmId: string,
    batchId: string,
  ): Promise<HealthEventWithPhotos[]> {
    // Legal rule: declarations stay between the farm and the vets.
    await this.declarations.assertRead(user);
    await this.farmsService.assertAccessible(user, farmId);
    await this.assertBatchInFarm(farmId, batchId);
    const events = await this.eventRepo.find({
      where: { farmId, batchId },
      order: { occurredAt: 'DESC', createdAt: 'DESC' },
    });
    return this.withPhotos(events);
  }

  private async withPhotos(
    events: HealthEvent[],
  ): Promise<HealthEventWithPhotos[]> {
    const ids = events.map((e) => e.id);
    const photos = ids.length
      ? await this.photoRepo.find({
          where: { healthEventId: In(ids) },
          order: { createdAt: 'ASC' },
        })
      : [];
    const byEvent = new Map<string, HealthEventPhotoView[]>();
    for (const p of photos) {
      const list = byEvent.get(p.healthEventId) ?? [];
      list.push(this.photoView(p));
      byEvent.set(p.healthEventId, list);
    }
    return events.map((e) => ({ ...e, photos: byEvent.get(e.id) ?? [] }));
  }

  async createEvent(
    user: AuthUser,
    farmId: string,
    batchId: string,
    dto: CreateHealthEventDto,
  ): Promise<HealthEvent> {
    // Legal rule: declarations stay between the farm and the vets.
    await this.declarations.assert(user);
    const farm = await this.farmsService.assertAccessible(user, farmId);
    const batch = await this.assertBatchInFarm(farmId, batchId);
    const quantity = dto.quantity ?? 0;
    // A replayed offline declaration returns the first one, untouched.
    if (dto.idempotencyKey) {
      const replay = await this.eventRepo.findOne({
        where: { farmId, idempotencyKey: dto.idempotencyKey },
      });
      if (replay) return replay;
    }
    const clinicalSigns = await this.checkClinicalSigns(dto.clinicalSigns);

    if (!dto.severity && !dto.diseaseSeverity) {
      throw new BadRequestException('La gravité (ou la sévérité de la maladie) est requise.');
    }

    if (
      (dto.kind === HealthEventKind.REFORME ||
        dto.kind === HealthEventKind.MORTALITE) &&
      quantity > 0
    ) {
      if (batch.status === BatchStatus.CLOTURE) {
        throw new BadRequestException(
          'Ce lot est clôturé : aucun oiseau ne peut plus en être retiré.',
        );
      }
      const live = Math.max(0, batch.quantityAlive);
      if (quantity > live) {
        throw new BadRequestException(
          dto.kind === HealthEventKind.REFORME
            ? `La réforme (${quantity} oiseaux) dépasse l'effectif vivant (${live}).`
            : `La mortalité (${quantity} oiseaux) dépasse l'effectif vivant (${live}).`,
        );
      }
    }

    const resolved = dto.resolved === true;
    const event = this.eventRepo.create({
      farmId,
      batchId,
      kind: dto.kind,
      occurredAt: dto.occurredAt,
      severity: dto.diseaseSeverity
        ? DISEASE_SEVERITY_TO_LEVEL[dto.diseaseSeverity]
        : (dto.severity as AlertLevel),
      status: resolved ? HealthEventStatus.RESOLU : HealthEventStatus.OUVERT,
      quantity,
      title: dto.title,
      description: dto.description ?? null,
      symptoms: dto.symptoms ?? null,
      disease: dto.disease ?? null,
      diseaseSeverity: dto.diseaseSeverity ?? null,
      treatmentGiven: dto.treatmentGiven ?? null,
      vetConsulted: dto.vetConsulted ?? false,
      vetName: dto.vetName ?? null,
      notes: dto.notes ?? null,
      resolvedAt: resolved ? todayIso() : null,
      createdById: user.id,
      clinicalSigns,
      suspicion: dto.suspicion === true,
      idempotencyKey: dto.idempotencyKey ?? null,
    });
    let created = false;
    const saved = await createOnce(
      this.eventRepo,
      farmId,
      dto.idempotencyKey,
      () =>
        // The declaration and the alert of a suspicion commit together.
        this.dataSource.transaction(async (em) => {
          const row = await em.getRepository(HealthEvent).save(event);
          if (row.suspicion) {
            await this.sanitaryAlerts.raiseFromDeclaration(em, row, farm);
          }
          const received: DeclarationReceivedEvent = {
            farmId,
            batchId,
            healthEventId: row.id,
            kind: row.kind,
            severity: row.severity,
            suspicion: row.suspicion,
          };
          runAfterCommit(em, () =>
            koukouBus.emit(KOUKOU_EVENTS.DECLARATION_RECEIVED, received),
          );
          created = true;
          return row;
        }),
    );
    // A concurrent replay lost on the unique key: nothing more to apply.
    if (!created) return saved;

    if (
      (dto.kind === HealthEventKind.REFORME ||
        dto.kind === HealthEventKind.MORTALITE) &&
      quantity > 0
    ) {
      await this.recomputeLiveCount(batchId);
      // Mortality / density / water alerts depend on these birds: re-evaluate
      // now instead of waiting for the next daily entry.
      await this.batchesService.runAdvisoryForBatch(batchId);
    }

    return saved;
  }

  async resolveEvent(
    user: AuthUser,
    farmId: string,
    batchId: string,
    eventId: string,
  ): Promise<HealthEvent> {
    // Legal rule: declarations stay between the farm and the vets.
    await this.declarations.assert(user);
    await this.farmsService.assertAccessible(user, farmId);
    await this.assertBatchInFarm(farmId, batchId);
    const event = await this.eventRepo.findOne({ where: { id: eventId, farmId, batchId } });
    if (!event) throw new NotFoundException('Événement sanitaire introuvable.');
    event.status = HealthEventStatus.RESOLU;
    event.resolvedAt = todayIso();
    return this.eventRepo.save(event);
  }

  async deleteEvent(
    user: AuthUser,
    farmId: string,
    batchId: string,
    eventId: string,
  ): Promise<{ deleted: boolean }> {
    // Legal rule: declarations stay between the farm and the vets.
    await this.declarations.assert(user);
    // Gated by @Permissions('sanitaire:gerer') on the route (owner, platform
    // admin and ADMIN staff holding it), not by the global user role.
    await this.farmsService.assertAccessible(user, farmId);
    await this.assertBatchInFarm(farmId, batchId);
    const event = await this.eventRepo.findOne({
      where: { id: eventId, farmId, batchId },
    });
    if (!event) throw new NotFoundException('Événement sanitaire introuvable.');
    const alreadyApplied =
      (event.kind === HealthEventKind.REFORME ||
        event.kind === HealthEventKind.MORTALITE) &&
      event.quantity > 0;
    const photos = await this.photoRepo.find({
      where: { healthEventId: event.id },
    });
    // Photo rows go with the event (ON DELETE CASCADE); their files after.
    await this.eventRepo.remove(event);
    for (const p of photos) {
      await unlink(join(declarationPhotosDir(farmId), p.fileName)).catch(
        () => undefined,
      );
    }
    if (alreadyApplied) {
      await this.recomputeLiveCount(batchId);
      await this.batchesService.runAdvisoryForBatch(batchId);
    }
    return { deleted: true };
  }

  /** Active SIGNE_CLINIQUE codes only (the list of the veterinary services). */
  private async checkClinicalSigns(
    codes: string[] | undefined,
  ): Promise<string[]> {
    const wanted = [...new Set((codes ?? []).map((c) => c.trim()))].filter(
      (c) => c.length > 0,
    );
    if (wanted.length === 0) return [];
    const known = new Set(
      (await this.lists.list(ProgramListType.SIGNE_CLINIQUE)).map((i) => i.code),
    );
    const unknown = wanted.filter((c) => !known.has(c));
    if (unknown.length > 0) {
      throw new BadRequestException(
        `Signe(s) clinique(s) inconnu(s) ou désactivé(s) : ${unknown.join(', ')}.`,
      );
    }
    return wanted;
  }

  // ---------- Photos of a declaration ----------

  /**
   * Adds a photo to a declaration (multipart, after its text). PNG, JPEG or
   * WEBP checked on the file's own bytes; the same file sent again (offline
   * retry) returns the photo already stored.
   */
  async addPhoto(
    user: AuthUser,
    farmId: string,
    batchId: string,
    eventId: string,
    file: UploadedImageFile | undefined,
  ): Promise<HealthEventPhotoView> {
    const event = await this.assertEvent(user, farmId, batchId, eventId);
    if (!file) {
      throw new BadRequestException('Aucun fichier reçu (champ « file »).');
    }
    const extension = PHOTO_EXTENSIONS[file.mimetype];
    if (!extension) {
      throw new BadRequestException(
        'Format de photo non supporté. Utilisez un fichier PNG, JPEG ou WEBP.',
      );
    }
    if (file.size === 0 || file.buffer.length === 0) {
      throw new BadRequestException('La photo est vide.');
    }
    if (file.size > DECLARATION_PHOTO_MAX_BYTES) {
      throw new BadRequestException('Une photo ne doit pas dépasser 5 Mo.');
    }
    // The declared type comes from the client: check the bytes.
    if (!hasImageSignature(file.buffer, extension)) {
      throw new BadRequestException(
        'Le fichier n’est pas une image PNG, JPEG ou WEBP valide.',
      );
    }
    const sha256 = createHash('sha256').update(file.buffer).digest('hex');
    const same = await this.photoRepo.findOne({
      where: { healthEventId: event.id, sha256 },
    });
    if (same) return this.photoView(same);
    const count = await this.photoRepo.count({
      where: { healthEventId: event.id },
    });
    if (count >= DECLARATION_PHOTOS_MAX) {
      throw new BadRequestException(
        `${DECLARATION_PHOTOS_MAX} photos au plus par déclaration.`,
      );
    }
    const id = randomUUID();
    const fileName = `${id}.${extension}`;
    const dir = declarationPhotosDir(farmId);
    await mkdir(dir, { recursive: true });
    await writeFile(join(dir, fileName), file.buffer);
    try {
      const photo = await this.photoRepo.save(
        this.photoRepo.create({
          id,
          healthEventId: event.id,
          farmId,
          fileName,
          mimeType: extension === 'jpg' ? 'image/jpeg' : `image/${extension}`,
          sizeBytes: file.buffer.length,
          sha256,
          createdById: user.id,
        }),
      );
      return this.photoView(photo);
    } catch (err) {
      await unlink(join(dir, fileName)).catch(() => undefined);
      // Two uploads of the same file at once: the first one wins.
      const winner = await this.photoRepo.findOne({
        where: { healthEventId: event.id, sha256 },
      });
      if (winner) return this.photoView(winner);
      throw err;
    }
  }

  /** The photo's bytes, for the farm and the veterinary services only. */
  async photoFile(
    user: AuthUser,
    farmId: string,
    batchId: string,
    eventId: string,
    photoId: string,
  ): Promise<{ buffer: Buffer; mimeType: string; fileName: string }> {
    await this.assertEvent(user, farmId, batchId, eventId, true);
    const photo = await this.photoRepo.findOne({
      where: { id: photoId, healthEventId: eventId, farmId },
    });
    if (!photo) throw new NotFoundException('Photo introuvable.');
    const buffer = await readFile(
      join(declarationPhotosDir(farmId), photo.fileName),
    ).catch(() => null);
    if (!buffer) {
      throw new NotFoundException('Fichier de la photo introuvable.');
    }
    return { buffer, mimeType: photo.mimeType, fileName: photo.fileName };
  }

  async deletePhoto(
    user: AuthUser,
    farmId: string,
    batchId: string,
    eventId: string,
    photoId: string,
  ): Promise<{ deleted: boolean }> {
    await this.assertEvent(user, farmId, batchId, eventId);
    const photo = await this.photoRepo.findOne({
      where: { id: photoId, healthEventId: eventId, farmId },
    });
    if (!photo) throw new NotFoundException('Photo introuvable.');
    await this.photoRepo.remove(photo);
    await unlink(join(declarationPhotosDir(farmId), photo.fileName)).catch(
      () => undefined,
    );
    return { deleted: true };
  }

  /** Declaration rule, farm access and the event in that band. */
  private async assertEvent(
    user: AuthUser,
    farmId: string,
    batchId: string,
    eventId: string,
    readOnly = false,
  ): Promise<HealthEvent> {
    // Legal rule: declarations stay between the farm and the vets (reads:
    // also a profile granted SANITAIRE:CONSULTER, e.g. the agent technique).
    await (readOnly
      ? this.declarations.assertRead(user)
      : this.declarations.assert(user));
    await this.farmsService.assertAccessible(user, farmId);
    await this.assertBatchInFarm(farmId, batchId);
    const event = await this.eventRepo.findOne({
      where: { id: eventId, farmId, batchId },
    });
    if (!event) throw new NotFoundException('Événement sanitaire introuvable.');
    return event;
  }

  private photoView(p: HealthEventPhoto): HealthEventPhotoView {
    return {
      id: p.id,
      mimeType: p.mimeType,
      sizeBytes: p.sizeBytes,
      createdAt: p.createdAt,
    };
  }

  private async assertBatchInFarm(
    farmId: string,
    batchId: string,
  ): Promise<ProductionBatch> {
    const batch = await this.batchRepo.findOne({
      where: { id: batchId, farmId },
    });
    if (!batch) throw new NotFoundException('Lot introuvable dans cette ferme.');
    return batch;
  }

  /**
   * Rebuilds quantityAlive from every recorded loss (the event is already
   * saved/removed). Adding or subtracting the event quantity drifts once the
   * count was floored at 0 by an earlier reconciliation.
   */
  private async recomputeLiveCount(batchId: string): Promise<void> {
    await this.dataSource.transaction(async (em) => {
      await this.flockReconciliation.recomputeLiveCount(em, batchId);
      // POUFA band projection, same transaction.
      await this.bandeStats.refresh(em, batchId);
    });
  }

  private computeHealthScore(mortalityPercent: number, fcr: number | null): number {
    let score = 100;
    score -= Math.min(40, mortalityPercent * 4);
    if (fcr != null && fcr > 2.5) score -= Math.min(20, (fcr - 2.5) * 8);
    return Math.max(0, Math.round(score));
  }

  private buildTips(input: {
    metrics: BatchMetrics;
    breed: { targetFcr: number | null; actualFcr: number | null } | null;
    waterNormL: number;
    batchType: BatchType;
  }): TipItem[] {
    const tips: TipItem[] = [];
    const m = input.metrics;
    const mortality = m.mortalityPercent;
    const waterLPerBird = m.waterLPerBird;
    const fcr = m.fcr;

    if (waterLPerBird != null && waterLPerBird < input.waterNormL) {
      tips.push({
        level: AlertLevel.ROUGE,
        text: `Consommation d'eau faible (${round2(waterLPerBird)} L/oiseau/j vs ${input.waterNormL} L/j attendu) : vérifier les abreuvoirs et surveiller la mortalité.`,
      });
    }
    if (mortality > 5) {
      tips.push({
        level: AlertLevel.ROUGE,
        text: `Mortalité élevée (${round2(mortality)} %) : contacter un vétérinaire rapidement.`,
      });
    } else if (mortality > 1) {
      tips.push({
        level: AlertLevel.JAUNE,
        text: `Mortalité au-dessus de la normale (${round2(mortality)} %) : observer les sujets et l'ambiance du bâtiment.`,
      });
    }
    if (fcr != null && fcr > 2) {
      tips.push({
        level: AlertLevel.JAUNE,
        text: `Indice de consommation élevé (${round2(fcr)}) : revoir la ration et le gaspillage d'aliment.`,
      });
    }
    if (input.breed?.actualFcr != null && input.breed.targetFcr != null) {
      const dev =
        ((input.breed.actualFcr - input.breed.targetFcr) /
          input.breed.targetFcr) *
        100;
      if (dev > 10) {
        tips.push({
          level: AlertLevel.JAUNE,
          text: `IC ${round2(dev)} % au-dessus de la courbe de la souche (${input.breed.targetFcr}).`,
        });
      }
    }
    if (tips.length === 0) {
      tips.push({
        level: AlertLevel.VERT,
        text: 'Indicateurs dans les normes : maintenir la conduite actuelle.',
      });
    }
    return tips;
  }

  private buildTrends(
    entries: DailyEntry[],
    deathEvents: Array<{ date: string; quantity: number }>,
  ): {
    dates: string[];
    mortality: number[];
    eggs: number[];
  } {
    const dates: string[] = [];
    const mortality: number[] = [];
    const eggs: number[] = [];
    const start = addDaysIso(todayIso(), -6);
    for (let i = 0; i < 7; i++) {
      const day = addDaysIso(start, i);
      const e = entries.find((x) => x.entryDate === day);
      dates.push(day);
      // Daily-entry deaths + MORTALITE health events of that day.
      mortality.push(
        (e?.deaths ?? 0) +
          deathEvents
            .filter((d) => d.date === day)
            .reduce((s, d) => s + d.quantity, 0),
      );
      eggs.push(e?.eggsCollected ?? 0);
    }
    return { dates, mortality, eggs };
  }

  private buildInsights(input: {
    metrics: BatchMetrics;
    breed: {
      actualFcr: number | null;
      targetFcr: number | null;
      actualLayRatePercent: number | null;
      targetLayRatePercent: number | null;
      actualAvgWeightKg: number | null;
      targetAvgWeightKg: number | null;
    } | null;
  }): string[] {
    const insights: string[] = [];
    const m = input.metrics;
    const viability = m.viabilityPercent;
    const fcr = m.fcr;
    const layRate = m.layRatePercent;

    if (viability != null) {
      insights.push(
        `Viabilité actuelle : ${round2(viability)} % sur ${m.liveCount} oiseaux vivants.`,
      );
    }
    if (fcr != null) {
      insights.push(`Indice de consommation cumulé : ${round2(fcr)}.`);
    }
    if (input.breed?.actualLayRatePercent != null) {
      insights.push(
        `Taux de ponte ${round2(input.breed.actualLayRatePercent)} % vs cible de la souche ${input.breed.targetLayRatePercent ?? '—'} %.`,
      );
    }
    if (layRate != null && input.breed?.targetLayRatePercent != null) {
      const dev = layRate - input.breed.targetLayRatePercent;
      insights.push(
        dev >= 0
          ? `Ponte ${round2(dev)} pts au-dessus de la cible.`
          : `Ponte ${round2(Math.abs(dev))} pts sous la cible.`,
      );
    }
    if (insights.length === 0) {
      insights.push('Ajoutez des saisies journalières pour obtenir des analyses.');
    }
    return insights;
  }

  private buildAdvice(input: {
    metrics: BatchMetrics;
    breed: {
      actualAvgWeightKg: number | null;
      targetAvgWeightKg: number | null;
    } | null;
  }): string[] {
    const advice: string[] = [];
    const m = input.metrics;
    const mortality = m.mortalityPercent;

    if (mortality > 5) {
      advice.push(
        'Planifier une visite vétérinaire en urgence et isoler les sujets malades.',
      );
    } else if (mortality > 1) {
      advice.push('Renforcer la surveillance de la santé dans les prochains jours.');
    }
    if (input.breed?.actualAvgWeightKg != null && input.breed.targetAvgWeightKg != null) {
      const dev =
        ((input.breed.actualAvgWeightKg - input.breed.targetAvgWeightKg) /
          input.breed.targetAvgWeightKg) *
        100;
      if (dev > 10) {
        advice.push('Poids au-dessus de la courbe : surveiller la surcharge pondérale.');
      } else if (dev < -10) {
        advice.push("Poids sous la courbe : vérifier la ration et l'accès à l'aliment.");
      }
    }
    if (advice.length === 0) {
      advice.push('Aucune action corrective requise pour ce lot.');
    }
    return advice;
  }
}
