import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { DataSource, EntityManager, In, Not, Repository } from 'typeorm';
import { AuthUser } from '../../common/decorators/current-user.decorator.js';
import { BatchStatus } from '../../common/enums/batch-type.enum.js';
import { OrderCanal } from '../../common/enums/order-canal.enum.js';
import { OrderStatus } from '../../common/enums/order-status.enum.js';
import {
  PaymentMethod,
  PaymentStatus,
} from '../../common/enums/payment-method.enum.js';
import {
  CashMovementSource,
  CashMovementType,
  CashSessionStatus,
} from '../../common/enums/cash-session-status.enum.js';
import {
  SaleItemProductType,
  SaleItemUnit,
} from '../../common/enums/sale-item-type.enum.js';
import { SaleStatus } from '../../common/enums/sale-status.enum.js';
import { koukouBus, KOUKOU_EVENTS } from '../../common/utils/event-bus.js';
import { PdfService } from '../../common/services/pdf.service.js';
import { MetricsService } from '../batches/metrics.service.js';
import { BatchesService } from '../batches/batches.service.js';
import { ProductionBatch } from '../batches/entities/production-batch.entity.js';
import { DailyEntry } from '../daily-entries/entities/daily-entry.entity.js';
import { FarmsService } from '../farms/farms.service.js';
import { PointsOfSaleService } from '../points-of-sale/points-of-sale.service.js';
import { StockTransfer } from '../points-of-sale/entities/stock-transfer.entity.js';
import { StockTransferProductType } from '../../common/enums/stock-transfer-product-type.enum.js';
import { StockTransferStatus } from '../../common/enums/stock-transfer-status.enum.js';
import { CashMovement } from '../finance/entities/cash-movement.entity.js';
import { CashSession } from '../finance/entities/cash-session.entity.js';
import { Customer } from '../finance/entities/customer.entity.js';
import { Payment } from '../finance/entities/payment.entity.js';
import { Sale } from '../finance/entities/sale.entity.js';
import { SaleItem } from '../finance/entities/sale-item.entity.js';
import { normalizePhone } from '../finance/customers.service.js';
import { PaymentsService } from '../finance/payments.service.js';
import { RentabiliteService } from '../finance/rentabilite.service.js';
import { SalesService } from '../finance/sales.service.js';
import {
  CreateOrderDto,
  FinalizeOrderDto,
  OrderDepositDto,
} from './dto/order.dto.js';
import { Order, OrderItemSnapshot } from './entities/order.entity.js';

const ORDER_PREFIX = 'CMD';
const EGGS_PER_ALVEOL = 30;
const ORDERABLE_TYPES = [
  SaleItemProductType.POULET_PIECE,
  SaleItemProductType.POULET_KG,
  SaleItemProductType.OEUFS,
];
const ITEM_LABELS: Record<SaleItemProductType, string> = {
  POULET_PIECE: 'Poulet à la pièce',
  POULET_KG: 'Poulet au kilo',
  ABATTU_PIECE: 'Poulet abattu (pièce)',
  ABATTU_KG: 'Poulet abattu (au kilo)',
  OEUFS: 'Œufs (alvéoles)',
  PROVENDE: 'Provende',
  AUTRE: 'Article divers',
};
const CANAL_LABELS: Record<OrderCanal, string> = {
  FERME: 'Vente à la ferme',
  LIVRAISON: 'Vente en livraison',
  PRECOMMANDE: 'Précommande',
};

function todayStr(): string {
  return new Date().toISOString().slice(0, 10);
}

function makeReference(prefix: string): string {
  const date = new Date().toISOString().slice(0, 10).replace(/-/g, '');
  const suffix = Math.floor(100000 + Math.random() * 900000);
  return `${prefix}-${date}-${suffix}`;
}

function defaultUnit(productType: SaleItemProductType): SaleItemUnit {
  switch (productType) {
    case SaleItemProductType.POULET_PIECE:
    case SaleItemProductType.ABATTU_PIECE:
      return SaleItemUnit.PIECE;
    case SaleItemProductType.POULET_KG:
    case SaleItemProductType.ABATTU_KG:
      return SaleItemUnit.KG;
    case SaleItemProductType.OEUFS:
      return SaleItemUnit.ALVEOLES;
    default:
      return SaleItemUnit.UNITE;
  }
}

