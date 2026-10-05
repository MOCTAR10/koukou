import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { DataSource, EntityManager, In, Not, Repository } from 'typeorm';
import { AuthUser } from '../../common/decorators/current-user.decorator.js';
import { SaleStatus } from '../../common/enums/sale-status.enum.js';
import {
  PaymentMethod,
  PaymentStatus,
} from '../../common/enums/payment-method.enum.js';
import {
  SaleItemProductType,
  SaleItemUnit,
} from '../../common/enums/sale-item-type.enum.js';
import {
  CashMovementType,
  CashMovementSource,
} from '../../common/enums/cash-session-status.enum.js';
import { AlertKind } from '../../common/enums/alert-level.enum.js';
import { FarmsService } from '../farms/farms.service.js';
import { PointsOfSaleService } from '../points-of-sale/points-of-sale.service.js';
import { AlertsService } from '../alerts/alerts.service.js';
import { BatchesService } from '../batches/batches.service.js';
import { FeedStockService } from '../feed-stock/feed-stock.service.js';
import { InputLot } from '../inputs/entities/input-lot.entity.js';
import { InputKind } from '../../common/enums/input-kind.enum.js';
import { ProductionBatch } from '../batches/entities/production-batch.entity.js';
import { BatchStatus } from '../../common/enums/batch-type.enum.js';
import { SlaughterOrder } from '../slaughter/entities/slaughter-order.entity.js';
import { SlaughterStatus } from '../../common/enums/slaughter-status.enum.js';
import { SlaughterType } from '../../common/enums/slaughter-type.enum.js';
import { StockTransfer } from '../points-of-sale/entities/stock-transfer.entity.js';
import { StockTransferProductType } from '../../common/enums/stock-transfer-product-type.enum.js';
import { StockTransferStatus } from '../../common/enums/stock-transfer-status.enum.js';
import { PointOfSaleKind } from '../../common/enums/point-of-sale-kind.enum.js';
import { DailyEntry } from '../daily-entries/entities/daily-entry.entity.js';
import { Customer } from './entities/customer.entity.js';
import { CashSession } from './entities/cash-session.entity.js';
import { CashSessionStatus } from '../../common/enums/cash-session-status.enum.js';
import { CashMovement } from './entities/cash-movement.entity.js';
import { Payment } from './entities/payment.entity.js';
import { Sale } from './entities/sale.entity.js';
import { SaleItem } from './entities/sale-item.entity.js';
import { Order } from '../orders/entities/order.entity.js';
import { PaymentsService } from './payments.service.js';
import { RentabiliteService } from './rentabilite.service.js';
import { PromotionsService } from './promotions.service.js';
import { normalizePhone } from './customers.service.js';
import { PdfService } from '../../common/services/pdf.service.js';
import { koukouBus, KOUKOU_EVENTS } from '../../common/utils/event-bus.js';
import { CreatePaymentDto } from './dto/payment.dto.js';
import { CreateSaleDto } from './dto/sale.dto.js';
import { FeedUnit } from '../../common/enums/food-type.enum.js';

const SALE_PREFIX = 'VTE';
const EGGS_PER_ALVEOL = 30;
const ITEM_LABELS: Record<SaleItemProductType, string> = {
  POULET_PIECE: 'Poulet à la pièce',
  POULET_KG: 'Poulet au kilo',
  ABATTU_PIECE: 'Poulet abattu (pièce)',
  ABATTU_KG: 'Poulet abattu (au kilo)',
  OEUFS: 'Œufs (alvéoles)',
  PROVENDE: 'Provende',
  AUTRE: 'Article divers',
};

function todayStr(): string {
  return new Date().toISOString().slice(0, 10);
}

function makeReferenceNumber(): string {
  const date = new Date().toISOString().slice(0, 10).replace(/-/g, '');
  const suffix = Math.floor(100000 + Math.random() * 900000);
  return `${SALE_PREFIX}-${date}-${suffix}`;
}

function isUniqueViolation(err: unknown): boolean {
  return (
    err instanceof Error &&
    (err as { code?: string }).code === '23505'
  );
}

@Injectable()
export class SalesService {
  constructor(
    private readonly dataSource: DataSource,
    @InjectRepository(Sale)
    private readonly saleRepo: Repository<Sale>,
    @InjectRepository(SaleItem)
    private readonly itemRepo: Repository<SaleItem>,
    @InjectRepository(Payment)
    private readonly paymentRepo: Repository<Payment>,
    @InjectRepository(ProductionBatch)
    private readonly batchRepo: Repository<ProductionBatch>,
    @InjectRepository(SlaughterOrder)
    private readonly slaughterOrderRepo: Repository<SlaughterOrder>,
    @InjectRepository(Order)
    private readonly orderRepo: Repository<Order>,
    private readonly farmsService: FarmsService,
    private readonly pointsOfSaleService: PointsOfSaleService,
    private readonly paymentsService: PaymentsService,
    private readonly rentabiliteService: RentabiliteService,
    private readonly promotionsService: PromotionsService,
    private readonly feedStockService: FeedStockService,
    private readonly batchesService: BatchesService,
    private readonly alertsService: AlertsService,
    private readonly pdfService: PdfService,
  ) {}

  // ---------- Création (transaction POS) ----------

