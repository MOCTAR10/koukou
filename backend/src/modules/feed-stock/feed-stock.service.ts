import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import {
  EntityManager,
  In,
  IsNull,
  MoreThanOrEqual,
  Repository,
} from 'typeorm';
import { AuthUser } from '../../common/decorators/current-user.decorator.js';
import { AlertKind, AlertLevel } from '../../common/enums/alert-level.enum.js';
import { FoodType } from '../../common/enums/food-type.enum.js';
import { FeedEntryType } from '../../common/enums/feed-entry-type.enum.js';
import { FeedPhase } from '../../common/enums/feed-phase.enum.js';
import { InputKind } from '../../common/enums/input-kind.enum.js';
import { ReferenceKey } from '../../common/enums/reference-key.enum.js';
import { FarmsService } from '../farms/farms.service.js';
import { AlertsService } from '../alerts/alerts.service.js';
import { ReferenceConstantsService } from '../reference-constants/reference-constants.service.js';
import { Farm } from '../farms/entities/farm.entity.js';
import { ProductionBatch } from '../batches/entities/production-batch.entity.js';
import { InputLot } from '../inputs/entities/input-lot.entity.js';
import { DailyEntry } from '../daily-entries/entities/daily-entry.entity.js';
import { CreateLossDto } from './dto/create-loss.dto.js';
import {
  FeedStockLoss,
  computeLossKg,
} from './entities/feed-stock-loss.entity.js';
import { FeedStockSale } from './entities/feed-stock-sale.entity.js';
import { FeedUnit } from '../../common/enums/food-type.enum.js';
import { createOnce } from '../../common/utils/idempotency.js';

const CONSUMPTION_WINDOW_DAYS = 3;

function todayStr(): string {
  return new Date().toISOString().slice(0, 10);
}

function daysAgoStr(n: number): string {
  const d = new Date();
  d.setUTCDate(d.getUTCDate() - n);
  return d.toISOString().slice(0, 10);
}

function round(value: number, decimals: number): number {
  const factor = 10 ** decimals;
  return Math.round(value * factor) / factor;
}

const TYPE_LABELS: Record<string, string> = {
  POUSSIN: 'Poussin',
  DEMARRAGE: 'Démarrage',
  CROISSANCE: 'Croissance',
  PRE_PONTE: 'Pré-ponte',
  PONTE_PHASE_1: 'Ponte 1',
  PONTE_PHASE_2: 'Ponte 2',
  PONTE_PHASE_3: 'Ponte 3',
  FINITION: 'Finition',
  PERSONNALISE: 'Personnalisé',
};

/** Phase par défaut pour les anciennes lignes (`foodType` seul, sans `feedPhase`). */
const FOOD_TYPE_TO_FEED_PHASE: Record<string, FeedPhase> = {
  POUSSIN: FeedPhase.POUSSIN,
  DEMARRAGE: FeedPhase.DEMARRAGE,
  CROISSANCE: FeedPhase.CROISSANCE,
  PONTE: FeedPhase.PONTE_PHASE_1,
  FINITION: FeedPhase.FINITION,
};

export function feedPhaseKeyOf(lot: {
  feedPhase: FeedPhase | null;
  foodType: FoodType | null;
}): FeedPhase | null {
  if (lot.feedPhase != null) return lot.feedPhase;
  if (lot.foodType != null)
    return FOOD_TYPE_TO_FEED_PHASE[lot.foodType] ?? null;
  return null;
}

/** Phase effective d'une saisie journalière (feedPhase → legacy foodType). */
export function entryPhaseKeyOf(entry: {
  feedPhase: FeedPhase | null | undefined;
  feedType: FoodType | null | undefined;
}): FeedPhase | null {
  if (entry.feedPhase != null) return entry.feedPhase;
  if (entry.feedType != null)
    return FOOD_TYPE_TO_FEED_PHASE[entry.feedType] ?? null;
  return null;
}

/** Types d'entrée qui représentent de l'aliment consommable (kg) — pas les médicaments/matières premières. */
const FEED_KG_ENTRY_TYPES: FeedEntryType[] = [
  FeedEntryType.BULKER,
  FeedEntryType.BAG,
  FeedEntryType.MATIERE_PREMIERE,
];

export interface FeedTypeStock {
  feedPhase: FeedPhase;
  foodType: FoodType | null;
  receivedKg: number;
  usedKg: number;
  lostKg: number;
  soldKg: number;
  availableKg: number;
  autonomyDays: number | null;
  status: AlertLevel;
  suggestedLotId: string | null;
  suggestedLotName: string | null;
}

export interface FeedLotStock {
  id: string;
  productName: string;
  supplier: string;
  supplierLotNumber: string;
  batchId: string | null;
  entryType: FeedEntryType;
  feedPhase: FeedPhase | null;
  customFeedPhaseName: string | null;
  productId: string | null;
  foodType: FoodType | null;
  receivedDate: string;
  expirationDate: string | null;
  quantity: number;
  unit: string | null;
  receivedKg: number;
  usedKg: number;
  lostKg: number;
  soldKg: number;
  availableKg: number;
  expired: boolean;
}

export interface RecordFeedSaleInput {
  farmId: string;
  inputLotId: string | null;
  batchId?: string | null;
  saleItemId: string | null;
  quantity: number;
  unit: FeedUnit;
  soldAt?: string;
  createdById: string | null;
}

