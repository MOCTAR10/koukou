import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { In, Repository } from 'typeorm';
import { AuthUser } from '../../common/decorators/current-user.decorator.js';
import {
  AlertKind,
  AlertLevel,
  AlertStatus,
} from '../../common/enums/alert-level.enum.js';
import { BatchStatus } from '../../common/enums/batch-type.enum.js';
import { ProphylaxisStatus } from '../../common/enums/prophylaxis-status.enum.js';
import { ReferenceKey } from '../../common/enums/reference-key.enum.js';
import { Alert } from '../alerts/entities/alert.entity.js';
import { Building } from '../buildings/entities/building.entity.js';
import { ProductionBatch } from '../batches/entities/production-batch.entity.js';
import { DailyEntry } from '../daily-entries/entities/daily-entry.entity.js';
import { FarmsService } from '../farms/farms.service.js';
import { FeedStockService } from '../feed-stock/feed-stock.service.js';
import { ReferenceConstantsService } from '../reference-constants/reference-constants.service.js';
import { ProphylaxisEvent } from '../sanitary/entities/prophylaxis-event.entity.js';
import { MetricsService } from '../batches/metrics.service.js';

export type NextActionCategory =
  | 'ALERTE'
  | 'SAISIE'
  | 'SOIN'
  | 'STOCK_PROVENDE'
  | 'VENTE';

export interface NextAction {
  id: string;
  category: NextActionCategory;
  level: AlertLevel;
  title: string;
  description: string | null;
  dueDate: string | null;
  batchId: string | null;
  batchName: string | null;
  buildingId: string | null;
  acknowledged: boolean;
  alertId: string | null;
  /** Kind réel pour les actions dérivées d'une alerte stockée ; null sinon. */
  kind?: AlertKind | null;
  /** Statut : celui de l'alerte stockée (ACTIVE/ACQUITTEE), ACTIVE pour les actions dérivées. */
  status: AlertStatus;
}

export interface AdvisoryNextActions {
  farmId: string;
  generatedAt: string;
  summary: { total: number; rouge: number; jaune: number; vert: number };
  actions: NextAction[];
}

const LEVEL_ORDER: Record<AlertLevel, number> = {
  [AlertLevel.ROUGE]: 0,
  [AlertLevel.JAUNE]: 1,
  [AlertLevel.VERT]: 2,
};

function todayStr(): string {
  return new Date().toISOString().slice(0, 10);
}

function addDaysIso(date: string, days: number): string {
  const d = new Date(`${date}T12:00:00Z`);
  d.setUTCDate(d.getUTCDate() + days);
  return d.toISOString().slice(0, 10);
}

/** Kinds repris ci-dessous sous une forme plus actionnable (pas de doublon). */
const RE_EXPRESSED = new Set<AlertKind>([
  AlertKind.SAISIE_MANQUEE,
  AlertKind.ALIMENT,
  AlertKind.PROPHYLAXIE,
]);

@Injectable()
export class AdvisoryService {
  constructor(
    @InjectRepository(Alert)
    private readonly alertRepo: Repository<Alert>,
    @InjectRepository(ProductionBatch)
    private readonly batchRepo: Repository<ProductionBatch>,
    @InjectRepository(DailyEntry)
    private readonly entryRepo: Repository<DailyEntry>,
    @InjectRepository(ProphylaxisEvent)
    private readonly eventRepo: Repository<ProphylaxisEvent>,
    @InjectRepository(Building)
    private readonly buildingRepo: Repository<Building>,
    private readonly farmsService: FarmsService,
    private readonly feedStockService: FeedStockService,
    private readonly constants: ReferenceConstantsService,
    private readonly metrics: MetricsService,
  ) {}