  async create(user: AuthUser, farmId: string, dto: CreateSaleDto) {
    const farm = await this.farmsService.assertAccessible(user, farmId);
    if (dto.idempotencyKey) {
      const existing = await this.findByIdempotent(farmId, dto.idempotencyKey);
      if (existing) {
        return this.assembleResult(existing.sale, existing.items, existing.payments);
      }
    }
    if (farm.active === false) {
      throw new BadRequestException(
        'Ferme suspendue : aucune nouvelle vente ne peut être enregistrée tant que la ferme est suspendue.',
      );
    }
    if (!dto.items || dto.items.length === 0) {
      throw new BadRequestException('Au moins un article est requis.');
    }

    const involvedBatches = new Set<string>();

    const result = await this.dataSource.transaction(async (em) => {
      const saleRepo = em.getRepository(Sale);

      // Verrouille TOUS les lots impliqués dans un ordre trié, AVANT de traiter
      // chaque article. Les ventes « abattu » lockent un ordre d'abattage (que
      // slaughter.process verrouille APRÈS son lot) ; en pré-verrouillant les
      // lots ici, le graphe de verrous reste « lot → ordre » indépendamment de
      // l'ordre des articles du DTO (évite l'inversion batch/ordre → deadlock).
      const involvedBatchIds = [
        ...new Set(
          dto.items
            .map((i) => i.batchId)
            .filter((b): b is string => Boolean(b)),
        ),
      ].sort();
      if (involvedBatchIds.length > 0 || dto.batchId) {
        const batchRepo = em.getRepository(ProductionBatch);
        const toLock = [
          ...involvedBatchIds,
          ...(dto.batchId && !involvedBatchIds.includes(dto.batchId)
            ? [dto.batchId]
            : []),
        ];
        for (const batchId of toLock) {
          await this.loadBatch(batchRepo, farmId, batchId);
        }
      }

      const resolvedCustomerId = await this.resolveCustomer(
        em,
        farmId,
        user.id,
        dto,
      );

      const resolvedPointOfSaleId = await this.pointsOfSaleService.resolve(
        farmId,
        dto.pointOfSaleId,
      );
      const resolvedPosEntity = resolvedPointOfSaleId
        ? await this.pointsOfSaleService.resolveEntity(
            farmId,
            resolvedPointOfSaleId,
          )
        : null;

      if (dto.batchId) {
        await this.assertBatchInFarm(em, farmId, dto.batchId);
      }

      const sale = await saleRepo.save(
        saleRepo.create({
          farmId,
          referenceNumber: await this.nextReference(em),
          saleDate: dto.saleDate ?? todayStr(),
          totalAmountFcfa: 0,
          status: SaleStatus.SETTLED,
          customerId: resolvedCustomerId,
          pointOfSaleId: resolvedPointOfSaleId,
          batchId: dto.batchId ?? null,
          idempotencyKey: dto.idempotencyKey ?? null,
          createdById: user.id,
        }),
      );

      const items: SaleItem[] = [];
      let total = 0;
      for (const itemDto of dto.items) {
        const item = await this.createItemWithinTransaction(
          em,
          farmId,
          sale.id,
          user,
          itemDto as any,
          resolvedPosEntity
            ? { id: resolvedPosEntity.id, kind: resolvedPosEntity.kind }
            : null,
        );
        total += item.amountFcfa;
        items.push(item);
        if (item.batchId) involvedBatches.add(item.batchId);
      }

      let discountAmountFcfa = 0;
      let promotionId: string | null = null;
      if (dto.promoCode) {
        const applied = await this.promotionsService.applyCode(
          em,
          farmId,
          dto.promoCode,
          total,
          resolvedCustomerId,
        );
        discountAmountFcfa = applied.discountFcfa;
        promotionId = applied.promotion.id;
      }
      sale.totalAmountFcfa = total - discountAmountFcfa;
      sale.discountAmountFcfa = discountAmountFcfa;
      sale.promotionId = promotionId;
      const saleWithTotal = await saleRepo.save(sale);

      const payments: Payment[] = [];
      const seenKeys = new Set<string>();
      for (const p of dto.payments ?? []) {
        if (p.idempotencyKey) {
          if (seenKeys.has(p.idempotencyKey)) continue;
          seenKeys.add(p.idempotencyKey);
        }
        payments.push(
          await this.paymentsService.recordPayment(em, {
            farm: farm,
            sale: saleWithTotal,
            method: p.method ?? PaymentMethod.CASH,
            amountFcfa: p.amountFcfa,
            paymentDate: p.paymentDate,
            idempotencyKey: p.idempotencyKey,
            operatorId: user.id,
          }),
        );
      }

      sale.status =
        payments.reduce((s, p) => s + p.amountFcfa, 0) >= sale.totalAmountFcfa
          ? SaleStatus.SETTLED
          : SaleStatus.OUTSTANDING;
      const savedSale = await saleRepo.save(sale);

      return { savedSale, items, payments };
    }).catch(async (err: unknown) => {
      // Deux créations concurrentes avec la même clé : l'index unique
      // (ferme, clé) tranche → on renvoie la vente existante.
      if (!dto.idempotencyKey || !isUniqueViolation(err)) throw err;
      const existing = await this.findByIdempotent(
        farmId,
        dto.idempotencyKey,
      );
      if (!existing) throw err;
      return {
        savedSale: existing.sale,
        items: existing.items,
        payments: existing.payments,
      };
    });

    await this.afterSaleChange(farmId, [...involvedBatches]);

    return this.assembleResult(result.savedSale, result.items, result.payments);
  }

  /** Trouve ou crée le client (jamais bloquant : la vente aboutit toujours). */
  private async findByIdempotent(farmId: string, key: string) {
    const sale = await this.saleRepo.findOne({
      where: { farmId, idempotencyKey: key },
    });
    if (!sale) return null;
    const [items, payments] = await Promise.all([
      this.itemRepo.find({ where: { saleId: sale.id } }),
      this.paymentRepo.find({ where: { saleId: sale.id } }),
    ]);
    return { sale, items, payments };
  }