interface ComputedStock {
  lots: FeedLotStock[];
  byType: FeedTypeStock[];
}

@Injectable()
export class FeedStockService {
  constructor(
    @InjectRepository(InputLot)
    private readonly inputRepo: Repository<InputLot>,
    @InjectRepository(DailyEntry)
    private readonly entryRepo: Repository<DailyEntry>,
    @InjectRepository(FeedStockLoss)
    private readonly lossRepo: Repository<FeedStockLoss>,
    @InjectRepository(FeedStockSale)
    private readonly saleRepo: Repository<FeedStockSale>,
    @InjectRepository(Farm)
    private readonly farmRepo: Repository<Farm>,
    @InjectRepository(ProductionBatch)
    private readonly batchRepo: Repository<ProductionBatch>,
    private readonly farmsService: FarmsService,
    private readonly alertsService: AlertsService,
    private readonly constants: ReferenceConstantsService,
  ) {}

  // ---------- Lecture du stock (dashboard) ----------

  async getStockSummary(user: AuthUser, farmId: string) {
    await this.farmsService.assertAccessible(user, farmId);
    await this.evaluateStockAlerts(farmId);
    const [criticalDays, warnDays] = await Promise.all([
      this.constants.get(ReferenceKey.FEED_STOCK_CRITICAL_DAYS, 3),
      this.constants.get(ReferenceKey.FEED_STOCK_WARN_DAYS, 5),
    ]);
    const stock = await this.computeFeedStock(farmId, criticalDays, warnDays);
    const losses = await this.lossRepo.find({
      where: { farmId },
      order: { occurredAt: 'DESC', createdAt: 'DESC' },
    });
    return {
      byType: stock.byType,
      lots: stock.lots,
      losses,
    };
  }

  async listLosses(user: AuthUser, farmId: string): Promise<FeedStockLoss[]> {
    await this.farmsService.assertAccessible(user, farmId);
    return this.lossRepo.find({
      where: { farmId },
      order: { occurredAt: 'DESC', createdAt: 'DESC' },
    });
  }

  // ---------- Suivi des pertes (sacs gâtés) ----------

  async recordLoss(
    user: AuthUser,
    farmId: string,
    dto: CreateLossDto,
  ): Promise<FeedStockLoss> {
    const farm = await this.farmsService.assertAccessible(user, farmId);
    const lot = await this.inputRepo.findOne({
      where: { id: dto.inputLotId, farmId },
    });
    if (!lot || lot.kind !== InputKind.ALIMENT) {
      throw new BadRequestException(
        'Lot d’intrant alimentaire introuvable dans cette ferme (catégorie ALIMENT uniquement).',
      );
    }

    const sacKg = farm.defaultSacKg ?? 50;
    const quantityKg = computeLossKg(dto.quantity, dto.unit, sacKg);
    if (!(quantityKg > 0)) {
      throw new BadRequestException('La quantité perdue doit être positive.');
    }

    // A loss cannot exceed what the lot still holds (stock never negative).
    // Offline replay with the same key returns the loss already recorded.
    const loss = await createOnce(
      this.lossRepo,
      farmId,
      dto.idempotencyKey,
      () =>
        this.lossRepo.manager.transaction(async (em) => {
          await em.getRepository(InputLot).findOne({
            where: { id: lot.id },
            lock: { mode: 'pessimistic_write' },
          });
          const availableKg = await this.availableKgOf(lot.id, sacKg, em);
          if (quantityKg > availableKg + 1e-6) {
            throw new BadRequestException(
              `Perte supérieure au stock du lot : disponible ${round(availableKg, 2)} kg, perte déclarée ${round(quantityKg, 2)} kg.`,
            );
          }
          const repo = em.getRepository(FeedStockLoss);
          return repo.save(
            repo.create({
              idempotencyKey: dto.idempotencyKey ?? null,
              farmId,
              inputLotId: lot.id,
              batchId: lot.batchId,
              quantityKg,
              reason: dto.reason,
              occurredAt: dto.occurredAt ?? todayStr(),
              notes: dto.notes ?? null,
              createdById: user.id,
            }),
          );
        }),
    );
    await this.evaluateStockAlerts(farmId);
    return loss;
  }

  // ---------- Ventes de provende (intégration POS) ----------

