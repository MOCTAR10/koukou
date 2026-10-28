import { Injectable, Logger, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { FindOptionsWhere, In, IsNull, Repository } from 'typeorm';
import {
  AlertKind,
  AlertLevel,
  AlertStatus,
} from '../../common/enums/alert-level.enum.js';
import {
  AlertRaisedEvent,
  KOUKOU_EVENTS,
  koukouBus,
} from '../../common/utils/event-bus.js';
import { Alert } from './entities/alert.entity.js';

export interface AlertCandidate {
  kind: AlertKind;
  level: AlertLevel;
  message: string;
  recommendation?: string;
  context?: Record<string, unknown>;
}

export interface AlertsContext {
  farmId: string;
  batchId?: string | null;
  buildingId?: string | null;
  ruleId?: string | null;
}

@Injectable()
export class AlertsService {
  private readonly logger = new Logger(AlertsService.name);

  constructor(
    @InjectRepository(Alert)
    private readonly alertRepo: Repository<Alert>,
  ) {}

  /**
   * Soulève (met à jour s'il existe encore) une alerte active.
   * La déduplication se fait sur (ferme + type + lot OU bâtiment) de façon à
   * ne garder qu'une alerte active par risque, tout en préservant l'historique
   * des alertes résolues.
   */
  async raise(
    candidate: AlertCandidate,
    ctx: AlertsContext,
    opts: {
      /**
       * Periodic re-evaluations: leave an ACQUITTEE alert alone while its
       * context is unchanged, so the farmer's acknowledgement isn't undone
       * on every pass. A changed context (new risk) reactivates it.
       */
      keepAcknowledgedIfUnchanged?: boolean;
    } = {},
  ): Promise<Alert> {
    const where: FindOptionsWhere<Alert> = {
      farmId: ctx.farmId,
      kind: candidate.kind,
      // Une alerte ACQUITTEE est réactivée si le risque persiste (au lieu de
      // créer un doublon) : l'acquittement est un accusé de lecture, pas une
      // extinction du risque.
      status: In([AlertStatus.ACTIVE, AlertStatus.ACQUITTEE]),
    };
    if (ctx.buildingId) {
      where.buildingId = ctx.buildingId;
    } else if (ctx.batchId) {
      where.batchId = ctx.batchId;
      where.buildingId = IsNull();
    } else {
      where.batchId = IsNull();
      where.buildingId = IsNull();
    }
    const existing = await this.alertRepo.findOne({ where });
    if (
      existing &&
      opts.keepAcknowledgedIfUnchanged &&
      existing.status === AlertStatus.ACQUITTEE &&
      JSON.stringify(existing.context ?? null) ===
        JSON.stringify(candidate.context ?? null)
    ) {
      return existing;
    }
    if (existing) {
      const escalated =
        existing.level !== AlertLevel.ROUGE &&
        candidate.level === AlertLevel.ROUGE;
      existing.status = AlertStatus.ACTIVE;
      existing.resolvedAt = null;
      existing.level = candidate.level;
      existing.message = candidate.message;
      existing.recommendation = candidate.recommendation ?? null;
      existing.context = candidate.context ?? null;
      const saved = await this.alertRepo.save(existing);
      if (escalated) this.emitRaised(saved);
      return saved;
    }
    // L'alerte est scoped bâtiment : on stocke batchId null pour que la
    // déduplication et le clearKind (batchId IsNull) restent cohérents.
    const rowBatchId = ctx.buildingId ? null : (ctx.batchId ?? null);
    const alert = this.alertRepo.create({
      farmId: ctx.farmId,
      batchId: rowBatchId,
      buildingId: ctx.buildingId ?? null,
      ruleId: ctx.ruleId ?? null,
      kind: candidate.kind,
      level: candidate.level,
      status: AlertStatus.ACTIVE,
      message: candidate.message,
      recommendation: candidate.recommendation ?? null,
      context: candidate.context ?? null,
    });
    const saved = await this.alertRepo.save(alert);
    if (saved.level === AlertLevel.ROUGE) this.emitRaised(saved);
    return saved;
  }

  /**
   * Push trigger: only a new red alert or an escalation to red. Periodic
   * re-evaluations that merely refresh an existing alert stay silent.
   */
  private emitRaised(alert: Alert): void {
    const event: AlertRaisedEvent = {
      farmId: alert.farmId,
      alertId: alert.id,
      kind: alert.kind,
      message: alert.message,
    };
    koukouBus.emit(KOUKOU_EVENTS.ALERT_RAISED, event);
  }

  /** Marque l'alerte active correspondante comme résolue (fin du risque). */
  async clearKind(
    farmId: string,
    batchId: string | null,
    kind: AlertKind,
    buildingId?: string | null,
  ): Promise<void> {
    const where: FindOptionsWhere<Alert> = {
      farmId,
      kind,
      status: In([AlertStatus.ACTIVE, AlertStatus.ACQUITTEE]),
    };
    if (buildingId) {
      where.buildingId = buildingId;
    } else if (batchId) {
      where.batchId = batchId;
      where.buildingId = IsNull();
    } else {
      where.batchId = IsNull();
      where.buildingId = IsNull();
    }
    await this.alertRepo.update(where, {
      status: AlertStatus.RESOLUE,
      resolvedAt: new Date(),
    });
  }

  /** Marquage manuel : le fermier reconnaît avoir vu l'alerte (ACQUITTEE). */
  async acknowledge(farmId: string, alertId: string): Promise<Alert> {
    const alert = await this.alertRepo.findOne({
      where: { id: alertId, farmId },
    });
    if (!alert)
      throw new NotFoundException('Alerte introuvable dans cette ferme.');
    if (alert.status === AlertStatus.ACTIVE) {
      alert.status = AlertStatus.ACQUITTEE;
      await this.alertRepo.save(alert);
    }
    return alert;
  }

  async listForFarm(farmId: string, status?: AlertStatus): Promise<Alert[]> {
    const where: Record<string, unknown> = { farmId };
    if (status) where.status = status;
    return this.alertRepo.find({ where, order: { createdAt: 'DESC' } });
  }

  /** Historique COMPLET (actives + acquittées + résolues) pour les rapports 360°. */
  async historyForFarm(farmId: string): Promise<Alert[]> {
    return this.alertRepo.find({
      where: { farmId },
      order: { createdAt: 'DESC' },
    });
  }
}