  private async resolveCustomer(
    em: EntityManager,
    farmId: string,
    operatorId: string,
    dto: CreateSaleDto,
  ): Promise<string | null> {
    if (dto.customerId) {
      const customer = await em.getRepository(Customer).findOne({
        where: { id: dto.customerId, farmId },
      });
      if (!customer)
        throw new BadRequestException('Client introuvable dans cette ferme.');
      return customer.id;
    }
    if (dto.customerPhone) {
      const normalized = normalizePhone(dto.customerPhone);
      const candidates = await em.getRepository(Customer).find({
        where: { farmId },
        order: { createdAt: 'ASC' },
      });
      const existing = candidates.find(
        (c) => c.phone != null && normalizePhone(c.phone) === normalized,
      );
      if (existing) return existing.id;
      const created = await em.getRepository(Customer).save(
        em.getRepository(Customer).create({
          farmId,
          fullName: (dto.customerName ?? '').trim() || `Client ${normalized}`,
          phone: normalized,
          createdById: operatorId,
        }),
      );
      return created.id;
    }
    return null;
  }

  private async nextReference(em: EntityManager): Promise<string> {
    for (let attempt = 0; attempt < 5; attempt++) {
      const candidate = makeReferenceNumber();
      const existing = await em.getRepository(Sale).findOne({
        where: { referenceNumber: candidate },
      });
      if (!existing) return candidate;
    }
    throw new BadRequestException(
      'Impossible de générer une référence de vente unique. Réessayer.',
    );
  }