/** Nb d'oiseaux d'un article volaille (pièce, au kilo ou abattu). */
function birdsOf(item: {
  productType: string;
  quantity: number;
  pieceCount?: number | null;
}): number {
  if (
    item.productType === SaleItemProductType.POULET_PIECE ||
    item.productType === SaleItemProductType.ABATTU_PIECE
  ) {
    return item.pieceCount ?? Math.ceil(item.quantity);
  }
  if (
    item.productType === SaleItemProductType.POULET_KG ||
    item.productType === SaleItemProductType.ABATTU_KG
  ) {
    return item.pieceCount ?? 0;
  }
  return 0;
}

function isUniqueViolation(err: unknown): boolean {
  return (err as { code?: string })?.code === '23505';
}

@Injectable()
export class OrdersService {
  constructor(
    private readonly dataSource: DataSource,
    @InjectRepository(Order)
    private readonly orderRepo: Repository<Order>,
    private readonly farmsService: FarmsService,
    private readonly pointsOfSaleService: PointsOfSaleService,
    private readonly paymentsService: PaymentsService,
    private readonly salesService: SalesService,
    private readonly rentabiliteService: RentabiliteService,
    private readonly metricsService: MetricsService,
    private readonly batchesService: BatchesService,
    private readonly pdfService: PdfService,
  ) {}

  // ---------- Création (bon de commande) ----------