  /**
   * Enregistre une vente d'aliment (provende) déclenchée par un point de vente.
   * Convertit la quantité (SAC → kg via `farm.defaultSacKg`). Si `em` est fourni
   * (transaction POS), l'écriture se fait dans cette transaction (validité
   * atomique) ; le rafraîchissement des alertes stock est alors à la charge de
   * l'appelant après commit.
   */
  async recordFeedSale(
    input: RecordFeedSaleInput & { em?: EntityManager },
  ): Promise<FeedStockSale> {
    const manager = input.em;
    const farmRepo = manager ? manager.getRepository(Farm) : this.farmRepo;
    const inputRepo = manager
      ? manager.getRepository(InputLot)
      : this.inputRepo;
    const saleRepo = manager
      ? manager.getRepository(FeedStockSale)
      : this.saleRepo;

    const farm = await farmRepo.findOne({ where: { id: input.farmId } });
    if (!farm) throw new NotFoundException('Ferme introuvable.');

    let lot: InputLot | null = null;
    if (input.inputLotId != null) {
      lot = await inputRepo.findOne({
        where: { id: input.inputLotId, farmId: input.farmId },
      });
      if (!lot || lot.kind !== InputKind.ALIMENT) {
        throw new BadRequestException(
          'Lot d’intrant alimentaire introuvable dans cette ferme (catégorie ALIMENT uniquement).',
        );
      }
    }

    const quantityKg =
      (input.unit ?? FeedUnit.SAC) === FeedUnit.SAC
        ? input.quantity * (farm.defaultSacKg ?? 50)
        : input.quantity;

    if (lot) {
      await this.assertFeedStockAvailable(
        input.em,
        lot.id,
        quantityKg,
        farm.defaultSacKg ?? 50,
      );
    }

    const sale = await saleRepo.save(
      saleRepo.create({
        farmId: input.farmId,
        inputLotId: input.inputLotId,
        batchId: input.batchId ?? lot?.batchId ?? null,
        saleItemId: input.saleItemId,
        quantityKg,
        soldAt: input.soldAt ?? todayStr(),
        createdById: input.createdById,
      }),
    );
    if (!manager) await this.evaluateStockAlerts(input.farmId);
    return sale;
  }

  /** Annule une vente de provende (retour au stock décrémenté). */
  async revertFeedSale(saleItemId: string, em?: EntityManager): Promise<void> {
    const repo = em ? em.getRepository(FeedStockSale) : this.saleRepo;
    await repo.delete({ saleItemId });
  }

  /** Contrôle de disponibilité (réception − conso − pertes − ventes) avant vente POS. */
  private async assertFeedStockAvailable(
    em: EntityManager | undefined,
    inputLotId: string,
    quantityKg: number,
    sacKg: number,
  ): Promise<void> {
    // Row lock inside the caller's transaction: two tills selling the last
    // sacks of a lot must not both see them available.
    const lot = em
      ? await em.getRepository(InputLot).findOne({
          where: { id: inputLotId },
          lock: { mode: 'pessimistic_write' },
        })
      : await this.inputRepo.findOne({ where: { id: inputLotId } });
    if (!lot || lot.kind !== InputKind.ALIMENT) {
      throw new BadRequestException(
        'Lot d’intrant alimentaire introuvable dans cette ferme (catégorie ALIMENT uniquement).',
      );
    }
    const entryRepo = em ? em.getRepository(DailyEntry) : this.entryRepo;
    const lossRepo = em ? em.getRepository(FeedStockLoss) : this.lossRepo;
    const saleRepo2 = em ? em.getRepository(FeedStockSale) : this.saleRepo;

    const [entries, losses, feedSales] = await Promise.all([
      entryRepo.find({ where: { inputLotId } }),
      lossRepo.find({ where: { inputLotId } }),
      saleRepo2.find({ where: { inputLotId } }),
    ]);
    const receivedKg =
      (lot.unit === 'KG' ? lot.quantity : lot.quantity * sacKg) || 0;
    const usedKg = entries.reduce((s, e) => s + e.feedQuantity, 0);
    const lostKg = losses.reduce((s, l) => s + l.quantityKg, 0);
    const soldKg = feedSales.reduce((s, x) => s + x.quantityKg, 0);
    const availableKg = receivedKg - usedKg - lostKg - soldKg;
    if (quantityKg > availableKg + 1e-6) {
      throw new BadRequestException(
        `Stock d’aliment insuffisant sur ce lot : disponible ${round(Math.max(0, availableKg), 2)} kg, vente demandée ${round(quantityKg, 2)} kg.`,
      );
    }
  }

  // ---------- Règles intégrité consommation (jamais de sortie sans lot, jamais de négatif) ----------

  /**
   * Résout le lot d'aliment à décrémenter pour une saisie de consommation.
   * - Si `inputLotId` est fourni : validé (ferme + ALIMENT + consommable au kg).
   * - Sinon : affecte automatiquement le lot éligible le plus ancien (FEFO)
   *   de la phase, ou `null` s'il n'existe aucun stock consommable de la phase.
   * Règle métier : toute consommation d'aliment DOIT être rattachée à un lot
   * dès qu'un lot éligible existe — jamais de sortie « orpheline » en présence
   * de stock. `null` ne survient que si la phase n'a réellement aucun stock.
   */
  async resolveConsumptionLot(
    farmId: string,
    feedPhase: FeedPhase | null | undefined,
    inputLotId: string | null | undefined,
    em?: EntityManager,
    requiredKg = 0,
  ): Promise<string | null> {
    const inputRepo = em ? em.getRepository(InputLot) : this.inputRepo;

    if (inputLotId != null && inputLotId !== '') {
      const lot = await inputRepo.findOne({
        where: { id: inputLotId, farmId },
      });
      if (!lot || lot.kind !== InputKind.ALIMENT) {
        throw new BadRequestException(
          'Lot d’intrant alimentaire introuvable dans cette ferme (catégorie ALIMENT uniquement).',
        );
      }
      if (!FEED_KG_ENTRY_TYPES.includes(lot.entryType)) {
        throw new BadRequestException(
          'Ce lot n’est pas un aliment consommable au kg (médicament ou matière non consommable), impossible de lui déduire de la consommation d’aliment.',
        );
      }
      return lot.id;
    }

    // Aucun lot fourni : auto-affectation FEFO parmi les lots éligibles de la phase.
    const farm = await this.farmRepo.findOne({ where: { id: farmId } });
    const sacKg = farm?.defaultSacKg ?? 50;
    const targets =
      feedPhase != null
        ? new Set<FeedPhase>([feedPhase])
        : new Set<FeedPhase>(Object.values(FeedPhase));
    const lots = await inputRepo.find({
      where: { farmId, kind: InputKind.ALIMENT },
      order: { receivedDate: 'ASC', createdAt: 'ASC' },
    });
    // FEFO: first-expiring first; lots without expiry last, then by reception.
    lots.sort((a, b) =>
      (a.expirationDate ?? '9999-12-31').localeCompare(
        b.expirationDate ?? '9999-12-31',
      ),
    );
    const today = todayStr();
    let fallback: string | null = null;
    for (const lot of lots) {
      if (!FEED_KG_ENTRY_TYPES.includes(lot.entryType)) continue;
      const key = feedPhaseKeyOf(lot);
      if (key == null || !targets.has(key)) continue;
      if (lot.expirationDate != null && lot.expirationDate < today) continue;
      const availableKg = await this.availableKgOf(lot.id, sacKg, em);
      if (availableKg <= 0) continue;
      // Prefer the first lot that covers the whole consumption, so a nearly
      // empty lot does not reject an entry another lot could serve.
      if (availableKg + 1e-6 >= requiredKg) return lot.id;
      fallback ??= lot.id;
    }
    return fallback;
  }