  private async createItemWithinTransaction(
    em: EntityManager,
    farmId: string,
    saleId: string,
    user: AuthUser,
    dto: {
      productType: SaleItemProductType;
      label?: string;
      quantity: number;
      unit?: SaleItemUnit;
      pieceCount?: number;
      unitPriceFcfa: number;
      batchId?: string;
      inputLotId?: string;
      sourceSlaughterOrderId?: string;
      stockTransferId?: string;
    },
    pos?: { id: string; kind: PointOfSaleKind } | null,
  ): Promise<SaleItem> {
    const itemRepo = em.getRepository(SaleItem);
    const batchRepo = em.getRepository(ProductionBatch);
    const productType = dto.productType;
    const quantity = dto.quantity;
    const unit = dto.unit ?? this.defaultUnit(productType);
    const price = dto.unitPriceFcfa;

    let batchId: string | null = null;
    let pieceCount: number | null = null;
    let inputLotId: string | null = null;
    let sourceSlaughterOrderId: string | null =
      dto.sourceSlaughterOrderId ?? null;
    let batchValidated = false;

    const isAbattu =
      productType === SaleItemProductType.ABATTU_PIECE ||
      productType === SaleItemProductType.ABATTU_KG;
    const fromCarcassPool = isAbattu && sourceSlaughterOrderId != null;
    const pendingStockTransferId = dto.stockTransferId ?? null;
    const boutiqueTransfer =
      pos?.kind === PointOfSaleKind.BOUTIQUE && pendingStockTransferId != null;
    if (pendingStockTransferId != null && pos?.kind !== PointOfSaleKind.BOUTIQUE) {
      throw new BadRequestException(
        'Une réserve de transfert ne peut être consommée que par une vente en boutique (point de vente externe).',
      );
    }
    if (
      boutiqueTransfer &&
      productType !== SaleItemProductType.ABATTU_PIECE &&
      productType !== SaleItemProductType.ABATTU_KG &&
      productType !== SaleItemProductType.OEUFS &&
      productType !== SaleItemProductType.PROVENDE
    ) {
      throw new BadRequestException(
        'Ce produit ne peut pas être vendu depuis une réserve de transfert.',
      );
    }

    if (
      productType === SaleItemProductType.ABATTU_PIECE &&
      boutiqueTransfer &&
      unit === SaleItemUnit.PIECE
    ) {
      const birds = Math.ceil(quantity);
      const t = await this.decrementStockTransfer(
        em,
        farmId,
        pendingStockTransferId!,
        birds,
      );
      sourceSlaughterOrderId = null;
      batchId = t.batchId ?? null;
      pieceCount = birds;
    } else if (
        productType === SaleItemProductType.POULET_PIECE ||
        productType === SaleItemProductType.ABATTU_PIECE) {
      batchId = this.requireBatch(
        dto.batchId,
        productType === SaleItemProductType.ABATTU_PIECE
          ? 'poulet abattu à la pièce'
          : 'poulet à la pièce',
      );
      if (unit !== SaleItemUnit.PIECE) {
        throw new BadRequestException(
          productType === SaleItemProductType.ABATTU_PIECE
            ? 'Pour un poulet abattu à la pièce, l’unité doit être PIECE.'
            : 'Pour un poulet à la pièce, l’unité doit être PIECE.',
        );
      }
      if (!Number.isInteger(quantity)) {
        throw new BadRequestException(
          'La quantité doit être un nombre entier de pièces.',
        );
      }
      const birds = Math.ceil(quantity);
      if (fromCarcassPool) {
        const order = await this.decrementCarcassPool(
          em,
          farmId,
          sourceSlaughterOrderId!,
          birds,
        );
        sourceSlaughterOrderId = order.id;
        pieceCount = birds;
      } else {
        const batch = await this.loadBatch(batchRepo, farmId, batchId);
        if (batch.quantityAlive < birds) {
          throw new BadRequestException(
            `Stock insuffisant : il reste ${batch.quantityAlive} poulet(s) vivant(s) sur le lot, vente demandée ${birds}.`,
          );
        }
        await this.persistFlockDecrement(batchRepo, batch, birds);
        pieceCount = birds;
        batchValidated = true;
      }
    } else if (
      productType === SaleItemProductType.POULET_KG ||
      productType === SaleItemProductType.ABATTU_KG
    ) {
      if (
        productType === SaleItemProductType.ABATTU_KG &&
        boutiqueTransfer &&
        unit === SaleItemUnit.KG
      ) {
        if (!dto.pieceCount || dto.pieceCount <= 0) {
          throw new BadRequestException(
            'Vente au kilo : indiquer le nombre de pièces (nb de poulets) décrémenté depuis la réserve du transfert.',
          );
        }
        const t = await this.decrementStockTransfer(
          em,
          farmId,
          pendingStockTransferId!,
          dto.pieceCount,
        );
        sourceSlaughterOrderId = null;
        batchId = t.batchId ?? null;
        pieceCount = dto.pieceCount;
      } else {
        batchId = this.requireBatch(
        dto.batchId,
        productType === SaleItemProductType.ABATTU_KG
          ? 'poulet abattu au kilo'
          : 'poulet au kilo',
      );
      if (unit !== SaleItemUnit.KG) {
        throw new BadRequestException(
          productType === SaleItemProductType.ABATTU_KG
            ? 'Pour un poulet abattu au kilo, l’unité doit être KG.'
            : 'Pour un poulet au kilo, l’unité doit être KG.',
        );
      }
      if (!dto.pieceCount || dto.pieceCount <= 0) {
        throw new BadRequestException(
          'Vente au kilo : indiquer le nombre de pièces (nb de poulets) pour décrémenter le cheptel vivant.',
        );
      }
      if (fromCarcassPool) {
        const order = await this.decrementCarcassPool(
          em,
          farmId,
          sourceSlaughterOrderId!,
          dto.pieceCount,
        );
        sourceSlaughterOrderId = order.id;
        pieceCount = dto.pieceCount;
      } else {
        const batch = await this.loadBatch(batchRepo, farmId, batchId);
        if (batch.quantityAlive < dto.pieceCount) {
          throw new BadRequestException(
            `Stock insuffisant : il reste ${batch.quantityAlive} poulet(s) vivant(s) sur le lot, vente demandée ${dto.pieceCount}.`,
          );
        }
        await this.persistFlockDecrement(batchRepo, batch, dto.pieceCount);
        pieceCount = dto.pieceCount;
        batchValidated = true;
      }
      }
    } else if (productType === SaleItemProductType.OEUFS) {
      if (unit !== SaleItemUnit.ALVEOLES) {
        throw new BadRequestException(
          'Pour une vente d’œufs, l’unité doit être ALVEOLES.',
        );
      }
      batchId = dto.batchId ?? null;
      if (boutiqueTransfer) {
        const t = await this.decrementStockTransfer(
          em,
          farmId,
          pendingStockTransferId!,
          quantity,
        );
        batchId = t.batchId ?? batchId;
      } else {
        await this.assertEggsAvailable(em, farmId, quantity);
      }
    } else if (productType === SaleItemProductType.PROVENDE) {
      if (unit !== SaleItemUnit.SAC && unit !== SaleItemUnit.KG) {
        throw new BadRequestException(
          'Pour la provende, l’unité doit être SAC ou KG.',
        );
      }
      if (boutiqueTransfer) {
        await this.decrementStockTransfer(
          em,
          farmId,
          pendingStockTransferId!,
          quantity,
        );
        inputLotId = null;
        batchId = null;
      } else {
        if (!dto.inputLotId) {
          throw new BadRequestException(
            'Vente de provende : rattacher un lot d’intrant (inputLotId) pour tracer la déduction de stock HACCP.',
          );
        }
        inputLotId = dto.inputLotId;
        const lot = await em.getRepository(InputLot).findOne({
          where: { id: inputLotId, farmId },
        });
        if (!lot || lot.kind !== InputKind.ALIMENT) {
          throw new BadRequestException(
            'Lot d’intrant alimentaire introuvable dans cette ferme (catégorie ALIMENT uniquement).',
          );
        }
        batchId = dto.batchId ?? lot.batchId ?? null;
      }
    } else {
      // AUTRE : aucune contrainte d'inventaire.
      batchId = dto.batchId ?? null;
    }

    // Les autres catégories (OEUFS, PROVENDE, AUTRE) n'ont pas passé loadBatch :
    // on vérifie que le lot rattaché appartient bien à cette ferme.
    if (batchId != null && !batchValidated) {
      await this.assertBatchInFarm(em, farmId, batchId);
    }

    const amountFcfa = Math.round(quantity * price);
    const item = await itemRepo.save(
      itemRepo.create({
        saleId,
        productType,
        label: dto.label ?? ITEM_LABELS[productType],
        quantity,
        unit,
        pieceCount,
        unitPriceFcfa: price,
        amountFcfa,
        batchId,
        inputLotId,
        sourceSlaughterOrderId,
        stockTransferId: pendingStockTransferId,
      }),
    );

    if (
      productType === SaleItemProductType.PROVENDE &&
      !pendingStockTransferId
    ) {
      await this.feedStockService.recordFeedSale({
        farmId,
        inputLotId,
        batchId,
        saleItemId: item.id,
        quantity,
        unit: unit === SaleItemUnit.SAC ? FeedUnit.SAC : FeedUnit.KG,
        soldAt: todayStr(),
        createdById: user.id,
        em,
      });
    }

    return item;
  }