  async create(user: AuthUser, farmId: string, dto: CreateOrderDto) {
    const farm = await this.farmsService.assertAccessible(user, farmId);
    if (farm.active === false) {
      throw new BadRequestException(
        'Ferme suspendue : aucune nouvelle commande ne peut être créée tant que la ferme est suspendue.',
      );
    }
    // Rejeu offline : une même clé d'idempotence renvoie la commande déjà créée.
    if (dto.idempotencyKey) {
      const existing = await this.orderRepo.findOne({
        where: { farmId, idempotencyKey: dto.idempotencyKey },
      });
      if (existing) {
        return this.getOne(user, farmId, existing.id);
      }
    }
    if (!dto.items || dto.items.length === 0) {
      throw new BadRequestException('Au moins un article est requis.');
    }

    const order = await this.dataSource.transaction(async (em) => {
      const orderRepo = em.getRepository(Order);
      const saleRepo = em.getRepository(Sale);
      const itemRepo = em.getRepository(SaleItem);

      const snapshots: OrderItemSnapshot[] = [];
      let birdsRequested = 0;
      let checkoutBatchId: string | null = null;
      let total = 0;

      for (const it of dto.items) {
        if (!ORDERABLE_TYPES.includes(it.productType)) {
          throw new BadRequestException(
            'Les commandes concernent la volaille sur pied (pièce / au kilo) et les œufs. Vente d’abattu, provende ou article divers : passer par la vente directe (POS).',
          );
        }
        const unit = it.unit ?? defaultUnit(it.productType);
        let pieceCount: number | null = null;
        let batchId: string | null = null;

        if (it.productType === SaleItemProductType.POULET_PIECE ||
            it.productType === SaleItemProductType.ABATTU_PIECE) {
          if (unit !== SaleItemUnit.PIECE) {
            throw new BadRequestException(
              it.productType === SaleItemProductType.ABATTU_PIECE
                ? 'Pour un poulet abattu à la pièce, l’unité doit être PIECE.'
                : 'Pour un poulet à la pièce, l’unité doit être PIECE.',
            );
          }
          if (!Number.isInteger(it.quantity)) {
            throw new BadRequestException(
              'La quantité doit être un nombre entier de pièces.',
            );
          }
          if (!it.batchId) {
            throw new BadRequestException(
              'Une commande de volaille doit être rattachée à un lot de production (batchId).',
            );
          }
          batchId = it.batchId;
          pieceCount = Math.ceil(it.quantity);
          birdsRequested += pieceCount;
        } else if (it.productType === SaleItemProductType.POULET_KG ||
                   it.productType === SaleItemProductType.ABATTU_KG) {
          if (unit !== SaleItemUnit.KG) {
            throw new BadRequestException(
              it.productType === SaleItemProductType.ABATTU_KG
                ? 'Pour un poulet abattu au kilo, l’unité doit être KG.'
                : 'Pour un poulet au kilo, l’unité doit être KG.',
            );
          }
          if (!it.pieceCount || it.pieceCount <= 0) {
            throw new BadRequestException(
              'Commande au kilo : indiquer le nombre de pièces (nb de poulets).',
            );
          }
          if (!it.batchId) {
            throw new BadRequestException(
              'Une commande de volaille doit être rattachée à un lot de production (batchId).',
            );
          }
          batchId = it.batchId;
          pieceCount = it.pieceCount;
          birdsRequested += pieceCount;
        } else {
          if (unit !== SaleItemUnit.ALVEOLES) {
            throw new BadRequestException(
              'Pour une commande d’œufs, l’unité doit être ALVEOLES.',
            );
          }
          await this.assertEggsAvailable(em, farmId, it.quantity);
        }

        if (batchId) {
          if (checkoutBatchId && checkoutBatchId !== batchId) {
            throw new BadRequestException(
              'Une commande ne peut porter que sur un seul lot de production.',
            );
          }
          checkoutBatchId = batchId;
        }

        const amount = Math.round(it.quantity * it.unitPriceFcfa);
        total += amount;
        snapshots.push({
          saleItemId: '',
          productType: it.productType,
          label: it.label ?? ITEM_LABELS[it.productType],
          quantity: it.quantity,
          unit,
          pieceCount,
          unitPriceFcfa: it.unitPriceFcfa,
          amountFcfa: amount,
          batchId,
          inputLotId: it.inputLotId ?? null,
        });
      }

      if (checkoutBatchId && birdsRequested > 0) {
        const batch = await this.assertBatchOrderable(
          em,
          farmId,
          checkoutBatchId,
        );
        await this.assertBirdsAvailable(
          em,
          farmId,
          checkoutBatchId,
          batch,
          birdsRequested,
        );
      }

      const customerId = await this.resolveCustomer(em, farmId, user.id, dto);

      const resolvedPointOfSaleId = await this.pointsOfSaleService.resolve(
        farmId,
        dto.pointOfSaleId,
      );

      const sale = await saleRepo.save(
        saleRepo.create({
          farmId,
          referenceNumber: await this.nextReference(em, Sale, 'VTE'),
          saleDate: dto.saleDate ?? todayStr(),
          totalAmountFcfa: total,
          status: SaleStatus.OUTSTANDING,
          customerId,
          pointOfSaleId: resolvedPointOfSaleId,
          batchId: checkoutBatchId,
          createdById: user.id,
        }),
      );

      for (const snap of snapshots) {
        const item = await itemRepo.save(
          itemRepo.create({
            saleId: sale.id,
            productType: snap.productType,
            label: snap.label,
            quantity: snap.quantity,
            unit: snap.unit,
            pieceCount: snap.pieceCount,
            unitPriceFcfa: snap.unitPriceFcfa,
            amountFcfa: snap.amountFcfa,
            batchId: snap.batchId,
            inputLotId: snap.inputLotId,
          }),
        );
        snap.saleItemId = item.id;
      }

      let depositFcfa = 0;
      if (dto.deposit) {
        await this.paymentsService.recordPayment(em, {
          farm,
          sale,
          method: dto.deposit.method ?? PaymentMethod.CASH,
          amountFcfa: dto.deposit.amountFcfa,
          paymentDate: dto.deposit.paymentDate,
          idempotencyKey: dto.deposit.idempotencyKey,
          operatorId: user.id,
        });
        depositFcfa = await this.paidSum(em, sale.id);
        if (depositFcfa >= total) {
          sale.status = SaleStatus.SETTLED;
          await saleRepo.save(sale);
        }
      }

      return orderRepo.save(
        orderRepo.create({
          farmId,
          referenceNumber: await this.nextReference(em, Order, ORDER_PREFIX),
          canal: dto.canal,
          saleId: sale.id,
          status: depositFcfa > 0 ? OrderStatus.CONFIRMED : OrderStatus.PENDING,
          idempotencyKey: dto.idempotencyKey ?? null,
          customerId,
          expectedDate: dto.expectedDate ?? null,
          pointOfSaleId: resolvedPointOfSaleId,
          address:
            dto.canal === OrderCanal.LIVRAISON ? (dto.address ?? null) : null,
          batchId: checkoutBatchId,
          totalAmountFcfa: total,
          depositFcfa,
          items: snapshots,
          createdById: user.id,
        }),
      );
    }).catch(async (err: unknown) => {
      // Deux créations concurrentes avec la même clé : l'index unique
      // (ferme, clé) tranche → on renvoie la commande existante.
      if (!dto.idempotencyKey || !isUniqueViolation(err)) throw err;
      const existing = await this.orderRepo.findOne({
        where: { farmId, idempotencyKey: dto.idempotencyKey },
      });
      if (existing) return existing;
      throw err;
    });

    await this.afterOrderChange(farmId, order.batchId ? [order.batchId] : []);
    return this.getOne(user, farmId, order.id);
  }

