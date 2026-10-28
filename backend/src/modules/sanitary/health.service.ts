import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository, DataSource } from 'typeorm';
import type { AuthUser } from '../../common/decorators/current-user.decorator.js';
import { AlertLevel } from '../../common/enums/alert-level.enum.js';
import { DiseaseSeverity } from '../../common/enums/disease-severity.enum.js';
import { ReferenceKey } from '../../common/enums/reference-key.enum.js';
import { BatchType } from '../../common/enums/batch-type.enum.js';
import { FarmsService } from '../farms/farms.service.js';
import { ReferenceConstantsService } from '../reference-constants/reference-constants.service.js';
import { MetricsService } from '../batches/metrics.service.js';
import type { BatchMetrics } from '../batches/models/batch-metrics.model.js';
import { ProductionBatch } from '../batches/entities/production-batch.entity.js';
import { DailyEntry } from '../daily-entries/entities/daily-entry.entity.js';
import { HealthEvent } from './entities/health-event.entity.js';
import { HealthEventKind } from '../../common/enums/health-event-kind.enum.js';
import { HealthEventStatus } from '../../common/enums/health-event-status.enum.js';
import { CreateHealthEventDto } from './dto/create-health-event.dto.js';

const EGGS_PER_TRAY = 30;
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
  ) {}

  async getHealth(user: AuthUser, farmId: string, batchId: string) {
    await this.farmsService.assertAccessible(user, farmId);
    const batch = await this.assertBatchInFarm(farmId, batchId);
    const [m, breed, entries] = await Promise.all([
      this.metrics.compute(batch),
      this.metrics.breedStatus(batch),
      this.entriesRepo.find({
        where: { batchId: batch.id },
        order: { entryDate: 'ASC' },
      }),
    ]);

    const waterNormL =
      (await this.constants.get(ReferenceKey.WATER_PER_BIRD_L_DAY, 0.2)) ?? 0.2;

    const trays = m.eggBreakdown.sellable > 0
      ? Math.floor(m.eggBreakdown.sellable / EGGS_PER_TRAY)
      : 0;
    const feedPerBirdGrams =
      m.liveCount > 0 ? (m.totalFeedKg * 1000) / m.liveCount : 0;

    const healthScore = this.computeHealthScore(m.mortalityPercent, m.fcr);
    const tips = this.buildTips({
      metrics: m,
      breed,
      waterNormL,
      batchType: batch.type,
    });

      const trends = this.buildTrends(entries);

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
  ): Promise<HealthEvent[]> {
    await this.farmsService.assertAccessible(user, farmId);
    await this.assertBatchInFarm(farmId, batchId);
    return this.eventRepo.find({
      where: { farmId, batchId },
      order: { occurredAt: 'DESC', createdAt: 'DESC' },
    });
  }

  async createEvent(
    user: AuthUser,
    farmId: string,
    batchId: string,
    dto: CreateHealthEventDto,
  ): Promise<HealthEvent> {
    await this.farmsService.assertAccessible(user, farmId);
    const batch = await this.assertBatchInFarm(farmId, batchId);
    const quantity = dto.quantity ?? 0;

    if (!dto.severity && !dto.diseaseSeverity) {
      throw new BadRequestException('La gravité (ou la sévérité de la maladie) est requise.');
    }

    if (
      (dto.kind === HealthEventKind.REFORME ||
        dto.kind === HealthEventKind.MORTALITE) &&
      quantity > 0
    ) {
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
    });
    const saved = await this.eventRepo.save(event);

    if (
      (dto.kind === HealthEventKind.REFORME ||
        dto.kind === HealthEventKind.MORTALITE) &&
      quantity > 0
    ) {
      await this.applyCulling(farmId, batchId, quantity);
    }

    return saved;
  }

  async resolveEvent(
    user: AuthUser,
    farmId: string,
    batchId: string,
    eventId: string,
  ): Promise<HealthEvent> {
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
    await this.eventRepo.remove(event);
    if (alreadyApplied) {
      await this.restoreCulling(farmId, batchId, event.quantity);
    }
    return { deleted: true };
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

  private async applyCulling(
    farmId: string,
    batchId: string,
    quantity: number,
  ): Promise<void> {
    await this.dataSource.transaction(async (em) => {
      const batch = await em
        .getRepository(ProductionBatch)
        .createQueryBuilder('batch')
        .setLock('pessimistic_write')
        .where('batch.id = :id', { id: batchId })
        .andWhere('batch.farmId = :farmId', { farmId })
        .getOne();
      if (!batch) return;
      batch.quantityAlive = Math.max(0, batch.quantityAlive - quantity);
      await em.getRepository(ProductionBatch).save(batch);
    });
  }

  private async restoreCulling(
    farmId: string,
    batchId: string,
    quantity: number,
  ): Promise<void> {
    await this.dataSource.transaction(async (em) => {
      const batch = await em
        .getRepository(ProductionBatch)
        .createQueryBuilder('batch')
        .setLock('pessimistic_write')
        .where('batch.id = :id', { id: batchId })
        .andWhere('batch.farmId = :farmId', { farmId })
        .getOne();
      if (!batch) return;
      batch.quantityAlive += quantity;
      await em.getRepository(ProductionBatch).save(batch);
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
      mortality.push(e?.deaths ?? 0);
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