  /** Disponible réel (réception − conso − pertes − ventes), plafonné à 0. */
  private async availableKgOf(
    inputLotId: string,
    sacKg: number,
    em?: EntityManager,
  ): Promise<number> {
    const entryRepo = em ? em.getRepository(DailyEntry) : this.entryRepo;
    const lossRepo = em ? em.getRepository(FeedStockLoss) : this.lossRepo;
    const saleRepo = em ? em.getRepository(FeedStockSale) : this.saleRepo;
    const lot = await (
      em ? em.getRepository(InputLot) : this.inputRepo
    ).findOne({ where: { id: inputLotId } });
    if (!lot) return 0;
    const [entries, losses, feedSales] = await Promise.all([
      entryRepo.find({ where: { inputLotId } }),
      lossRepo.find({ where: { inputLotId } }),
      saleRepo.find({ where: { inputLotId } }),
    ]);
    const receivedKg =
      (lot.unit === 'KG' ? lot.quantity : lot.quantity * sacKg) || 0;
    const usedKg = entries.reduce((s, e) => s + e.feedQuantity, 0);
    const lostKg = losses.reduce((s, l) => s + l.quantityKg, 0);
    const soldKg = feedSales.reduce((s, x) => s + x.quantityKg, 0);
    return Math.max(0, receivedKg - usedKg - lostKg - soldKg);
  }

  /**
   * Vérifie qu'une consommation ne dépasse pas le disponible du lot ; sinon
   * lève une 400 ET remonte une alerte ALIMENT « stock insuffisant ».
   * `quantityKg` doit être la consommation INCÉMENTALE de la transaction courante.
   */
  async assertConsumptionAvailable(
    farmId: string,
    inputLotId: string,
    quantityKg: number,
    em?: EntityManager,
  ): Promise<void> {
    if (quantityKg <= 0) return;
    // Serialise concurrent consumptions/sales on the same lot (see above).
    if (em) {
      await em.getRepository(InputLot).findOne({
        where: { id: inputLotId },
        lock: { mode: 'pessimistic_write' },
      });
    }
    const farm = await this.farmRepo.findOne({ where: { id: farmId } });
    const sacKg = farm?.defaultSacKg ?? 50;
    const availableKg = await this.availableKgOf(inputLotId, sacKg, em);
    if (quantityKg > availableKg + 1e-6) {
      await this.raiseInsufficientFeedAlert(
        farmId,
        inputLotId,
        quantityKg,
        availableKg,
      );
      throw new BadRequestException(
        `Stock d’aliment insuffisant sur ce lot : disponible ${round(Math.max(0, availableKg), 2)} kg, consommation saisie ${round(quantityKg, 2)} kg. Le lot ne peut pas être déduit à découvert — ajoutez du stock ou corrigez la quantité.`,
      );
    }
  }

  /** Alerte ALIMENT ROUGE quand une consommation dépasse le stock disponible. */
  private async raiseInsufficientFeedAlert(
    farmId: string,
    inputLotId: string,
    quantityKg: number,
    availableKg: number,
  ): Promise<void> {
    const lot = await this.inputRepo.findOne({ where: { id: inputLotId } });
    const phaseLabel = lot
      ? (TYPE_LABELS[feedPhaseKeyOf(lot) ?? ''] ?? lot.productName ?? 'ce lot')
      : 'ce lot';
    await this.alertsService.raise(
      {
        kind: AlertKind.ALIMENT,
        level: AlertLevel.ROUGE,
        message: `Stock d’aliment insuffisant : ${round(Math.max(0, availableKg), 2)} kg disponibles sur « ${lot?.productName ?? 'lot inconnu'} » (${phaseLabel}), ${round(quantityKg, 2)} kg de consommation tentés.`,
        recommendation: `Enregistrez une entrée de provende (vrac, sac ou matière première) pour ce lot avant de ressaisir la consommation, ou corrigez la quantité saisie.`,
        context: { inputLotId, availableKg, quantityKg },
      },
      { farmId },
    );
  }

