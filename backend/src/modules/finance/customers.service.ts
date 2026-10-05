import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { DataSource, EntityManager, In, Repository } from 'typeorm';
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
    customer.code = await this.nextCode(em, customer.farmId);
    return em.save(customer);
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
    return this.customerRepo.save(customer);
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
    for (const c of customers) {
      if (!c.code) await this.ensureCode(c);
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
    const results = await Promise.all(
      customers.map(async (c) => {
        const stats = byId.get(c.id) ?? { visits: 0, spent: 0 };
        return {
          ...c,
          balance: await this.getCustomerFinance(farmId, c.id),
          segment: this.computeSegment(stats.visits, stats.spent, constants),
        };
      }),
    );

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

    const balances = await Promise.all(
      customers.map((c) => this.getCustomerFinance(farmId, c.id)),
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
    await this.ensureCode(customer);
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
      .getRawOne();

    const paidRow: { total: number } | undefined = await manager
      .createQueryBuilder()
      .select('COALESCE(SUM(payment.amount_fcfa), 0)', 'total')
      .from('payments', 'payment')
      .innerJoin('sales', 'sale', 'sale.id = payment.sale_id')
      .where('sale.customer_id = :customerId', { customerId })
      .andWhere('sale.farm_id = :farmId', { farmId })
      .andWhere('sale.status != :cancelled', {
        cancelled: SaleStatus.CANCELLED,
      })
      .andWhere('payment.status = :status', {
        status: PaymentStatus.CONFIRMED,
      })
      .getRawOne();

    const invoiced = Number(invoicedRow?.total ?? 0);
    const paid = Number(paidRow?.total ?? 0);
    return {
      totalInvoicedFcfa: invoiced,
      paidFcfa: paid,
      outstandingFcfa: Math.max(0, invoiced - paid),
    };
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
      .andWhere('sale.status != :cancelled', { cancelled: SaleStatus.CANCELLED });
    if (excludingSaleId) invoicedQb.andWhere('sale.id != :exclude', { exclude: excludingSaleId });
    const invoiced = Number((await invoicedQb.getRawOne())?.total ?? 0);

    const paidQb = manager
      .createQueryBuilder()
      .select('COALESCE(SUM(payment.amount_fcfa), 0)', 'total')
      .from('payments', 'payment')
      .innerJoin('sales', 'sale', 'sale.id = payment.sale_id')
      .where('sale.farm_id = :farmId', { farmId })
      .andWhere('sale.customer_id = :customerId', { customerId })
      .andWhere('sale.status != :cancelled', { cancelled: SaleStatus.CANCELLED })
      .andWhere('payment.status = :status', { status: PaymentStatus.CONFIRMED });
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