  // ---------- Acompte ----------

  async deposit(
    user: AuthUser,
    farmId: string,
    orderId: string,
    dto: OrderDepositDto,
  ) {
    const farm = await this.farmsService.assertAccessible(user, farmId);
    const order = await this.dataSource.transaction(async (em) => {
      const orderRepo = em.getRepository(Order);
      const saleRepo = em.getRepository(Sale);
      const current = await orderRepo.findOne({
        where: { id: orderId, farmId },
        lock: { mode: 'pessimistic_write' },
      });
      if (!current) throw new NotFoundException('Commande introuvable.');
      if (current.status === OrderStatus.CANCELLED) {
        throw new BadRequestException(
          'Commande annulée : aucun encaissement possible.',
        );
      }
      if (current.status === OrderStatus.LIVRE) {
        throw new BadRequestException(
          'Commande déjà livrée : régler le solde sur la vente associée.',
        );
      }
      const sale = await saleRepo.findOne({
        where: { id: current.saleId, farmId },
        lock: { mode: 'pessimistic_write' },
      });
      if (!sale) throw new NotFoundException('Vente associée introuvable.');
      if (sale.status === SaleStatus.CANCELLED) {
        throw new BadRequestException('La vente associée est annulée.');
      }

      await this.paymentsService.recordPayment(em, {
        farm,
        sale,
        method: dto.method ?? PaymentMethod.CASH,
        amountFcfa: dto.amountFcfa,
        paymentDate: dto.paymentDate,
        idempotencyKey: dto.idempotencyKey,
        operatorId: user.id,
      });
      const paid = await this.paidSum(em, sale.id);
      sale.status =
        paid >= sale.totalAmountFcfa
          ? SaleStatus.SETTLED
          : SaleStatus.OUTSTANDING;
      await saleRepo.save(sale);

      current.depositFcfa = paid;
      current.status = OrderStatus.CONFIRMED;
      return orderRepo.save(current);
    });

    await this.afterOrderChange(farmId, order.batchId ? [order.batchId] : []);
    return this.getOne(user, farmId, order.id);
  }

  // ---------- Livraison / facturation ----------

