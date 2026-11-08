import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { OrderStatus } from '../../common/enums/order-status.enum.js';
import { DataSource, EntityManager, In, IsNull, Repository } from 'typeorm';
import { UserRole } from '../../common/enums/role.enum.js';
import { AuthUser } from '../../common/decorators/current-user.decorator.js';
import { FarmsService } from '../farms/farms.service.js';
import { SaleStatus } from '../../common/enums/sale-status.enum.js';
import {
  PaymentMethod,
  PaymentStatus,
} from '../../common/enums/payment-method.enum.js';
import { ReferenceKey } from '../../common/enums/reference-key.enum.js';
import { CustomerType } from '../../common/enums/customer-type.enum.js';
import { ReferenceConstantsService } from '../reference-constants/reference-constants.service.js';
import { Customer } from './entities/customer.entity.js';
import { Sale } from './entities/sale.entity.js';
import { SaleItem } from './entities/sale-item.entity.js';
import { Payment } from './entities/payment.entity.js';
import { PaymentsService } from './payments.service.js';
import { CreateCustomerDto, UpdateCustomerDto } from './dto/customer.dto.js';

export interface CustomerBalance {
  totalInvoicedFcfa: number;
  paidFcfa: number;
  outstandingFcfa: number;
}

export type CustomerSegment = 'NOUVEAU' | 'REGULIER' | 'TOP';

export interface CustomerStats {
  visits: number;
  totalSpentFcfa: number;
  avgBasketFcfa: number;
  lastPurchaseDate: string | null;
  favorites: { productType: string; label: string; quantity: number }[];
  segment: CustomerSegment;
  balance: CustomerBalance;
}

export interface CustomerSummary {
  total: number;
  /** Nombre de clients avec un solde dû > 0. */
  debtors: number;
  totalInvoicedFcfa: number;
  paidFcfa: number;
  totalOutstandingFcfa: number;
  byType: Record<string, { count: number; outstandingFcfa: number }>;
  bySegment: Record<string, number>;
}

/** Normalise un numéro de téléphone (espaces et tirets ignorés). */
export function normalizePhone(phone: string): string {
  return phone.replace(/[\s-]/g, '');
}

function isUniqueViolation(err: unknown): boolean {
  return (err instanceof Error) && ((err as { code?: string }).code === '23505');
}

/**
 * Sales wrapped by an order that is not delivered yet: nothing is owed
 * before delivery (revenue is recognized there), and deposits go through
 * the order so its deposit and status stay right.
 */
const NOT_UNDELIVERED_ORDER = `NOT EXISTS (SELECT 1 FROM orders o WHERE o.sale_id = sale.id AND o.status IN ('${OrderStatus.PENDING}', '${OrderStatus.CONFIRMED}'))`;

/**
 * Amount paid on a customer's live sales, each sale capped at its total: an
 * over-paid order deposit refunded at delivery keeps its CONFIRMED payments,
 * and the surplus must not pay off the customer's other debts.
 */
function cappedPaidQuery(
  manager: EntityManager,
  farmId: string,
  customerId: string | null,
) {
  const qb = manager
    .createQueryBuilder()
    .select(
      'COALESCE(SUM(LEAST(sale.total_amount_fcfa, paid.amount)), 0)',
      'total',
    )
    .from('sales', 'sale')
    .innerJoin(
      (qb) =>
        qb
          .select('payment.sale_id', 'sale_id')
          .addSelect('SUM(payment.amount_fcfa)', 'amount')
          .from('payments', 'payment')
          .where('payment.status = :status', {
            status: PaymentStatus.CONFIRMED,
          })
          .groupBy('payment.sale_id'),
      'paid',
      'paid.sale_id = sale.id',
    )
    .where('sale.farm_id = :farmId', { farmId })
    .andWhere('sale.status != :cancelled', {
      cancelled: SaleStatus.CANCELLED,
    })
    .andWhere(NOT_UNDELIVERED_ORDER);
  if (customerId != null) {
    return qb.andWhere('sale.customer_id = :customerId', { customerId });
  }
  // Farm-wide variant: one row per customer.
  return qb
    .addSelect('sale.customer_id', 'customerId')
    .andWhere('sale.customer_id IS NOT NULL')
    .groupBy('sale.customer_id');
}