  /**
   * Alerte ALIMENT ROUGE « rupture » quand une consommation est saisie alors
   * qu'aucun lot consommable de la phase n'existe (le lot ne peut pas manger).
   */
  async raiseNoFeedAlert(
    farmId: string,
    feedPhase: FeedPhase | null | undefined,
  ): Promise<void> {
    const label =
      feedPhase != null ? (TYPE_LABELS[feedPhase] ?? feedPhase) : 'aliment';
    await this.alertsService.raise(
      {
        kind: AlertKind.ALIMENT,
        level: AlertLevel.ROUGE,
        message: `Aucune provende disponible pour la phase ${label} : la consommation a été saisie alors qu’il ne reste aucun lot consommable pour cette phase.`,
        recommendation: `Enregistrez une entrée de provende (vrac, sac ou matière première) pour la phase ${label} afin d’alimenter les lots.`,
        context: { feedPhase: feedPhase ?? null },
      },
      { farmId },
    );
  }

  // ---------- Journal des mouvements (traçabilité 360°) ----------

  async listMovements(user: AuthUser, farmId: string) {
    await this.farmsService.assertAccessible(user, farmId);
    const farm = await this.farmRepo.findOne({ where: { id: farmId } });
    const sacKg = farm?.defaultSacKg ?? 50;
    const lots = await this.inputRepo.find({
      where: { farmId, kind: InputKind.ALIMENT },
    });
    const lotPhase = new Map<string, string | null>(
      lots.map((l) => [l.id, l.feedPhase ?? l.foodType]),
    );
    const lotName = new Map<string, string>(
      lots.map((l) => [l.id, l.productName]),
    );
    const lotPricePerKg = new Map<string, number | null>(
      lots.map((l) => [l.id, this.lotPricePerKg(l, sacKg)]),
    );
    const valueFor = (
      inputLotId: string | null,
      quantityKg: number,
    ): number | null => {
      if (inputLotId == null) return null;
      const price = lotPricePerKg.get(inputLotId);
      if (price == null) return null;
      return Math.round(quantityKg * price);
    };
    const lotIds = lots.map((l) => l.id);

    const [entries, losses, feedSales] = await Promise.all([
      lotIds.length > 0
        ? this.entryRepo.find({ where: { inputLotId: In(lotIds) } })
        : Promise.resolve<DailyEntry[]>([]),
      this.lossRepo.find({ where: { farmId } }),
      this.saleRepo.find({ where: { farmId } }),
    ]);

    const movements = [
      ...losses.map((l) => ({
        id: l.id,
        type: 'PERTE' as const,
        date: l.occurredAt,
        quantityKg: l.quantityKg,
        valueFcfa: valueFor(l.inputLotId, l.quantityKg),
        foodType: l.inputLotId ? (lotPhase.get(l.inputLotId) ?? null) : null,
        productName: l.inputLotId ? (lotName.get(l.inputLotId) ?? null) : null,
        inputLotId: l.inputLotId,
        batchId: l.batchId,
        reason: l.reason,
        notes: l.notes,
        createdAt: l.createdAt,
      })),
      ...feedSales.map((s) => ({
        id: s.id,
        type: 'VENTE' as const,
        date: s.soldAt,
        quantityKg: s.quantityKg,
        valueFcfa: valueFor(s.inputLotId, s.quantityKg),
        foodType: s.inputLotId ? (lotPhase.get(s.inputLotId) ?? null) : null,
        productName: s.inputLotId ? (lotName.get(s.inputLotId) ?? null) : null,
        inputLotId: s.inputLotId,
        batchId: s.batchId,
        saleItemId: s.saleItemId,
        createdAt: s.createdAt,
      })),
      ...entries.map((e) => ({
        id: e.id,
        type: 'CONSOMMATION' as const,
        date: e.entryDate,
        quantityKg: e.feedQuantity,
        valueFcfa: valueFor(e.inputLotId, e.feedQuantity),
        foodType: e.feedType,
        feedPhase: e.feedPhase,
        productName: e.inputLotId ? (lotName.get(e.inputLotId) ?? null) : null,
        inputLotId: e.inputLotId,
        batchId: e.batchId,
        source: e.source,
        createdAt: e.createdAt,
      })),
    ];
    movements.sort((a, b) =>
      a.date === b.date
        ? new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime()
        : a.date < b.date
          ? 1
          : -1,
    );
    return movements;
  }

  // ---------- Évaluation de l'alerte stock (ALIMENT) ----------