  async fulfil(
    user: AuthUser,
    farmId: string,
    orderId: string,
    dto: FinalizeOrderDto,
  ) {
    const farm = await this.farmsService.assertAccessible(user, farmId);
    const result = await this.dataSource.transaction(async (em) => {
      const orderRepo = em.getRepository(Order);
      const saleRepo = em.getRepository(Sale);
      const itemRepo = em.getRepository(SaleItem);
      const batchRepo = em.getRepository(ProductionBatch);

      const order = await orderRepo.findOne({
        where: { id: orderId, farmId },
        lock: { mode: 'pessimistic_write' },
      });
      if (!order) throw new NotFoundException('Commande introuvable.');
      if (order.status !== OrderStatus.CONFIRMED) {
        throw new BadRequestException(
          'Seule une commande confirmée peut être livrée (valider l’acompte ou la commande d’abord).',
        );
      }

      const sale = await saleRepo.findOne({
        where: { id: order.saleId, farmId },
        lock: { mode: 'pessimistic_write' },
      });
      if (!sale) throw new NotFoundException('Vente associée introuvable.');
      if (sale.status === SaleStatus.CANCELLED) {
        throw new BadRequestException('La vente associée est annulée.');
      }

      const items = await itemRepo.find({ where: { saleId: sale.id } });
      const byId = new Map(items.map((i) => [i.id, i]));

      const overrides = dto.items ?? [];
      const seen = new Set<string>();
      for (const o of overrides) {
        const item = byId.get(o.saleItemId);
        if (!item) {
          throw new BadRequestException(
            'Quantité finale : article de vente inconnu dans cette commande.',
          );
        }
        if (seen.has(o.saleItemId)) continue;
        seen.add(o.saleItemId);
        const isPieceKind =
          item.productType === SaleItemProductType.POULET_PIECE ||
          item.productType === SaleItemProductType.ABATTU_PIECE;
        if (isPieceKind) {
          // À la pièce, la quantité finale EST le nombre d'oiseaux : on
          // resynchronise pieceCount pour éviter un sous-décrément du cheptel.
          item.pieceCount = Math.ceil(o.quantity);
        } else if (o.pieceCount != null) {
          item.pieceCount = o.pieceCount;
        }
        item.quantity = o.quantity;
        item.amountFcfa = Math.round(o.quantity * item.unitPriceFcfa);
      }
      if (overrides.length > 0) await itemRepo.save(items);

      const batchBirds = new Map<string, number>();
      for (const item of items) {
        const birds = birdsOf(item);
        if (birds > 0) {
          if (!item.batchId) {
            throw new BadRequestException(
              'Article volaille sans lot rattaché : incohérence.',
            );
          }
          batchBirds.set(
            item.batchId,
            (batchBirds.get(item.batchId) ?? 0) + birds,
          );
        } else if (item.productType === SaleItemProductType.OEUFS) {
          // Exclut la vente enveloppe courante : ses items œufs existent déjà
          // et ne doivent pas compter comme « déjà vendus » contre eux-mêmes.
          await this.assertEggsAvailable(em, farmId, item.quantity, sale.id);
        }
      }

      const touchedBatches = await this.decrementFlock(
        em,
        batchRepo,
        farmId,
        batchBirds,
      );

      const total = items.reduce((s, i) => s + i.amountFcfa, 0);
      sale.totalAmountFcfa = total;
      const paid = await this.paidSum(em, sale.id);
      await this.refundDepositExcess(em, farmId, order, sale, total, paid);
      sale.status = paid >= total ? SaleStatus.SETTLED : SaleStatus.OUTSTANDING;
      await saleRepo.save(sale);

      if (dto.payment) {
        await this.paymentsService.recordPayment(em, {
          farm,
          sale,
          method: dto.payment.method ?? PaymentMethod.CASH,
          amountFcfa: dto.payment.amountFcfa,
          paymentDate: dto.payment.paymentDate,
          idempotencyKey: dto.payment.idempotencyKey,
          operatorId: user.id,
        });
        sale.status =
          (await this.paidSum(em, sale.id)) >= total
            ? SaleStatus.SETTLED
            : SaleStatus.OUTSTANDING;
        await saleRepo.save(sale);
      }

      // Synchronise l'instantané du bon de commande avec les quantités finales.
      for (const snap of order.items) {
        const item = byId.get(snap.saleItemId);
        if (!item) continue;
        snap.quantity = item.quantity;
        snap.pieceCount = item.pieceCount;
        snap.amountFcfa = item.amountFcfa;
      }
      // Le bon de commande reflète le montant réellement facturé.
      order.totalAmountFcfa = total;
      order.status = OrderStatus.LIVRE;
      order.livredAt = new Date();
      order.depositFcfa = Math.min(await this.paidSum(em, sale.id), total);
      await orderRepo.save(order);

      return { order, touchedBatches };
    });

    await this.afterOrderChange(farmId, result.touchedBatches);
    return this.getOne(user, farmId, result.order.id);
  }

  // ---------- Annulation (PROPRIÉTAIRE) ----------