export function buildCustomerBalance(
  invoiced: number,
  paid: number,
): CustomerBalance {
  return {
    totalInvoicedFcfa: invoiced,
    paidFcfa: paid,
    outstandingFcfa: Math.max(0, invoiced - paid),
  };
}

@Injectable()
export class CustomersService {
  constructor(
    @InjectRepository(Customer)
    private readonly customerRepo: Repository<Customer>,
    private readonly farmsService: FarmsService,
    private readonly referenceConstants: ReferenceConstantsService,
    private readonly dataSource: DataSource,
    private readonly paymentsService: PaymentsService,
  ) {}

  // ── Création interne (transact sales / orders) ─────────────────────────────

  /**
   * Crée une fiche client dans le manager donné (même en transaction).
   * Génère un code CL-#### et applique le type par défaut (PARTICULIER).
   */
  async buildNew(
    manager: EntityManager,
    data: {
      farmId: string;
      fullName: string;
      phone?: string | null;
      email?: string | null;
      city?: string | null;
      notes?: string | null;
      type?: CustomerType;
      createdById?: string | null;
    },
  ): Promise<Customer> {
    const repo = manager.getRepository(Customer);
    for (let attempt = 0; attempt < 3; attempt++) {
      try {
        return await repo.save(
          repo.create({
            farmId: data.farmId,
            fullName: data.fullName.trim(),
            phone: data.phone ?? null,
            email: data.email ?? null,
            city: data.city ?? null,
            notes: data.notes ?? null,
            type: data.type ?? CustomerType.PARTICULIER,
            createdById: data.createdById ?? null,
            code: await this.nextCode(manager, data.farmId),
          }),
        );
      } catch (err) {
        if (isUniqueViolation(err) && attempt < 2) continue;
        throw new BadRequestException(
          'Impossible de créer le client. Réessayez.',
        );
      }
    }
    throw new BadRequestException('Impossible de créer le client. Réessayez.');
  }

  /** Assigne un code CL-#### à la volée si la fiche n'en possède pas (lignes legacy). */
  async ensureCode(customer: Customer, manager?: EntityManager): Promise<Customer> {
    if (customer.code) return customer;
    const em = manager ?? this.customerRepo.manager;
    const code = await this.nextCode(em, customer.farmId);
    try {
      // Only fills a still-empty code (no stale overwrite of a concurrent edit).
      const res = await em
        .getRepository(Customer)
        .update({ id: customer.id, code: IsNull() }, { code });
      if (res.affected) customer.code = code;
      else {
        const fresh = await em
          .getRepository(Customer)
          .findOneBy({ id: customer.id });
        if (fresh?.code) customer.code = fresh.code;
      }
    } catch (err) {
      // A concurrent reader took the same code: leave it for the next read.
      if (!isUniqueViolation(err)) throw err;
    }
    return customer;
  }

  // ── CRUD public ─────────────────────────────────────────────────────────────

  async create(
    user: AuthUser,
    farmId: string,
    dto: CreateCustomerDto,
  ): Promise<Customer> {
    await this.farmsService.assertAccessible(user, farmId);
    return this.buildNew(this.customerRepo.manager, {
      farmId,
      fullName: dto.fullName,
      phone: dto.phone,
      email: dto.email,
      city: dto.city,
      notes: dto.notes,
      type: dto.type,
      createdById: user.id,
    });
  }

  async update(
    user: AuthUser,
    farmId: string,
    customerId: string,
    dto: UpdateCustomerDto,
  ): Promise<Customer> {
    await this.farmsService.assertAccessible(user, farmId);
    const customer = await this.customerRepo.findOne({
      where: { id: customerId, farmId },
    });
    if (!customer) throw new NotFoundException('Client introuvable.');
    if (dto.fullName != null) customer.fullName = dto.fullName.trim();
    if (dto.phone != null)
      customer.phone = dto.phone ? normalizePhone(dto.phone) : null;
    if (dto.email != null) customer.email = dto.email;
    if (dto.city != null) customer.city = dto.city;
    if (dto.notes != null) customer.notes = dto.notes;
    if (dto.type != null) customer.type = dto.type;
    if (dto.operatorId !== undefined) {
      if (dto.operatorId) await this.assertOperator(farmId, dto.operatorId);
      customer.operatorId = dto.operatorId ?? null;
    }
    return this.customerRepo.save(customer);
  }