  /**
   * Actions prioritaires du jour : agrège les alertes actives (hors pouvant s'y
   * traduire en action granulaire), les saisies journalières manquantes, les
   * soins prophylactiques à venir/en retard, l'état du stock de provende et les
   * lots en vente. Tri ROUGE → JAUNE, puis par échéance croissante.
   * Lecture seule — philosophical advisory (jamais bloquant).
   */
  async composeNextActions(
    user: AuthUser,
    farmId: string,
  ): Promise<AdvisoryNextActions> {
    await this.farmsService.assertAccessible(user, farmId);

    // Lazy-eval de l'alerte ALIMENT (la lecture force l'évaluation avant la
    // collecte des alertes — sinon on risquerait des données périmées).
    const feedSummary = await this.feedStockService.getStockSummary(
      user,
      farmId,
    );

    const today = todayStr();
    const [leadDays, warnDays, criticalDays] = await Promise.all([
      this.constants.get(ReferenceKey.CALENDAR_LEAD_DAYS, 1),
      this.constants.get(ReferenceKey.FEED_STOCK_WARN_DAYS, 5),
      this.constants.get(ReferenceKey.FEED_STOCK_CRITICAL_DAYS, 3),
    ]);

    const [batches, buildings, alerts, events] = await Promise.all([
      this.batchRepo.find({ where: { farmId } }),
      this.buildingRepo.find({ where: { farmId } }),
      this.alertRepo.find({
        where: {
          farmId,
          status: In([AlertStatus.ACTIVE, AlertStatus.ACQUITTEE]),
        },
      }),
      this.eventRepo.find({
        where: { farmId },
        order: { scheduledDate: 'ASC' },
      }),
    ]);

    const batchName = new Map(batches.map((b) => [b.id, b.batchName]));
    const buildingName = new Map(buildings.map((b) => [b.id, b.name]));

    const actions: NextAction[] = [];

    // 1) Alertes actives (hors kinds re-exprimés plus bas sous forme granulaire).
    for (const a of alerts) {
      if (RE_EXPRESSED.has(a.kind)) continue;
      const name = a.buildingId
        ? buildingName.get(a.buildingId)
        : a.batchId
          ? batchName.get(a.batchId)
          : null;
      actions.push({
        id: `alert:${a.id}`,
        category: 'ALERTE',
        level: a.level,
        title: a.message,
        description: a.recommendation,
        dueDate: null,
        batchId: a.batchId,
        batchName: name ?? null,
        buildingId: a.buildingId,
        acknowledged: a.status === AlertStatus.ACQUITTEE,
        alertId: a.id,
        kind: a.kind,
        status: a.status,
      });
    }

    // 2) Saisie journalière du jour manquante (une action par lot en cours).
    const todayRows = await this.entryRepo.find({
      where: { batchId: In(batches.map((b) => b.id)), entryDate: today },
    });
    const haveEntry = new Set(todayRows.map((e) => e.batchId));
    for (const b of batches) {
      if (b.status === BatchStatus.CLOTURE) continue;
      if (haveEntry.has(b.id)) continue;
      actions.push({
        id: `entry:${b.id}:${today}`,
        category: 'SAISIE',
        level: AlertLevel.JAUNE,
        title: `Saisie du jour manquante — ${b.batchName ?? `Lot #${b.id.slice(0, 8)}`}`,
        description:
          'Enregistrer les données du jour (morts, aliments, ponte, poids) pour garder le suivi à jour.',
        dueDate: today,
        batchId: b.id,
        batchName: b.batchName,
        buildingId: b.buildingId,
        acknowledged: false,
        alertId: null,
        status: AlertStatus.ACTIVE,
      });
    }

    // 3) Soins prophylactiques planifiés / en retard (fenêtre de prévenance).
    const horizon = addDaysIso(today, leadDays);
    for (const ev of events) {
      if (![ProphylaxisStatus.PLANIFIE, ProphylaxisStatus.EN_RETARD].includes(
        ev.status,
      )) {
        continue;
      }
      if (ev.scheduledDate > horizon) continue;
      const overdue = ev.status === ProphylaxisStatus.EN_RETARD;
      actions.push({
        id: `care:${ev.id}`,
        category: 'SOIN',
        level: overdue ? AlertLevel.ROUGE : AlertLevel.JAUNE,
        title: `${overdue ? 'Soin en retard' : 'Soin à venir'} : ${ev.name}${ev.route ? ` (${ev.route})` : ''}`,
        description: `Lot ${batchName.get(ev.batchId) ?? `#${ev.batchId.slice(0, 8)}`} — planifié le ${ev.scheduledDate}.`,
        dueDate: ev.scheduledDate,
        batchId: ev.batchId,
        batchName: batchName.get(ev.batchId) ?? null,
        buildingId: ev.buildingId,
        acknowledged: false,
        alertId: null,
        status: AlertStatus.ACTIVE,
      });
    }

    // 4) Réapprovisionnement provende (autonomie basse).
    const assessable = feedSummary.byType.filter((t) => t.autonomyDays != null);
    if (assessable.length > 0) {
      const critical = assessable
        .filter((t) => t.autonomyDays! < criticalDays)
        .sort((a, b) => a.autonomyDays! - b.autonomyDays!);
      const warning = assessable
        .filter(
          (t) =>
            t.autonomyDays! < warnDays &&
            !critical.some((c) => c.foodType === t.foodType),
        )
        .sort((a, b) => a.autonomyDays! - b.autonomyDays!);
      const list = (rows: typeof critical) =>
        rows
          .map((t) => `${t.foodType} (${t.autonomyDays} j)`)
          .join(', ');
      if (critical.length > 0) {
        actions.push({
          id: `feed:${today}`,
          category: 'STOCK_PROVENDE',
          level: AlertLevel.ROUGE,
          title: `Stock de provende critique : ${list(critical)}`,
          description: `Autonomie sous ${criticalDays} jours de consommation théorique — commander immédiatement pour éviter une rupture d'alimentation du lot.`,
          dueDate: today,
          batchId: null,
          batchName: null,
          buildingId: null,
          acknowledged: false,
          alertId: null,
          status: AlertStatus.ACTIVE,
        });
      } else if (warning.length > 0) {
        actions.push({
          id: `feed:${today}`,
          category: 'STOCK_PROVENDE',
          level: AlertLevel.JAUNE,
          title: `Stock de provende faible : ${list(warning)}`,
          description: `Autonomie sous ${warnDays} jours — anticiper une commande pour ne pas atteindre le seuil critique de ${criticalDays} jours.`,
          dueDate: addDaysIso(today, 1),
          batchId: null,
          batchName: null,
          buildingId: null,
          acknowledged: false,
          alertId: null,
          status: AlertStatus.ACTIVE,
        });
      }
    }

    // 5) Lots en vente (écoulement à relancer).
    for (const b of batches) {
      if (b.status !== BatchStatus.EN_VENTE || b.quantityAlive <= 0) continue;
      actions.push({
        id: `sale:${b.id}`,
        category: 'VENTE',
        level: AlertLevel.JAUNE,
        title: `${b.batchName ?? `Lot #${b.id.slice(0, 8)}`} en vente — ${b.quantityAlive} oiseaux restants`,
        description:
          'Relancer l’écoulement (marché, clients, POS) pour éviter l’invendu et la péremption du poids.',
        dueDate: today,
        batchId: b.id,
        batchName: b.batchName,
        buildingId: b.buildingId,
        acknowledged: false,
        alertId: null,
        status: AlertStatus.ACTIVE,
      });
    }

    // 6) Lots actifs « prêts à vendre » d'après les métriques (auto-signal).
    const readyBatches = batches.filter(
      (b) => b.status === BatchStatus.ACTIF && b.quantityAlive > 0,
    );
    const readyResults = await Promise.all(
      readyBatches.map(async (b) => {
        const m = await this.metrics.compute(b);
        return { batch: b, readyForSale: m.readyForSale };
      }),
    );
    for (const { batch: b, readyForSale } of readyResults) {
      if (!readyForSale) continue;
      actions.push({
        id: `ready:${b.id}`,
        category: 'VENTE',
        level: AlertLevel.VERT,
        title: `${b.batchName ?? `Lot #${b.id.slice(0, 8)}`} prêt à vendre — ${b.quantityAlive} oiseaux`,
        description:
          'Lot commercialisable d’après l’âge et la performance (IC/mortalité) : passer en vente ou créer une précommande.',
        dueDate: today,
        batchId: b.id,
        batchName: b.batchName,
        buildingId: b.buildingId,
        acknowledged: false,
        alertId: null,
        status: AlertStatus.ACTIVE,
      });
    }

    actions.sort(
      (x, y) =>
        LEVEL_ORDER[x.level] - LEVEL_ORDER[y.level] ||
        (x.dueDate ?? '9999').localeCompare(y.dueDate ?? '9999') ||
        x.title.localeCompare(y.title),
    );

    const summary = actions.reduce(
      (acc, a) => {
        acc[a.level.toLowerCase() as 'rouge' | 'jaune' | 'vert'] += 1;
        return acc;
      },
      { total: actions.length, rouge: 0, jaune: 0, vert: 0 },
    );

    return {
      farmId,
      generatedAt: new Date().toISOString(),
      summary,
      actions,
    };
  }
}