  async cancel(
    user: AuthUser,
    farmId: string,
    orderId: string,
    reason?: string,
  ) {
    await this.farmsService.assertAccessible(user, farmId);
    // Transaction + verrou pessimiste sur la commande : sérialise avec
    // livrer/fulfil pour qu'une livraison concurrente ne soit pas écrasée.
    const result = await this.dataSource.transaction(async (em) => {
      const orderRepo = em.getRepository(Order);
      const order = await orderRepo.findOne({
        where: { id: orderId, farmId },
        lock: { mode: 'pessimistic_write' },
      });
      if (!order) throw new NotFoundException('Commande introuvable.');
      if (order.status === OrderStatus.CANCELLED) {
        throw new BadRequestException('Cette commande est déjà annulée.');
      }
      if (order.status === OrderStatus.LIVRE) {
        throw new BadRequestException(
          'Commande déjà livrée : annuler la vente associée si nécessaire.',
        );
      }
      // Les oiseaux n'ont jamais été décrémentés à la création : on ne réintègre
      // rien. Le remboursement des acomptes est géré par l'annulation de vente.
      // Même EntityManager → une seule unité de travail (annule + rembourse
      // ensemble, sinon une commande bloquée laisserait une vente annulée).
      await this.salesService.cancelInTransaction(
        em,
        user,
        farmId,
        order.saleId,
        reason ?? undefined,
        { skipStockRestore: true },
      );
      order.status = OrderStatus.CANCELLED;
      order.cancelledAt = new Date();
      order.cancelledReason = reason ?? null;
      await orderRepo.save(order);
      return order;
    });
    await this.afterOrderChange(farmId, result.batchId ? [result.batchId] : []);
    return this.getOne(user, farmId, result.id);
  }

  /**
   * Surpaiement d'acompte après réduction du total final : rembourse l'excédent
   * en caisse (mouvement OUT) et plafonne l'acompte retracé sur le bon.
   */
  private async refundDepositExcess(
    em: EntityManager,
    farmId: string,
    order: Order,
    sale: Sale,
    total: number,
    paid: number,
  ): Promise<void> {
    if (paid <= total) return;
    const excess = paid - total;
    const session = await em.getRepository(CashSession).findOne({
      where: { farmId, status: CashSessionStatus.OPEN },
      lock: { mode: 'pessimistic_write' },
    });
    if (!session) {
      throw new BadRequestException(
        `Le total final (${total} FCFA) est inférieur aux acomptes encaissés (${paid} FCFA) : ouvrir une session de caisse pour tracer le remboursement de ${excess} FCFA.`,
      );
    }
    const movements = await em.getRepository(CashMovement).find({
      where: { cashSessionId: session.id },
    });
    let inFcfa = 0;
    let outFcfa = 0;
    for (const m of movements) {
      if (m.type === CashMovementType.IN) inFcfa += m.amountFcfa;
      else outFcfa += m.amountFcfa;
    }
    const available = session.openingBalanceFcfa + inFcfa - outFcfa;
    if (excess > available) {
      throw new BadRequestException(
        `Remboursement du surplus d'acompte (${excess} FCFA) refusé : solde de caisse disponible ${available} FCFA. Une caisse ne peut pas être négative.`,
      );
    }
    await em.getRepository(CashMovement).save(
      em.getRepository(CashMovement).create({
        farmId,
        cashSessionId: session.id,
        type: CashMovementType.OUT,
        source: CashMovementSource.REFUND,
        amountFcfa: excess,
        reason: `Remboursement surplus d'acomptes commande ${order.referenceNumber}`,
        saleId: sale.id,
        movementDate: new Date().toISOString().slice(0, 10),
        createdById: order.createdById ?? null,
      }),
    );
  }

  // ---------- Lecture ----------

  async list(
    user: AuthUser,
    farmId: string,
    canal?: OrderCanal,
    status?: OrderStatus,
  ): Promise<Order[]> {
    await this.farmsService.assertAccessible(user, farmId);
    const qb = this.orderRepo
      .createQueryBuilder('order')
      .leftJoinAndSelect('order.customer', 'customer')
      .leftJoinAndSelect('order.batch', 'batch')
      .where('order.farm_id = :farmId', { farmId })
      .orderBy('order.created_at', 'DESC');
    if (canal) qb.andWhere('order.canal = :canal', { canal });
    if (status) qb.andWhere('order.status = :status', { status });
    return qb.getMany();
  }

  async getOne(user: AuthUser, farmId: string, orderId: string) {
    await this.farmsService.assertAccessible(user, farmId);
    const order = await this.orderRepo.findOne({
      where: { id: orderId, farmId },
      relations: { customer: true, batch: true },
    });
    if (!order) throw new NotFoundException('Commande introuvable.');
    const sale = await this.salesService.getOne(user, farmId, order.saleId);
    return { ...order, sale };
  }