  /** An active operator of the farm's programme (traceability registry). */
  private async assertOperator(
    farmId: string,
    operatorId: string,
  ): Promise<void> {
    const rows: unknown[] = await this.customerRepo.query(
      `SELECT 1 FROM operators o JOIN farms f ON f.program_id = o.program_id
        WHERE o.id = $1 AND f.id = $2 AND o.active`,
      [operatorId, farmId],
    );
    if (rows.length === 0) {
      throw new BadRequestException('Opérateur inconnu ou inactif.');
    }
  }

  async list(user: AuthUser, farmId: string): Promise<Customer[]> {
    await this.farmsService.assertAccessible(user, farmId);
    return this.customerRepo.find({
      where: { farmId },
      order: { fullName: 'ASC' },
    });
  }

  async listWithBalances(
    user: AuthUser,
    farmId: string,
    opts?: { search?: string; type?: CustomerType; segment?: CustomerSegment },
  ): Promise<
    (Customer & { balance: CustomerBalance; segment: CustomerSegment })[]
  > {
    await this.farmsService.assertAccessible(user, farmId);
    const constants = await this.loadSegmentConstants();

    const qb = this.customerRepo
      .createQueryBuilder('c')
      .where('c.farmId = :farmId', { farmId });

    if (opts?.type) {
      qb.andWhere('c.type = :type', { type: opts.type });
    }
    if (opts?.search) {
      const like = `%${opts.search.trim()}%`;
      qb.andWhere('(LOWER(c.fullName) LIKE LOWER(:like) OR LOWER(c.phone) LIKE LOWER(:like))', { like });
    }

    const customers = await qb.orderBy('c.fullName', 'ASC').getMany();

    // backfill code des lignes legacy
    // (a read-only institution never writes).
    for (const c of customers) {
      if (!c.code && user.role !== UserRole.INSTITUTION) await this.ensureCode(c);
    }

    const rows = await this.customerRepo.manager
      .createQueryBuilder()
      .select('sale.customer_id', 'customerId')
      .addSelect('COUNT(*)', 'visits')
      .addSelect('COALESCE(SUM(sale.total_amount_fcfa), 0)', 'spent')
      .from('sales', 'sale')
      .where('sale.farm_id = :farmId', { farmId })
      .andWhere('sale.customer_id IS NOT NULL')
      .andWhere('sale.status != :cancelled', {
        cancelled: SaleStatus.CANCELLED,
      })
      .groupBy('sale.customer_id')
      .getRawMany();
    const byId = new Map<string, { visits: number; spent: number }>();
    for (const row of rows) {
      byId.set(row.customerId, {
        visits: Number(row.visits),
        spent: Number(row.spent),
      });
    }
    const finance = await this.getFarmCustomerFinance(farmId);
    const results = customers.map((c) => {
      const stats = byId.get(c.id) ?? { visits: 0, spent: 0 };
      return {
        ...c,
        balance: finance.get(c.id) ?? buildCustomerBalance(0, 0),
        segment: this.computeSegment(stats.visits, stats.spent, constants),
      };
    });

    if (opts?.segment) {
      return results.filter((r) => r.segment === opts.segment);
    }
    return results;
  }