  /**
   * Alerte niveau ferme sur la PÉREMPTION des lots d'aliment NON rattachés à un
   * lot de production (batchId null) : le cas le plus fréquent (provende stockée).
   * Les intrants liés à un lot (`batchId` renseigné) sont couverts par l'advisory
   * par lot. ROUGE si périmé ou expire sous 7 j, JAUNE sous 14 j.
   */
  private async evaluateFeedExpiration(farmId: string): Promise<void> {
    const soon = new Date();
    soon.setUTCDate(soon.getUTCDate() + 7);
    const secSoon = new Date();
    secSoon.setUTCDate(secSoon.getUTCDate() + 14);
    const soonStr = soon.toISOString().slice(0, 10);
    const secSoonStr = secSoon.toISOString().slice(0, 10);
    const today = todayStr();

    const lots = await this.inputRepo.find({
      where: { farmId, kind: InputKind.ALIMENT, batchId: IsNull() },
    });
    const expired = lots.filter(
      (l) => l.expirationDate != null && l.expirationDate < today,
    );
    const expiring = lots.filter(
      (l) =>
        l.expirationDate != null &&
        l.expirationDate >= today &&
        l.expirationDate <= secSoonStr,
    );

    if (expired.length > 0) {
      const lot = expired[0];
      await this.alertsService.raise(
        {
          kind: AlertKind.PEREMPTION,
          level: AlertLevel.ROUGE,
          message: `Provende périmée au stock : ${lot.productName} (lot ${lot.supplierLotNumber})${expired.length > 1 ? ` et ${expired.length - 1} autre(s)` : ''}.`,
          recommendation:
            'Retirer du stock — ne jamais distribuer une provende périmée (sécurité sanitaire).',
          context: {
            productName: lot.productName,
            expiredCount: expired.length,
          },
        },
        { farmId },
      );
      return;
    }
    if (expiring.length > 0) {
      const urgent = expiring[0]!;
      const isUrgent = urgent.expirationDate! <= soonStr;
      await this.alertsService.raise(
        {
          kind: AlertKind.PEREMPTION,
          level: isUrgent ? AlertLevel.ROUGE : AlertLevel.JAUNE,
          message: `Provende à écouler avant péremption : ${urgent.productName} expire le ${urgent.expirationDate}.`,
          recommendation:
            'Planifier l’utilisation avant la date de péremption (rotation du stock).',
          context: {
            productName: urgent.productName,
            expirationDate: urgent.expirationDate,
          },
        },
        { farmId },
      );
      return;
    }
    await this.alertsService.clearKind(farmId, null, AlertKind.PEREMPTION);
  }

  /**
   * Alerte niveau ferme sur l'autonomie du stock de provende :
   * consommation théorique = moyenne des 3 derniers jours de saisies.
   * ROUGE < feed_stock_critical_days (3 j), JAUNE < feed_stock_warn_days (5 j).
   */
  async evaluateStockAlerts(farmId: string): Promise<void> {
    await this.evaluateFeedExpiration(farmId);
    const [warnDays, criticalDays] = await Promise.all([
      this.constants.get(ReferenceKey.FEED_STOCK_WARN_DAYS, 5),
      this.constants.get(ReferenceKey.FEED_STOCK_CRITICAL_DAYS, 3),
    ]);
    const targetDays = await this.constants.get(
      ReferenceKey.FEED_ORDER_TARGET_DAYS,
      7,
    );
    const farm = await this.farmRepo.findOne({ where: { id: farmId } });
    const sacKg = farm?.defaultSacKg ?? 50;
    const stock = await this.computeFeedStock(farmId, criticalDays, warnDays);
    const assessable = stock.byType.filter((t) => t.autonomyDays != null);

    if (assessable.length === 0) {
      await this.alertsService.clearKind(farmId, null, AlertKind.ALIMENT);
      return;
    }

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

    const autonomyContext = stock.byType.reduce<Record<string, number | null>>(
      (acc, t) => {
        acc[t.feedPhase] = t.autonomyDays;
        return acc;
      },
      {},
    );

    if (critical.length > 0) {
      const mostUrgent = critical[0];
      const list = critical
        .map(
          (t) =>
            `${TYPE_LABELS[t.feedPhase] ?? t.feedPhase} (${t.autonomyDays} j)`,
        )
        .join(', ');
      const reorder = this.suggestReorder(
        stock,
        mostUrgent.feedPhase,
        targetDays,
        sacKg,
      );
      await this.alertsService.raise(
        {
          kind: AlertKind.ALIMENT,
          level: AlertLevel.ROUGE,
          message: `Stock de provende critique : ${list}. L'autonomie passe sous les ${criticalDays} jours de consommation théorique.`,
          recommendation: `Commander de la provende ${TYPE_LABELS[mostUrgent.feedPhase] ?? mostUrgent.feedPhase} immédiatement pour éviter une rupture d'alimentation du lot${reorder ? `. Quantité suggérée : ≈ ${reorder.kg} kg (≈ ${reorder.sacks} sac${reorder.sacks > 1 ? 's' : ''}) pour couvrir ${targetDays} jours` : ''}.`,
          context: {
            criticalDays,
            warnDays,
            autonomyDays: autonomyContext,
          },
        },
        { farmId },
      );
    } else if (warning.length > 0) {
      const next = warning[0];
      const reorder = this.suggestReorder(
        stock,
        next.feedPhase,
        targetDays,
        sacKg,
      );
      await this.alertsService.raise(
        {
          kind: AlertKind.ALIMENT,
          level: AlertLevel.JAUNE,
          message: `Stock de provende faible : ${TYPE_LABELS[next.feedPhase] ?? next.feedPhase} (environ ${next.autonomyDays} jours d'autonomie restants).`,
          recommendation: `Anticiper une commande de provende ${TYPE_LABELS[next.feedPhase] ?? next.feedPhase} pour ne pas atteindre le seuil critique de ${criticalDays} jours${reorder ? `. Quantité suggérée : ≈ ${reorder.kg} kg (≈ ${reorder.sacks} sac${reorder.sacks > 1 ? 's' : ''})` : ''}.`,
          context: {
            criticalDays,
            warnDays,
            autonomyDays: autonomyContext,
          },
        },
        { farmId },
      );
    } else {
      await this.alertsService.clearKind(farmId, null, AlertKind.ALIMENT);
    }
  }