  private defaultUnit(productType: SaleItemProductType): SaleItemUnit {
    switch (productType) {
      case SaleItemProductType.POULET_PIECE:
      case SaleItemProductType.ABATTU_PIECE:
        return SaleItemUnit.PIECE;
      case SaleItemProductType.POULET_KG:
      case SaleItemProductType.ABATTU_KG:
        return SaleItemUnit.KG;
      case SaleItemProductType.OEUFS:
        return SaleItemUnit.ALVEOLES;
      case SaleItemProductType.PROVENDE:
        return SaleItemUnit.SAC;
      default:
        return SaleItemUnit.UNITE;
    }
  }

  private requireBatch(batchId: string | undefined, label: string): string {
    if (!batchId) {
      throw new BadRequestException(
        `Une vente de ${label} doit être rattachée à un lot de production (batchId).`,
      );
    }
    return batchId;
  }

  private async loadBatch(
    repo: Repository<ProductionBatch>,
    farmId: string,
    batchId: string,
  ): Promise<ProductionBatch> {
    const batch = await repo
      .createQueryBuilder('batch')
      .setLock('pessimistic_write')
      .where('batch.id = :id', { id: batchId })
      .andWhere('batch.farm_id = :farmId', { farmId })
      .getOne();
    if (!batch)
      throw new BadRequestException(
        'Lot de production introuvable dans cette ferme.',
      );
    this.assertSellable(batch);
    return batch;
  }

  private async assertBatchInFarm(
    em: EntityManager,
    farmId: string,
    batchId: string,
  ): Promise<ProductionBatch> {
    const batch = await em.getRepository(ProductionBatch).findOne({
      where: { id: batchId, farmId },
    });
    if (!batch)
      throw new BadRequestException(
        'Lot de production introuvable dans cette ferme.',
      );
    this.assertSellable(batch);
    return batch;
  }

  private assertSellable(batch: ProductionBatch): void {
    if (batch.status === BatchStatus.CLOTURE) {
      throw new BadRequestException(
        'Lot clôturé : aucune vente ne peut être rattachée à un lot clôturé (immuabilité).',
      );
    }
    if (batch.status === BatchStatus.FINI) {
      throw new BadRequestException(
        'Lot fini : toutes les volailles ont été vendues, aucune vente supplémentaire possible.',
      );
    }
  }

  /** Décrémente le cheptel vivant (vente sur pied ou abattage direct au comptoir). */
  private async persistFlockDecrement(
    repo: Repository<ProductionBatch>,
    batch: ProductionBatch,
    birds: number,
  ): Promise<void> {
    batch.quantityAlive -= birds;
    if (batch.quantityAlive <= 0 && batch.status !== BatchStatus.CLOTURE) {
      batch.status = BatchStatus.FINI;
    }
    await repo.save(batch);
  }

  /** Décrémente le pool de carcasses d’un ordre d’abattage traité (vente « abattu » traçable). */
  private async decrementCarcassPool(
    em: EntityManager,
    farmId: string,
    orderId: string,
    birds: number,
  ): Promise<SlaughterOrder> {
    const order = await em
      .getRepository(SlaughterOrder)
      .createQueryBuilder('o')
      .setLock('pessimistic_write')
      .where('o.id = :id', { id: orderId })
      .andWhere('o.farm_id = :farmId', { farmId })
      .getOne();
    if (!order) {
      throw new BadRequestException(
        'Ordre d’abattage introuvable dans cette ferme (source carcasse).',
      );
    }
    if (order.status !== SlaughterStatus.PROCESSED) {
      throw new BadRequestException(
        'Cet ordre d’abattage doit être traité (PROCESSED) avant de vendre ses carcasses.',
      );
    }
    if (order.slaughterType !== SlaughterType.ABATTU) {
      throw new BadRequestException(
        'Cet ordre d’abattage est « vivant » : aucune carcasse à vendre.',
      );
    }
    if (order.carcassesAvailable < birds) {
      throw new BadRequestException(
        `Carcasses insuffisantes : ${order.carcassesAvailable} carcasse(s) disponible(s) sur cet ordre, vente demandée ${birds}.`,
      );
    }
    order.carcassesAvailable -= birds;
    return em.getRepository(SlaughterOrder).save(order);
  }

  /** Réintègre des carcasses sur l’ordre d’abattage (annulation de vente traçable). */
  private async restoreCarcassPool(
    em: EntityManager,
    farmId: string,
    orderId: string,
    birds: number,
  ): Promise<void> {
    if (birds <= 0) return;
    const order = await em
      .getRepository(SlaughterOrder)
      .createQueryBuilder('o')
      .setLock('pessimistic_write')
      .where('o.id = :id', { id: orderId })
      .andWhere('o.farm_id = :farmId', { farmId })
      .getOne();
    if (!order) return;
    order.carcassesAvailable += birds;
    await em.getRepository(SlaughterOrder).save(order);
  }

  /**
   * Consomme une réserve de transfert ferme → boutique : le transfert doit
   * être actif (TRANSFERRED) et disposer du solde demandé (quantity − sold).
   */
  private async decrementStockTransfer(
    em: EntityManager,
    farmId: string,
    transferId: string,
    count: number,
  ): Promise<StockTransfer> {
    const transfer = await em
      .getRepository(StockTransfer)
      .createQueryBuilder('t')
      .setLock('pessimistic_write')
      .where('t.id = :id', { id: transferId })
      .andWhere('t.farm_id = :farmId', { farmId })
      .getOne();
    if (!transfer) {
      throw new BadRequestException(
        'Transfert de stock introuvable dans cette ferme.',
      );
    }
    if (transfer.status !== StockTransferStatus.TRANSFERRED) {
      throw new BadRequestException(
        'Ce transfert est annulé : la vente sur sa réserve est impossible.',
      );
    }
    const remaining = transfer.quantity - transfer.quantitySold;
    if (count > remaining) {
      throw new BadRequestException(
        `Réserve insuffisante sur ce transfert : ${remaining} unité(s) restante(s), vente demandée ${count}.`,
      );
    }
    transfer.quantitySold += count;
    return em.getRepository(StockTransfer).save(transfer);
  }