  async summary(user: AuthUser, farmId: string): Promise<CustomerSummary> {
    await this.farmsService.assertAccessible(user, farmId);
    const customers = await this.customerRepo.find({ where: { farmId } });
    const constants = await this.loadSegmentConstants();

    const rows = await this.customerRepo.manager
      .createQueryBuilder()
      .select('sale.customer_id', 'customerId')
      .addSelect('COUNT(*)', 'visits')
      .addSelect('COALESCE(SUM(sale.total_amount_fcfa), 0)', 'spent')
      .from('sales', 'sale')
      .where('sale.farm_id = :farmId', { farmId })
      .andWhere('sale.customer_id IS NOT NULL')
      .andWhere('sale.status != :cancelled', {
        cancelled: SaleStatus.CANCELLED,
      })
      .groupBy('sale.customer_id')
      .getRawMany();
    const byId = new Map<string, { visits: number; spent: number }>();
    for (const row of rows) {
      byId.set(row.customerId, {
        visits: Number(row.visits),
        spent: Number(row.spent),
      });
    }

    const byType: Record<string, { count: number; outstandingFcfa: number }> = {};
    const bySegment: Record<string, number> = {};

    const finance = await this.getFarmCustomerFinance(farmId);
    const balances = customers.map(
      (c) => finance.get(c.id) ?? buildCustomerBalance(0, 0),
    );

    const totals = balances.reduce(
      (acc, b) => {
        if (b.outstandingFcfa > 0) acc.debtors++;
        acc.totalInvoicedFcfa += b.totalInvoicedFcfa;
        acc.paidFcfa += b.paidFcfa;
        acc.totalOutstandingFcfa += b.outstandingFcfa;
        return acc;
      },
      { debtors: 0, totalInvoicedFcfa: 0, paidFcfa: 0, totalOutstandingFcfa: 0 },
    );

    customers.forEach((c, i) => {
      const t = (c.type as string) ?? CustomerType.PARTICULIER;
      const stats = byId.get(c.id) ?? { visits: 0, spent: 0 };
      const segment = this.computeSegment(stats.visits, stats.spent, constants);

      byType[t] = byType[t] ?? { count: 0, outstandingFcfa: 0 };
      byType[t].count++;
      byType[t].outstandingFcfa += balances[i].outstandingFcfa;

      bySegment[segment] = (bySegment[segment] ?? 0) + 1;
    });

    return {
      total: customers.length,
      debtors: totals.debtors,
      totalInvoicedFcfa: totals.totalInvoicedFcfa,
      paidFcfa: totals.paidFcfa,
      totalOutstandingFcfa: totals.totalOutstandingFcfa,
      byType,
      bySegment,
    };
  }

  /** Solde à recouvrer : ventes non annulées − paiements confirmés. */
  async getBalance(
    user: AuthUser,
    farmId: string,
    customerId: string,
  ): Promise<CustomerBalance> {
    await this.farmsService.assertAccessible(user, farmId);
    await this.assertCustomerInFarm(farmId, customerId);
    return this.getCustomerFinance(farmId, customerId);
  }

  /** Profil d'un client : coordonnées + solde + segment. */
  async getOne(
    user: AuthUser,
    farmId: string,
    customerId: string,
  ): Promise<
    Customer & { balance: CustomerBalance; segment: CustomerSegment }
  > {
    await this.farmsService.assertAccessible(user, farmId);
    const customer = await this.customerRepo.findOne({
      where: { id: customerId, farmId },
    });
    if (!customer) throw new NotFoundException('Client introuvable.');
    if (user.role !== UserRole.INSTITUTION) await this.ensureCode(customer);
    const [balance, segment] = await Promise.all([
      this.getCustomerFinance(farmId, customerId),
      this.getSegment(farmId, customerId),
    ]);
    return { ...customer, balance, segment };
  }

  /** Historique d'achats : ventes non annulées avec articles et paiements. */
  async history(
    user: AuthUser,
    farmId: string,
    customerId: string,
  ): Promise<(Sale & { items: SaleItem[]; payments: Payment[] })[]> {
    await this.farmsService.assertAccessible(user, farmId);
    await this.assertCustomerInFarm(farmId, customerId);
    const manager = this.customerRepo.manager;
    const sales = await manager.getRepository(Sale).find({
      where: {
        farmId,
        customerId,
        status: In([SaleStatus.SETTLED, SaleStatus.OUTSTANDING]),
      },
      order: { saleDate: 'DESC', createdAt: 'DESC' },
      relations: { items: true },
    });
    const ids = sales.map((s) => s.id);
    const payments =
      ids.length > 0
        ? await manager.getRepository(Payment).find({
            where: { saleId: In(ids) },
            order: { paymentDate: 'ASC' },
          })
        : [];
    const bySaleId = new Map<string, Payment[]>();
    for (const p of payments) {
      const list = bySaleId.get(p.saleId) ?? [];
      list.push(p);
      bySaleId.set(p.saleId, list);
    }
    return sales.map((sale) => ({
      ...sale,
      payments: bySaleId.get(sale.id) ?? [],
    }));
  }