  // ---------- PDF ----------

  async generateBonDeCommande(user: AuthUser, farmId: string, orderId: string) {
    const farm = await this.farmsService.assertAccessible(user, farmId);
    const order = await this.getOne(user, farmId, orderId);
    if (order.status === OrderStatus.CANCELLED) {
      throw new BadRequestException(
        'Impossible de générer un bon de commande pour une commande annulée.',
      );
    }
    const confirmed = order.sale.payments.filter(
      (p) => p.status === PaymentStatus.CONFIRMED,
    );
    const paid = confirmed.reduce((s, p) => s + p.amountFcfa, 0);
    return this.pdfService.createBonCommandePdf({
      farmName: farm.name,
      referenceNumber: order.referenceNumber,
      canalLabel: CANAL_LABELS[order.canal],
      expectedDate: order.expectedDate,
      customerName: order.customer?.fullName ?? null,
      address: order.address,
      batchLabel: order.batchId ? `Lot #${order.batchId.slice(0, 8)}` : null,
      items: order.items.map((item) => ({
        label: item.label,
        quantity: `${item.quantity} ${item.unit}`,
        unitPriceFcfa: item.unitPriceFcfa,
        amountFcfa: item.amountFcfa,
      })),
      totalAmountFcfa: order.totalAmountFcfa,
      depositFcfa: paid,
      remainingFcfa: Math.max(0, order.totalAmountFcfa - paid),
      method: confirmed[0]?.method ?? 'ESPECES',
    });
  }

  async generateReceipt(user: AuthUser, farmId: string, orderId: string) {
    await this.farmsService.assertAccessible(user, farmId);
    const order = await this.orderRepo.findOne({
      where: { id: orderId, farmId },
    });
    if (!order) throw new NotFoundException('Commande introuvable.');
    return this.salesService.generateReceipt(user, farmId, order.saleId);
  }

  // ---------- Helpers ----------

  private async afterOrderChange(farmId: string, batchIds: string[]) {
    const unique = [...new Set(batchIds.filter(Boolean))];
    await Promise.all([
      this.rentabiliteService.evaluateInvendus(farmId),
      Promise.all(
        unique.map((batchId) =>
          this.rentabiliteService.evaluateForBatch(farmId, batchId),
        ),
      ),
      Promise.all(
        unique.map((batchId) =>
          this.batchesService.runAdvisoryForBatch(batchId),
        ),
      ),
    ]);
    koukouBus.emit(KOUKOU_EVENTS.SALE_CHANGED, { farmId });
  }

  private async paidSum(em: EntityManager, saleId: string): Promise<number> {
    const payments = await em.getRepository(Payment).find({
      where: { saleId, status: PaymentStatus.CONFIRMED },
    });
    return payments.reduce((s, p) => s + p.amountFcfa, 0);
  }

  private async decrementFlock(
    em: EntityManager,
    batchRepo: Repository<ProductionBatch>,
    farmId: string,
    batchBirds: Map<string, number>,
  ): Promise<string[]> {
    const touched: string[] = [];
    for (const [batchId, birds] of batchBirds) {
      const batch = await batchRepo
        .createQueryBuilder('batch')
        .setLock('pessimistic_write')
        .where('batch.id = :id', { id: batchId })
        .andWhere('batch.farm_id = :farmId', { farmId })
        .getOne();
      if (!batch) {
        throw new BadRequestException(
          'Lot de production introuvable dans cette ferme.',
        );
      }
      if (batch.status === BatchStatus.CLOTURE) {
        throw new BadRequestException(
          'Impossible de livrer une commande qui affecte un lot clôturé (immuabilité).',
        );
      }
      if (batch.quantityAlive < birds) {
        throw new BadRequestException(
          `Stock insuffisant : il reste ${batch.quantityAlive} oiseau(x) vivant(s) au lot, livraison demandée ${birds}.`,
        );
      }
      batch.quantityAlive -= birds;
      if (batch.quantityAlive <= 0) {
        batch.status = BatchStatus.FINI;
      }
      await batchRepo.save(batch);
      touched.push(batchId);
    }
    return touched;
  }