  /** Réintègre la réserve d'un transfert lors de l'annulation d'une vente. */
  private async restoreStockTransfer(
    em: EntityManager,
    farmId: string,
    transferId: string,
    delta: number,
  ): Promise<void> {
    if (delta <= 0) return;
    const transfer = await em
      .getRepository(StockTransfer)
      .createQueryBuilder('t')
      .setLock('pessimistic_write')
      .where('t.id = :id', { id: transferId })
      .andWhere('t.farm_id = :farmId', { farmId })
      .getOne();
    if (!transfer || transfer.status !== StockTransferStatus.TRANSFERRED) {
      return;
    }
    transfer.quantitySold = Math.max(0, transfer.quantitySold - delta);
    await em.getRepository(StockTransfer).save(transfer);
  }

  /**
   * Garde de stock œufs : calcul identique au dashboard
   * (Σ collectés − fêlés − petits − déjà vendus, 30 œufs/alvéole).
   */
  private async assertEggsAvailable(
    em: EntityManager,
    farmId: string,
    alveoles: number,
  ): Promise<void> {
    const farmBatches = await em.getRepository(ProductionBatch).find({
      where: { farmId },
    });
    let produced = 0;
    if (farmBatches.length > 0) {
      const entries = await em.getRepository(DailyEntry).find({
        where: { batchId: In(farmBatches.map((b) => b.id)) },
      });
      produced = entries.reduce(
        (s, e) =>
          s +
          (e.eggsCollected -
            e.eggsCracked -
            e.eggsSmall -
            e.eggsDoubleYolk -
            e.eggsDirty),
        0,
      );
    }
    const sales = await em.getRepository(Sale).find({
      where: { farmId, status: Not(SaleStatus.CANCELLED) },
    });
    let soldEggs = 0;
    if (sales.length > 0) {
      const eggItems = await em.getRepository(SaleItem).find({
        where: {
          saleId: In(sales.map((s) => s.id)),
          productType: SaleItemProductType.OEUFS,
        },
      });
      soldEggs = eggItems.reduce((s, i) => s + i.quantity * EGGS_PER_ALVEOL, 0);
    }
    const transfers = await em.getRepository(StockTransfer).find({
      where: {
        farmId,
        productType: StockTransferProductType.OEUFS,
        status: StockTransferStatus.TRANSFERRED,
      },
    });
    const transferredEggs = transfers.reduce(
      (s, t) => s + (t.quantity - t.quantitySold) * EGGS_PER_ALVEOL,
      0,
    );
    const requestedEggs = alveoles * EGGS_PER_ALVEOL;
    const availableEggs = produced - soldEggs - transferredEggs;
    if (requestedEggs > availableEggs) {
      throw new BadRequestException(
        `Stock d’œufs insuffisant : ${Math.max(0, availableEggs)} œuf(s) disponible(s) (≈${Math.floor(
          Math.max(0, availableEggs) / EGGS_PER_ALVEOL,
        )} alvéoles), vente demandée ${alveoles} alvéoles.`,
      );
    }
  }

  /** Vérifie que l'id feed sale existe bien dans la transaction (validate). */
  private async afterSaleChange(farmId: string, batchIds: string[]) {
    await Promise.all([
      this.feedStockService.evaluateStockAlerts(farmId),
      this.rentabiliteService.evaluateInvendus(farmId),
      Promise.all(
        batchIds.map((batchId) =>
          this.rentabiliteService.evaluateForBatch(farmId, batchId),
        ),
      ),
      Promise.all(
        batchIds.map((batchId) =>
          this.batchesService.runAdvisoryForBatch(batchId),
        ),
      ),
    ]);
    koukouBus.emit(KOUKOU_EVENTS.SALE_CHANGED, { farmId });
  }

  // ---------- Lecture ----------

  async list(
    user: AuthUser,
    farmId: string,
    from?: string,
    to?: string,
    status?: SaleStatus,
  ): Promise<Sale[]> {
    await this.farmsService.assertAccessible(user, farmId);
    const qb = this.saleRepo
      .createQueryBuilder('sale')
      .leftJoinAndSelect('sale.customer', 'customer')
      .leftJoinAndSelect('sale.items', 'items')
      .leftJoinAndSelect('sale.payments', 'payments')
      .where('sale.farm_id = :farmId', { farmId })
      .orderBy('sale.sale_date', 'DESC')
      .addOrderBy('sale.created_at', 'DESC');
    if (from) qb.andWhere('sale.sale_date >= :from', { from });
    if (to) qb.andWhere('sale.sale_date <= :to', { to });
    if (status) qb.andWhere('sale.status = :status', { status });
    return qb.getMany();
  }

  async getOne(
    user: AuthUser,
    farmId: string,
    saleId: string,
  ): Promise<Sale & { items: SaleItem[]; payments: Payment[] }> {
    await this.farmsService.assertAccessible(user, farmId);
    const sale = await this.saleRepo.findOne({
      where: { id: saleId, farmId },
      relations: { customer: true },
    });
    if (!sale) throw new NotFoundException('Vente introuvable.');
    const [items, payments] = await Promise.all([
      this.itemRepo.find({
        where: { saleId },
        relations: { batch: true, inputLot: true },
      }),
      this.paymentRepo.find({
        where: { saleId },
        order: { paymentDate: 'ASC' },
      }),
    ]);
    return { ...sale, items, payments };
  }