  /** Statistiques (visites, dépenses, panier moyen, favoris, segment). */
  async stats(
    user: AuthUser,
    farmId: string,
    customerId: string,
  ): Promise<CustomerStats> {
    await this.farmsService.assertAccessible(user, farmId);
    await this.assertCustomerInFarm(farmId, customerId);
    const manager = this.customerRepo.manager;
    const [constants, rows, favorites] = await Promise.all([
      this.loadSegmentConstants(),
      manager
        .createQueryBuilder()
        .select(`to_char(sale.sale_date, 'YYYY-MM-DD')`, 'saleDate')
        .addSelect('sale.total_amount_fcfa', 'total')
        .from('sales', 'sale')
        .where('sale.farm_id = :farmId', { farmId })
        .andWhere('sale.customer_id = :customerId', { customerId })
        .andWhere('sale.status != :cancelled', {
          cancelled: SaleStatus.CANCELLED,
        })
        .orderBy('sale.sale_date', 'ASC')
        .getRawMany(),
      manager
        .createQueryBuilder()
        .select('item.product_type', 'type')
        .addSelect('MAX(item.label)', 'label')
        .addSelect('SUM(item.quantity)', 'quantity')
        .from('sale_items', 'item')
        .innerJoin('sales', 'sale', 'sale.id = item.sale_id')
        .where('sale.farm_id = :farmId', { farmId })
        .andWhere('sale.customer_id = :customerId', { customerId })
        .andWhere('sale.status != :cancelled', {
          cancelled: SaleStatus.CANCELLED,
        })
        .groupBy('item.product_type')
        .orderBy('quantity', 'DESC')
        .limit(5)
        .getRawMany(),
    ]);
    const visits = rows.length;
    const totalSpentFcfa = rows.reduce((s, r) => s + Number(r.total), 0);
    const lastPurchaseDate =
      visits > 0 ? String(rows[visits - 1].saleDate) : null;
    const balance = await this.getCustomerFinance(farmId, customerId);
    return {
      visits,
      totalSpentFcfa,
      avgBasketFcfa: visits > 0 ? Math.round(totalSpentFcfa / visits) : 0,
      lastPurchaseDate,
      favorites: favorites.map((f) => ({
        productType: String(f.type),
        label: String(f.label ?? f.type),
        quantity: Number(f.quantity),
      })),
      segment: this.computeSegment(visits, totalSpentFcfa, constants),
      balance,
    };
  }

  /** Agrégats financiers d'un client (utilisé par le portefeuille P&L). */
  async getCustomerFinance(
    farmId: string,
    customerId: string,
    em?: EntityManager,
  ): Promise<CustomerBalance> {
    const manager = em ?? this.customerRepo.manager;

    const invoicedRow: { total: number } | undefined = await manager
      .createQueryBuilder()
      .select('COALESCE(SUM(sale.total_amount_fcfa), 0)', 'total')
      .from('sales', 'sale')
      .where('sale.customer_id = :customerId', { customerId })
      .andWhere('sale.farm_id = :farmId', { farmId })
      .andWhere('sale.status != :cancelled', {
        cancelled: SaleStatus.CANCELLED,
      })
      .andWhere(NOT_UNDELIVERED_ORDER)
      .getRawOne();

    const paidRow: { total: number } | undefined = await cappedPaidQuery(
      manager,
      farmId,
      customerId,
    ).getRawOne();

    return buildCustomerBalance(
      Number(invoicedRow?.total ?? 0),
      Number(paidRow?.total ?? 0),
    );
  }

  /**
   * Same figures as `getCustomerFinance` for every customer of the farm, in
   * two GROUP BY queries instead of two per customer. Customers without any
   * live sale are absent from the map (balance zero).
   */
  async getFarmCustomerFinance(
    farmId: string,
  ): Promise<Map<string, CustomerBalance>> {
    const manager = this.customerRepo.manager;
    const [invoicedRows, paidRows] = await Promise.all([
      manager
        .createQueryBuilder()
        .select('sale.customer_id', 'customerId')
        .addSelect('COALESCE(SUM(sale.total_amount_fcfa), 0)', 'total')
        .from('sales', 'sale')
        .where('sale.farm_id = :farmId', { farmId })
        .andWhere('sale.customer_id IS NOT NULL')
        .andWhere('sale.status != :cancelled', {
          cancelled: SaleStatus.CANCELLED,
        })
        .andWhere(NOT_UNDELIVERED_ORDER)
        .groupBy('sale.customer_id')
        .getRawMany<{ customerId: string; total: string | number }>(),
      cappedPaidQuery(manager, farmId, null).getRawMany<{
        customerId: string;
        total: string | number;
      }>(),
    ]);
    const invoiced = new Map<string, number>();
    for (const r of invoicedRows) invoiced.set(r.customerId, Number(r.total));
    const paid = new Map<string, number>();
    for (const r of paidRows) paid.set(r.customerId, Number(r.total));
    const out = new Map<string, CustomerBalance>();
    for (const id of new Set([...invoiced.keys(), ...paid.keys()])) {
      out.set(
        id,
        buildCustomerBalance(invoiced.get(id) ?? 0, paid.get(id) ?? 0),
      );
    }
    return out;
  }