  // ---------- Calcul du stock ----------

  private async computeFeedStock(
    farmId: string,
    criticalDays: number,
    warnDays: number,
  ): Promise<ComputedStock> {
    const farm = await this.farmRepo.findOne({ where: { id: farmId } });
    if (!farm) throw new NotFoundException('Ferme introuvable.');
    const sacKg = farm.defaultSacKg ?? 50;

    const lots = await this.inputRepo.find({
      where: { farmId, kind: InputKind.ALIMENT },
      order: { receivedDate: 'DESC', createdAt: 'DESC' },
    });

    let entries: DailyEntry[] = [];
    let losses: FeedStockLoss[] = [];
    let feedSales: FeedStockSale[] = [];

    if (lots.length > 0) {
      const lotIds = lots.map((l) => l.id);
      [entries, losses, feedSales] = await Promise.all([
        this.entryRepo.find({ where: { inputLotId: In(lotIds) } }),
        this.lossRepo.find({ where: { farmId } }),
        this.saleRepo.find({ where: { farmId } }),
      ]);
    }

    const usedByLot = new Map<string, number>();
    for (const e of entries) {
      if (e.inputLotId == null) continue;
      usedByLot.set(
        e.inputLotId,
        (usedByLot.get(e.inputLotId) ?? 0) + e.feedQuantity,
      );
    }
    const lostByLot = new Map<string, number>();
    for (const l of losses) {
      if (l.inputLotId == null) continue;
      lostByLot.set(
        l.inputLotId,
        (lostByLot.get(l.inputLotId) ?? 0) + l.quantityKg,
      );
    }
    const soldByLot = new Map<string, number>();
    for (const s of feedSales) {
      if (s.inputLotId == null) continue;
      soldByLot.set(
        s.inputLotId,
        (soldByLot.get(s.inputLotId) ?? 0) + s.quantityKg,
      );
    }

    const today = todayStr();
    const lotStocks: FeedLotStock[] = lots.map((lot) => {
      const receivedKg =
        (lot.unit === 'KG' ? lot.quantity : lot.quantity * sacKg) || 0;
      const usedKg = usedByLot.get(lot.id) ?? 0;
      const lostKg = lostByLot.get(lot.id) ?? 0;
      const soldKg = soldByLot.get(lot.id) ?? 0;
      const availableKg = round(
        Math.max(0, receivedKg - usedKg - lostKg - soldKg),
        2,
      );
      return {
        id: lot.id,
        productName: lot.productName,
        supplier: lot.supplier,
        supplierLotNumber: lot.supplierLotNumber,
        batchId: lot.batchId,
        entryType: lot.entryType,
        feedPhase: lot.feedPhase,
        customFeedPhaseName: lot.customFeedPhaseName,
        productId: lot.productId,
        foodType: lot.foodType,
        receivedDate: lot.receivedDate,
        expirationDate: lot.expirationDate,
        quantity: lot.quantity,
        unit: lot.unit,
        receivedKg,
        usedKg: round(usedKg, 2),
        lostKg: round(lostKg, 2),
        soldKg: round(soldKg, 2),
        availableKg,
        expired: lot.expirationDate != null && lot.expirationDate < today,
      };
    });

    // Consommation théorique : moyenne des 3 derniers jours (tous lots de la ferme).
    // Basée sur la phase (FeedPhase) des saisies, agrégée par phase.
    const dailyAvgByPhase = new Map<FeedPhase, number>();
    const batchIds = (
      await this.batchRepo.find({ where: { farmId }, select: { id: true } })
    ).map((b) => b.id);
    if (batchIds.length > 0) {
      const since = daysAgoStr(CONSUMPTION_WINDOW_DAYS - 1);
      const windowEntries = await this.entryRepo.find({
        where: { batchId: In(batchIds), entryDate: MoreThanOrEqual(since) },
      });
      if (windowEntries.length > 0) {
        const daysInWindow = new Set(windowEntries.map((e) => e.entryDate))
          .size;
        for (const phase of Object.values(FeedPhase)) {
          const sum = windowEntries
            .filter(
              (e) =>
                (e.feedPhase ??
                  FOOD_TYPE_TO_FEED_PHASE[e.feedType ?? ''] ??
                  null) === phase,
            )
            .reduce((s, e) => s + e.feedQuantity, 0);
          if (sum > 0) {
            dailyAvgByPhase.set(phase, round(sum / daysInWindow, 2));
          }
        }
      }
    }

    const byType: FeedTypeStock[] = [];
    // Aliment consommable par phase (BULKER + BAG + MATIERE_PREMIERE).
    const feedLotsByPhase = new Map<FeedPhase, FeedLotStock[]>();
    for (const phase of Object.values(FeedPhase))
      feedLotsByPhase.set(phase, []);
    for (const s of lotStocks) {
      if (!FEED_KG_ENTRY_TYPES.includes(s.entryType)) continue;
      const key = feedPhaseKeyOf(s) ?? null;
      if (key != null) feedLotsByPhase.get(key)?.push(s);
    }
    for (const phase of Object.values(FeedPhase)) {
      const typedLots = feedLotsByPhase.get(phase) ?? [];
      if (typedLots.length === 0) continue;
      const receivedKg = round(
        typedLots.reduce((s, x) => s + x.receivedKg, 0),
        2,
      );
      const usedKg = round(
        typedLots.reduce((s, x) => s + x.usedKg, 0),
        2,
      );
      const lostKg = round(
        typedLots.reduce((s, x) => s + x.lostKg, 0),
        2,
      );
      const soldKg = round(
        typedLots.reduce((s, x) => s + x.soldKg, 0),
        2,
      );
      const availableKg = round(
        typedLots.reduce((s, x) => s + x.availableKg, 0),
        2,
      );
      const dailyAvg = dailyAvgByPhase.get(phase) ?? 0;
      const autonomyDays =
        dailyAvg > 0 ? round(availableKg / dailyAvg, 1) : null;
      const suggested = this.suggestFeedLot(typedLots, today) ?? null;
      byType.push({
        feedPhase: phase,
        foodType: typedLots[0]?.foodType ?? null,
        receivedKg,
        usedKg,
        lostKg,
        soldKg,
        availableKg,
        autonomyDays,
        status: this.stockStatus(autonomyDays, criticalDays, warnDays),
        suggestedLotId: suggested?.id ?? null,
        suggestedLotName: suggested?.productName ?? null,
      });
    }

    return { lots: lotStocks, byType };
  }