  // ---------- Encaissement complémentaire ----------

  async addPayment(
    user: AuthUser,
    farmId: string,
    saleId: string,
    dto: CreatePaymentDto,
  ) {
    const farm = await this.farmsService.assertAccessible(user, farmId);
    const result = await this.dataSource.transaction(async (em) => {
      const sale = await em.getRepository(Sale).findOne({
        where: { id: saleId, farmId },
        lock: { mode: 'pessimistic_write' },
      });
      if (!sale) throw new NotFoundException('Vente introuvable.');
      if (sale.status === SaleStatus.CANCELLED) {
        throw new BadRequestException(
          'Impossible d’encaisser sur une vente annulée.',
        );
      }
      const payment = await this.paymentsService.recordPayment(em, {
        farm,
        sale,
        method: dto.method ?? PaymentMethod.CASH,
        amountFcfa: dto.amountFcfa,
        paymentDate: dto.paymentDate,
        idempotencyKey: dto.idempotencyKey,
        operatorId: user.id,
      });
      const paid = await this.paidSum(em, saleId);
      if (paid >= sale.totalAmountFcfa && sale.status !== SaleStatus.SETTLED) {
        sale.status = SaleStatus.SETTLED;
        await em.getRepository(Sale).save(sale);
      }
      return payment;
    });

    await this.afterSaleChange(farmId, []);
    return result;
  }

  private async paidSum(em: EntityManager, saleId: string): Promise<number> {
    const payments = await em.getRepository(Payment).find({
      where: { saleId, status: PaymentStatus.CONFIRMED },
    });
    return payments.reduce((s, p) => s + p.amountFcfa, 0);
  }

  // ---------- Annulation (PROPRIÉTAIRE) avec réintégration du stock ----------

  async cancel(
    user: AuthUser,
    farmId: string,
    saleId: string,
    reason?: string,
    opts?: { skipStockRestore?: boolean },
  ) {
    await this.farmsService.assertAccessible(user, farmId);
    // Une vente enveloppe d'un bon de commande ne peut PAS être annulée
    // directement : cela laisserait sa commande dans un état bloqué (ni
    // livrable ni annulable). L'annulation doit passer par la commande.
    if (!opts?.skipStockRestore) {
      const linkedOrder = await this.orderRepo.findOne({
        where: { saleId },
      });
      if (linkedOrder) {
        throw new BadRequestException(
          'Cette vente est rattachée à un bon de commande : annuler la commande (qui rembourse les acomptes et annule la vente associée) plutôt que la vente seule.',
        );
      }
    }
    const involved = await this.dataSource.transaction((em) =>
      this.cancelInTransaction(em, user, farmId, saleId, reason, opts),
    );
    await this.afterSaleChange(farmId, [...involved]);
    return this.getOne(user, farmId, saleId);
  }