  // ── Encaissement client ──────────────────────────────────────────────────

  /**
   * Encaissement depuis la fiche client : répartit le montant sur les ventes
   * impayées les plus anciennes (FIFO). Chaque versement crée un Payment
   * CONFIRMED et un mouvement de caisse SALE_PAYMENT (caisse ouverte requise).
   * Refuse si le montant dépasse le solde dû du client.
   */
  async recordCustomerPayment(
    user: AuthUser,
    farmId: string,
    customerId: string,
    amountFcfa: number,
    idempotencyKey?: string | null,
  ): Promise<{ payments: Payment[]; balance: CustomerBalance }> {
    const farm = await this.farmsService.assertAccessible(user, farmId);
    if (!Number.isFinite(amountFcfa) || amountFcfa <= 0) {
      throw new BadRequestException('Le montant doit être supérieur à zéro.');
    }
    return this.dataSource.transaction(async (em) => {
      const customer = await em.getRepository(Customer).findOne({
        where: { id: customerId, farmId },
      });
      if (!customer) throw new NotFoundException('Client introuvable.');

      // Idempotence de la file hors-ligne : la clé est dérivée par vente
      // (`clé:venteId`). Si au moins un versement de ce groupe existe déjà,
      // l'encaissement a été appliqué → on renvoie l'état courant sans rejouer.
      if (idempotencyKey) {
        const allSales = await em.getRepository(Sale).find({
          where: { farmId, customerId },
          select: { id: true },
        });
        const keys = allSales.map((s) => `${idempotencyKey}:${s.id}`);
        const existing = keys.length
          ? await em.getRepository(Payment).find({
              where: { farmId, idempotencyKey: In(keys) },
            })
          : [];
        if (existing.length > 0) {
          return {
            payments: existing,
            balance: await this.getCustomerFinance(farmId, customerId, em),
          };
        }
      }

      const outstanding = await this.outstandingExcluding(
        em,
        farmId,
        customerId,
      );
      if (amountFcfa > outstanding) {
        throw new BadRequestException(
          `Le montant (${amountFcfa.toLocaleString('fr-FR')} FCFA) dépasse le solde dû de ce client (${outstanding.toLocaleString('fr-FR')} FCFA).`,
        );
      }

      const sales = await em
        .getRepository(Sale)
        .createQueryBuilder('sale')
        .setLock('pessimistic_write')
        .where('sale.farm_id = :farmId', { farmId })
        .andWhere('sale.customer_id = :customerId', { customerId })
        .andWhere('sale.status = :status', { status: SaleStatus.OUTSTANDING })
        .andWhere(NOT_UNDELIVERED_ORDER)
        .orderBy('sale.created_at', 'ASC')
        .getMany();

      let remaining = amountFcfa;
      const payments: Payment[] = [];
      for (const sale of sales) {
        if (remaining <= 0) break;
        const saleRemaining = await this.paymentsService.computeRemainingDue(
          em,
          sale.id,
        );
        if (saleRemaining <= 0) continue;
        const payment = await this.paymentsService.recordPayment(em, {
          farm,
          sale,
          method: PaymentMethod.CASH,
          amountFcfa: Math.min(saleRemaining, remaining),
          idempotencyKey: idempotencyKey
            ? `${idempotencyKey}:${sale.id}`
            : null,
          operatorId: user.id,
        });
        payments.push(payment);
        remaining -= payment.amountFcfa;
        const nowRemaining = await this.paymentsService.computeRemainingDue(
          em,
          sale.id,
        );
        if (nowRemaining <= 0) {
          sale.status = SaleStatus.SETTLED;
          await em.getRepository(Sale).save(sale);
        }
      }

      return {
        payments,
        balance: await this.getCustomerFinance(farmId, customerId, em),
      };
    });
  }