  /**
   * Suggère le lot à déduire en priorité (FEFO — First Expiry, First Out) :
   * le plus vieux par date de péremption, puis par date de réception.
   * Les lots périmés et les lots épuisés sont exclus.
   */
  private suggestFeedLot(
    lots: FeedLotStock[],
    today: string,
  ): FeedLotStock | undefined {
    const usable = lots.filter(
      (l) =>
        l.availableKg > 0 &&
        !(l.expirationDate != null && l.expirationDate < today),
    );
    if (usable.length === 0) return undefined;
    return usable.sort((a, b) => {
      const ae = a.expirationDate ?? '9999-12-31';
      const be = b.expirationDate ?? '9999-12-31';
      if (ae !== be) return ae < be ? -1 : 1;
      if (a.receivedDate !== b.receivedDate)
        return a.receivedDate < b.receivedDate ? -1 : 1;
      return a.id < b.id ? -1 : 1;
    })[0];
  }

  /**
   * Quantité de réapprovisionnement suggérée pour une phase d’aliment :
   * (objectif de jours − autonomie restante) × consommation moyenne journalière,
   * arrondie au sac supérieur.
   */
  private suggestReorder(
    stock: ComputedStock,
    feedPhase: FeedPhase,
    targetDays: number,
    sacKg: number,
  ): { kg: number; sacks: number } | null {
    const t = stock.byType.find((x) => x.feedPhase === feedPhase);
    if (!t || t.autonomyDays == null || t.autonomyDays <= 0) return null;
    const daysToCover = targetDays - t.autonomyDays;
    if (daysToCover <= 0) return null;
    const dailyAvg = t.availableKg / t.autonomyDays;
    const kg = Math.ceil(daysToCover * dailyAvg);
    return { kg, sacks: Math.max(1, Math.ceil(kg / sacKg)) };
  }

  /**
   * Prix au kg d'un lot d'aliment ramené selon son type d'entrée, ou null si non
   * renseigné :
   * - BULKER : coût / MT → kg (costPerMtFcfa / 1000)
   * - BAG    : prix / sac / taille du sac, sinon unitPriceFcfa legacy
   * - MATIERE_PREMIERE : coût total / tonnage → kg
   * - MEDICAMENT : pas de prix au kg (souvent dose) → null
   */
  private lotPricePerKg(lot: InputLot, sacKg: number): number | null {
    if (lot.entryType === FeedEntryType.BULKER) {
      if (lot.costPerMtFcfa == null || lot.costPerMtFcfa <= 0) return null;
      return round(lot.costPerMtFcfa / 1000, 3);
    }
    if (lot.entryType === FeedEntryType.BAG) {
      if (lot.unitPriceFcfa == null || lot.unitPriceFcfa <= 0) return null;
      const size = lot.bagSizeKg ?? (lot.unit === 'KG' ? null : sacKg);
      if (size == null || size <= 0) return null;
      return round(lot.unitPriceFcfa / size, 3);
    }
    if (lot.entryType === FeedEntryType.MATIERE_PREMIERE) {
      if (
        lot.totalCostFcfa == null ||
        lot.totalCostFcfa <= 0 ||
        lot.quantity <= 0
      )
        return null;
      return round(lot.totalCostFcfa / lot.quantity, 3);
    }
    return null;
  }

  private stockStatus(
    autonomyDays: number | null,
    criticalDays: number,
    warnDays: number,
  ): AlertLevel {
    if (autonomyDays == null) return AlertLevel.VERT;
    if (autonomyDays < criticalDays) return AlertLevel.ROUGE;
    if (autonomyDays < warnDays) return AlertLevel.JAUNE;
    return AlertLevel.VERT;
  }
}