  /** Corps d'annulation exécuté dans une transaction fournie (réutilisable par
   *  l'annulation de commande pour former UNE seule unité de travail). */
  async cancelInTransaction(
    em: EntityManager,
    user: AuthUser,
    farmId: string,
    saleId: string,
    reason?: string,
    opts?: { skipStockRestore?: boolean },
  ): Promise<Set<string>> {
    const skipStockRestore = opts?.skipStockRestore === true;
    const involvedBatches = new Set<string>();
    {
      const sale = await em.getRepository(Sale).findOne({
        where: { id: saleId, farmId },
        lock: { mode: 'pessimistic_write' },
      });
      if (!sale) throw new NotFoundException('Vente introuvable.');
      if (sale.status === SaleStatus.CANCELLED) {
        // Cas commande : la vente enveloppe peut déjà avoir été annulée
        // (flux antérieurs) ; c'est acceptable pour l'annulation de commande
        // (skipStockRestore), rien à réintégrer ni à rembourser. Pour une
        // annulation directe en POS on refuse (déjà intercepté ci-dessus).
        if (skipStockRestore) return involvedBatches;
        throw new BadRequestException('Cette vente est déjà annulée.');
      }

      const items = await em.getRepository(SaleItem).find({
        where: { saleId },
      });
      const batchRepo = em.getRepository(ProductionBatch);
      const feedItems: SaleItem[] = [];

      for (const item of items) {
        if (!skipStockRestore && item.stockTransferId) {
          const delta =
            item.productType === SaleItemProductType.ABATTU_PIECE ||
            item.productType === SaleItemProductType.ABATTU_KG
              ? item.pieceCount ?? Math.ceil(item.quantity)
              : item.quantity;
          await this.restoreStockTransfer(
            em,
            farmId,
            item.stockTransferId,
            delta,
          );
        }
        if (item.productType === SaleItemProductType.ABATTU_PIECE ||
            item.productType === SaleItemProductType.ABATTU_KG) {
          if (!skipStockRestore && item.sourceSlaughterOrderId) {
            await this.restoreCarcassPool(
              em,
              farmId,
              item.sourceSlaughterOrderId,
              item.pieceCount ?? 0,
            );
          }
        }
        if (
          (item.productType === SaleItemProductType.POULET_PIECE ||
            item.productType === SaleItemProductType.POULET_KG ||
            item.productType === SaleItemProductType.ABATTU_PIECE ||
            item.productType === SaleItemProductType.ABATTU_KG) &&
          item.batchId
        ) {
          // Commande par bon de commande : le cheptel n'a jamais été décrémenté
          // à la création, aucune réintégration nécessaire.
          if (!skipStockRestore && !item.sourceSlaughterOrderId) {
            const batch = await batchRepo
              .createQueryBuilder('batch')
              .setLock('pessimistic_write')
              .where('batch.id = :id', { id: item.batchId })
              .andWhere('batch.farm_id = :farmId', { farmId })
              .getOne();
            if (batch) {
              if (batch.status === BatchStatus.CLOTURE) {
                throw new BadRequestException(
                  'Impossible d’annuler une vente qui affecte un lot clôturé (immuabilité).',
                );
              }
              const birds = item.pieceCount ?? Math.ceil(item.quantity);
              batch.quantityAlive += birds;
              if (batch.status === BatchStatus.FINI && batch.quantityAlive > 0) {
                batch.status = BatchStatus.EN_VENTE;
              }
              await batchRepo.save(batch);
            }
            involvedBatches.add(item.batchId);
          }
        }
        if (item.productType === SaleItemProductType.PROVENDE) {
          feedItems.push(item);
          if (item.batchId) involvedBatches.add(item.batchId);
        }
      }

      for (const item of feedItems) {
        await this.feedStockService.revertFeedSale(item.id, em);
      }

      const confirmed = await em.getRepository(Payment).find({
        where: { saleId, status: PaymentStatus.CONFIRMED },
      });
      if (confirmed.length > 0) {
        const cashSession = await em.getRepository(CashSession).findOne({
          where: { farmId, status: CashSessionStatus.OPEN },
          lock: { mode: 'pessimistic_write' },
        });
        if (!cashSession) {
          throw new BadRequestException(
            `Impossible d’annuler : ouvrir une session de caisse pour tracer le remboursement (${confirmed.length} paiement(s) confirmé(s)).`,
          );
        }
        const movements = await em.getRepository(CashMovement).find({
          where: { cashSessionId: cashSession.id },
        });
        let inFcfa = 0;
        let outFcfa = 0;
        for (const m of movements) {
          if (m.type === CashMovementType.IN) inFcfa += m.amountFcfa;
          else outFcfa += m.amountFcfa;
        }
        const available = cashSession.openingBalanceFcfa + inFcfa - outFcfa;
        const refundTotal = confirmed.reduce((s, p) => s + p.amountFcfa, 0);
        if (refundTotal > available) {
          throw new BadRequestException(
            `Remboursement de ${refundTotal} FCFA refusé : solde de caisse disponible ${available} FCFA. La caisse ne peut pas être négative.`,
          );
        }
        for (const payment of confirmed) {
          payment.status = PaymentStatus.REFUNDED;
          await em.getRepository(Payment).save(payment);
          await em.getRepository(CashMovement).save(
            em.getRepository(CashMovement).create({
              farmId,
              cashSessionId: cashSession.id,
              type: CashMovementType.OUT,
              source: CashMovementSource.REFUND,
              amountFcfa: payment.amountFcfa,
              reason: `Remboursement vente annulée ${sale.referenceNumber}`,
              saleId: sale.id,
              movementDate: todayStr(),
              createdById: user.id,
            }),
          );
        }
      }

      sale.status = SaleStatus.CANCELLED;
      sale.cancelledAt = new Date();
      sale.cancelledReason = reason ?? null;
      await em.getRepository(Sale).save(sale);
    }
    return involvedBatches;
  }

  // ---------- Reçu PDF ----------

  async generateReceipt(user: AuthUser, farmId: string, saleId: string) {
    const farm = await this.farmsService.assertAccessible(user, farmId);
    const info = await this.getOne(user, farmId, saleId);
    if (info.status === SaleStatus.CANCELLED) {
      throw new BadRequestException(
        'Impossible de générer un reçu pour une vente annulée.',
      );
    }
    const confirmed = await this.paymentRepo.find({
      where: { saleId, status: PaymentStatus.CONFIRMED },
    });
    const paid = confirmed.reduce((s, p) => s + p.amountFcfa, 0);
    return this.pdfService.createReceiptPdf({
      referenceNumber: info.referenceNumber,
      saleDate: info.saleDate,
      farmName: farm.name,
      customerName: info.customer?.fullName ?? null,
      items: info.items.map((item) => ({
        label: item.label ?? item.productType,
        quantity: `${item.quantity} ${item.unit}`,
        unitPriceFcfa: item.unitPriceFcfa,
        amountFcfa: item.amountFcfa,
      })),
      totalAmountFcfa: info.totalAmountFcfa,
      discountAmountFcfa: info.discountAmountFcfa,
      paidAmountFcfa: paid,
      remainingFcfa: Math.max(0, info.totalAmountFcfa - paid),
      method: confirmed[0]?.method ?? 'ESPECES',
    });
  }

  /** Warnings advisory non bloquants renvoyés avec la réponse de création. */
  private async assembleResult(
    sale: Sale,
    items: SaleItem[],
    payments: Payment[],
  ) {
    const warnings = await this.collectWarnings(sale.farmId, [
      sale.batchId,
      ...items.map((i) => i.batchId).filter(Boolean),
    ]);
    return { sale, items, payments, warnings };
  }

  private async collectWarnings(
    farmId: string,
    batchIds: (string | null)[],
  ): Promise<unknown[]> {
    const unique = [...new Set(batchIds.filter(Boolean))];
    if (unique.length === 0) return [];
    const alerts = await this.alertsService.listForFarm(farmId);
    return alerts
      .filter(
        (a) =>
          a.batchId != null &&
          unique.includes(a.batchId) &&
          (a.kind === AlertKind.DELAI_ATTENTE ||
            a.kind === AlertKind.VENTE ||
            a.kind === AlertKind.TRACABILITE),
      )
      .map((a) => ({
        kind: a.kind,
        level: a.level,
        message: a.message,
        recommendation: a.recommendation,
      }));
  }
}