  // ── Privés ──────────────────────────────────────────────────────────────────

  private async outstandingExcluding(
    manager: EntityManager,
    farmId: string,
    customerId: string,
    excludingSaleId?: string,
  ): Promise<number> {
    const invoicedQb = manager
      .createQueryBuilder()
      .select('COALESCE(SUM(sale.total_amount_fcfa), 0)', 'total')
      .from('sales', 'sale')
      .where('sale.farm_id = :farmId', { farmId })
      .andWhere('sale.customer_id = :customerId', { customerId })
      .andWhere('sale.status != :cancelled', { cancelled: SaleStatus.CANCELLED })
      .andWhere(NOT_UNDELIVERED_ORDER);
    if (excludingSaleId) invoicedQb.andWhere('sale.id != :exclude', { exclude: excludingSaleId });
    const invoiced = Number((await invoicedQb.getRawOne())?.total ?? 0);

    const paidQb = cappedPaidQuery(manager, farmId, customerId);
    if (excludingSaleId) paidQb.andWhere('sale.id != :exclude', { exclude: excludingSaleId });
    const paid = Number((await paidQb.getRawOne())?.total ?? 0);

    return Math.max(0, invoiced - paid);
  }

  private async nextCode(manager: EntityManager, farmId: string): Promise<string> {
    const repo = manager.getRepository(Customer);
    const rows = await repo
      .createQueryBuilder('c')
      .select('c.code')
      .where('c.farmId = :farmId', { farmId })
      .andWhere('c.code IS NOT NULL')
      .getMany();
    let max = 0;
    for (const r of rows) {
      const m = /^CL-(\d+)$/.exec(r.code ?? '');
      if (m) max = Math.max(max, parseInt(m[1], 10));
    }
    return `CL-${String(max + 1).padStart(4, '0')}`;
  }

  private async getSegment(
    farmId: string,
    customerId: string,
  ): Promise<CustomerSegment> {
    const constants = await this.loadSegmentConstants();
    const row: { visits?: string; spent?: string } | undefined =
      await this.customerRepo.manager
        .createQueryBuilder()
        .select('COUNT(*)', 'visits')
        .addSelect('COALESCE(SUM(sale.total_amount_fcfa), 0)', 'spent')
        .from('sales', 'sale')
        .where('sale.farm_id = :farmId', { farmId })
        .andWhere('sale.customer_id = :customerId', { customerId })
        .andWhere('sale.status != :cancelled', {
          cancelled: SaleStatus.CANCELLED,
        })
        .getRawOne();
    return this.computeSegment(
      Number(row?.visits ?? 0),
      Number(row?.spent ?? 0),
      constants,
    );
  }

  private async loadSegmentConstants(): Promise<{
    topMinVisits: number;
    topMinFcfa: number;
    regularMinVisits: number;
  }> {
    const [topMinVisits, topMinFcfa, regularMinVisits] = await Promise.all([
      this.referenceConstants.get(
        ReferenceKey.CUSTOMER_SEGMENT_TOP_MIN_VISITS,
        6,
      ),
      this.referenceConstants.get(
        ReferenceKey.CUSTOMER_SEGMENT_TOP_MIN_FCFA,
        100000,
      ),
      this.referenceConstants.get(
        ReferenceKey.CUSTOMER_SEGMENT_REGULAR_MIN_VISITS,
        2,
      ),
    ]);
    return { topMinVisits, topMinFcfa, regularMinVisits };
  }

  private computeSegment(
    visits: number,
    totalSpentFcfa: number,
    constants: {
      topMinVisits: number;
      topMinFcfa: number;
      regularMinVisits: number;
    },
  ): CustomerSegment {
    if (visits === 0) return 'NOUVEAU';
    if (
      visits >= constants.topMinVisits ||
      totalSpentFcfa >= constants.topMinFcfa
    ) {
      return 'TOP';
    }
    if (visits >= constants.regularMinVisits) return 'REGULIER';
    return 'NOUVEAU';
  }

  private async assertCustomerInFarm(
    farmId: string,
    customerId: string,
  ): Promise<Customer> {
    const customer = await this.customerRepo.findOne({
      where: { id: customerId, farmId },
    });
    if (!customer) throw new NotFoundException('Client introuvable.');
    return customer;
  }
}