  /** Lots commercialisables : EN_VENTE ou ACTIF auto-signalé « prêt à vendre ». */
  private async assertBatchOrderable(
    em: EntityManager,
    farmId: string,
    batchId: string,
  ): Promise<ProductionBatch> {
    const batch = await em
      .getRepository(ProductionBatch)
      .createQueryBuilder('batch')
      .setLock('pessimistic_write')
      .where('batch.id = :id', { id: batchId })
      .andWhere('batch.farm_id = :farmId', { farmId })
      .getOne();
    if (!batch) {
      throw new BadRequestException(
        'Lot de production introuvable dans cette ferme.',
      );
    }
    if (batch.status === BatchStatus.CLOTURE) {
      throw new BadRequestException(
        'Lot clôturé : aucune commande ne peut être rattachée.',
      );
    }
    if (batch.status === BatchStatus.FINI) {
      throw new BadRequestException(
        'Lot épuisé : aucune volaille disponible sur ce lot pour une nouvelle commande.',
      );
    }
    if (batch.status === BatchStatus.EN_VENTE) return batch;

    const metrics = await this.metricsService.compute(batch);
    if (!metrics.readyForSale) {
      throw new BadRequestException(
        'Ce lot n’est pas encore prêt à la vente : l’âge ou la performance (IC/mortalité) ne le permettent pas (auto-signal).',
      );
    }
    return batch;
  }

  /** Réservation souple : vivants − précommandes ouvertes (non livrées/annulées). */
  private async assertBirdsAvailable(
    em: EntityManager,
    farmId: string,
    batchId: string,
    batch: ProductionBatch,
    requested: number,
  ): Promise<void> {
    const open = await em.getRepository(Order).find({
      where: {
        farmId,
        batchId,
        status: Not(In([OrderStatus.CANCELLED, OrderStatus.LIVRE])),
      },
    });
    const reserved = open.reduce((sum, o) => {
      for (const it of o.items ?? []) {
        sum += birdsOf(it);
      }
      return sum;
    }, 0);
    const available = batch.quantityAlive - reserved;
    if (requested > available) {
      throw new BadRequestException(
        `Réserve insuffisante pour le lot : ${available} oiseau(x) disponible(s) (${reserved} déjà précommandé(s)), commande demandée ${requested}.`,
      );
    }
  }

  /** Garde de stock œufs (identique au POS/dashboard). */
  private async assertEggsAvailable(
    em: EntityManager,
    farmId: string,
    alveoles: number,
    excludeSaleId?: string,
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
    let sales = await em.getRepository(Sale).find({
      where: { farmId, status: Not(SaleStatus.CANCELLED) },
    });
    if (excludeSaleId) sales = sales.filter((s) => s.id !== excludeSaleId);
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
        )} alvéoles), commande demandée ${alveoles} alvéoles.`,
      );
    }
  }

  /** Trouve ou crée le client (jamais bloquant : la commande aboutit toujours). */
  private async resolveCustomer(
    em: EntityManager,
    farmId: string,
    operatorId: string,
    dto: CreateOrderDto,
  ): Promise<string | null> {
    const repo = em.getRepository(Customer);
    if (dto.customerId) {
      const customer = await repo.findOne({
        where: { id: dto.customerId, farmId },
      });
      if (!customer) {
        throw new BadRequestException('Client introuvable dans cette ferme.');
      }
      return customer.id;
    }
    if (dto.customerPhone) {
      const normalized = normalizePhone(dto.customerPhone);
      const candidates = await repo.find({
        where: { farmId },
        order: { createdAt: 'ASC' },
      });
      const existing = candidates.find(
        (c) => c.phone != null && normalizePhone(c.phone) === normalized,
      );
      if (existing) return existing.id;
      const created = await repo.save(
        repo.create({
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

  private async nextReference(
    em: EntityManager,
    entity: typeof Sale | typeof Order,
    prefix: string,
  ): Promise<string> {
    const repo = em.getRepository(entity as any);
    for (let attempt = 0; attempt < 5; attempt++) {
      const candidate = makeReference(prefix);
      const existing = await repo.findOne({
        where: { referenceNumber: candidate },
      });
      if (!existing) return candidate;
    }
    throw new BadRequestException(
      'Impossible de générer une référence unique. Réessayer.',
    );
  }
}
