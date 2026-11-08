import {
  ConflictException,
  ForbiddenException,
  Injectable,
  Logger,
  OnApplicationBootstrap,
  OnModuleDestroy,
} from '@nestjs/common';
import { DataSource, EntityManager } from 'typeorm';
import type { AuthUser } from '../../common/decorators/current-user.decorator.js';
import { AuditAction } from '../../common/enums/audit-action.enum.js';
import {
  AlertKind,
  AlertLevel,
} from '../../common/enums/alert-level.enum.js';
import { OrderStatus } from '../../common/enums/order-status.enum.js';
import { PaymentStatus } from '../../common/enums/payment-method.enum.js';
import { SaleStatus } from '../../common/enums/sale-status.enum.js';
import { APP_TIME_ZONE, todayLocal } from '../../common/utils/date.utils.js';
import { AlertsService } from '../alerts/alerts.service.js';
import { AuditService } from '../audit/audit.service.js';
import { FarmsService } from '../farms/farms.service.js';
import { Customer } from './entities/customer.entity.js';
import { Farm } from '../farms/entities/farm.entity.js';
import {
  creditRefusalMessage,
  dueDateOf,
  isLimitReached,
  summarizeCredit,
  type UnpaidInvoice,
} from './credit.js';

/** Permission code that lets a user push a sale/order past the ceiling. */
export const CREDIT_OVERRIDE_PERMISSION = 'vente:depasser-credit';
/** Machine-readable code of the refusal (mobile rejected list, web message). */
export const CREDIT_LIMIT_EXCEEDED = 'PLAFOND_CREDIT';

const SWEEP_INTERVAL_MS = 60 * 60 * 1000;

/** Credit figures attached to a customer (list, profile, balance). */
export interface CustomerCreditView {
  /** Ceiling in force: the customer's own, else the farm default (null = none). */
  effectiveCreditLimitFcfa: number | null;
  /** Payment term in force: the customer's own, else the farm default. */
  effectivePaymentTermDays: number | null;
  outstandingFcfa: number;
  overdueAmount: number;
  oldestOverdueDays: number;
  /** « Plafond atteint ». */
  limitReached: boolean;
  /** « En retard ». */
  overdue: boolean;
}

interface InvoiceRow extends UnpaidInvoice {
  saleId: string;
  customerId: string;
}

@Injectable()
export class CreditService implements OnApplicationBootstrap, OnModuleDestroy {
  private readonly logger = new Logger(CreditService.name);
  private timer?: NodeJS.Timeout;

  constructor(
    private readonly dataSource: DataSource,
    private readonly farmsService: FarmsService,
    private readonly alertsService: AlertsService,
    private readonly audit: AuditService,
  ) {}

  onApplicationBootstrap() {
    if (process.env.CREDIT_SWEEP_DISABLED === 'true') return;
    const run = () =>
      void this.sweep().catch((err) =>
        this.logger.error('Balayage des créances en retard', err),
      );
    run();
    this.timer = setInterval(run, SWEEP_INTERVAL_MS);
    this.timer.unref();
  }

  onModuleDestroy() {
    if (this.timer) clearInterval(this.timer);
  }

  // ── Invoices (delivered, same rule as the customer balance) ─────────────

  /**
   * Live sales of a farm with the amount still due on each, the invoice day
   * being the delivery day (Libreville) of an order, else the sale date. An
   * undelivered order owes nothing yet, exactly like the balance.
   */
  private async loadInvoices(
    manager: EntityManager,
    farmId: string,
    opts: {
      customerId?: string;
      excludeSaleId?: string;
      unpaidOnly: boolean;
    },
  ): Promise<InvoiceRow[]> {
    const params: unknown[] = [
      farmId,
      SaleStatus.CANCELLED,
      PaymentStatus.CONFIRMED,
      [OrderStatus.PENDING, OrderStatus.CONFIRMED],
      APP_TIME_ZONE,
    ];
    let where = '';
    if (opts.customerId) {
      params.push(opts.customerId);
      where += ` AND sale.customer_id = $${params.length}`;
    }
    if (opts.excludeSaleId) {
      params.push(opts.excludeSaleId);
      where += ` AND sale.id <> $${params.length}`;
    }
    if (opts.unpaidOnly) {
      where += ' AND sale.total_amount_fcfa > COALESCE(p.paid, 0)';
    }
    const rows: {
      saleId: string;
      customerId: string;
      remaining: string | number;
      baseDate: string;
    }[] = await manager.query(
      `SELECT sale.id AS "saleId", sale.customer_id AS "customerId",
              (sale.total_amount_fcfa - LEAST(sale.total_amount_fcfa, COALESCE(p.paid, 0)))::int AS "remaining",
              COALESCE(
                ((SELECT MAX(o.livred_at) FROM orders o WHERE o.sale_id = sale.id) AT TIME ZONE $5)::date,
                sale.sale_date
              )::text AS "baseDate"
         FROM sales sale
         LEFT JOIN (
           SELECT sale_id, SUM(amount_fcfa) AS paid
             FROM payments WHERE status = $3 GROUP BY sale_id
         ) p ON p.sale_id = sale.id
        WHERE sale.farm_id = $1
          AND sale.customer_id IS NOT NULL
          AND sale.status <> $2
          AND NOT EXISTS (
            SELECT 1 FROM orders o WHERE o.sale_id = sale.id AND o.status::text = ANY($4)
          )${where}`,
      params,
    );
    return rows.map((r) => ({
      saleId: r.saleId,
      customerId: r.customerId,
      remainingFcfa: Number(r.remaining),
      baseDate: String(r.baseDate).slice(0, 10),
    }));
  }

  private viewOf(
    customer: Pick<Customer, 'creditLimitFcfa' | 'paymentTermDays'>,
    farm: Pick<Farm, 'defaultCreditLimitFcfa' | 'defaultPaymentTermDays'>,
    invoices: readonly UnpaidInvoice[],
    today: string,
  ): CustomerCreditView {
    const limit = customer.creditLimitFcfa ?? farm.defaultCreditLimitFcfa ?? null;
    const term = customer.paymentTermDays ?? farm.defaultPaymentTermDays ?? null;
    const s = summarizeCredit(invoices, term, today);
    return {
      effectiveCreditLimitFcfa: limit,
      effectivePaymentTermDays: term,
      outstandingFcfa: s.outstandingFcfa,
      overdueAmount: s.overdueAmount,
      oldestOverdueDays: s.oldestOverdueDays,
      limitReached: isLimitReached(s.outstandingFcfa, limit),
      overdue: s.overdueAmount > 0,
    };
  }

  // ── Read side (customer list, profile, statement) ───────────────────────

  /** Credit figures of the given customers of one farm, in one query. */
  async viewsFor(
    farmId: string,
    customers: readonly Pick<
      Customer,
      'id' | 'creditLimitFcfa' | 'paymentTermDays'
    >[],
  ): Promise<Map<string, CustomerCreditView>> {
    const farm = await this.loadFarmDefaults(this.dataSource.manager, farmId);
    const invoices = await this.loadInvoices(this.dataSource.manager, farmId, {
      unpaidOnly: true,
    });
    const byCustomer = new Map<string, InvoiceRow[]>();
    for (const inv of invoices) {
      const list = byCustomer.get(inv.customerId) ?? [];
      list.push(inv);
      byCustomer.set(inv.customerId, list);
    }
    const today = todayLocal();
    return new Map(
      customers.map((c) => [
        c.id,
        this.viewOf(c, farm, byCustomer.get(c.id) ?? [], today),
      ]),
    );
  }

  /** Statement lines: due date and lateness of each sale of a customer. */
  async statementOf(
    farmId: string,
    customer: Pick<Customer, 'id' | 'paymentTermDays'>,
  ): Promise<
    Map<
      string,
      { dueDate: string | null; remainingFcfa: number; overdue: boolean }
    >
  > {
    const farm = await this.loadFarmDefaults(this.dataSource.manager, farmId);
    const term = customer.paymentTermDays ?? farm.defaultPaymentTermDays ?? null;
    const invoices = await this.loadInvoices(this.dataSource.manager, farmId, {
      customerId: customer.id,
      unpaidOnly: false,
    });
    const today = todayLocal();
    return new Map(
      invoices.map((inv) => {
        const dueDate = dueDateOf(inv.baseDate, term);
        return [
          inv.saleId,
          {
            dueDate,
            remainingFcfa: inv.remainingFcfa,
            overdue: inv.remainingFcfa > 0 && dueDate != null && dueDate < today,
          },
        ];
      }),
    );
  }

  private async loadFarmDefaults(
    manager: EntityManager,
    farmId: string,
  ): Promise<Pick<Farm, 'defaultCreditLimitFcfa' | 'defaultPaymentTermDays'>> {
    const farm = await manager.getRepository(Farm).findOne({
      where: { id: farmId },
      select: { id: true, defaultCreditLimitFcfa: true, defaultPaymentTermDays: true },
    });
    return {
      defaultCreditLimitFcfa: farm?.defaultCreditLimitFcfa ?? null,
      defaultPaymentTermDays: farm?.defaultPaymentTermDays ?? null,
    };
  }

  // ── Write side: the ceiling ─────────────────────────────────────────────

  /**
   * Refuses (409 `PLAFOND_CREDIT`) a sale or an order that would push the
   * customer's outstanding balance past the ceiling. `newUnpaidFcfa` is what
   * stays unpaid after the cash collected now: a fully paid operation is never
   * blocked. `excludeSaleId` is the sale being booked (already inserted).
   * With `override`, only a user holding `vente:depasser-credit` (owner and
   * platform admin included) goes through, and the override is journaled.
   */
  async assertCreditAllowed(
    em: EntityManager,
    user: AuthUser,
    input: {
      farmId: string;
      customerId: string | null;
      newUnpaidFcfa: number;
      excludeSaleId?: string;
      override?: boolean;
      /** What is being booked, for the journal. */
      operation: string;
    },
  ): Promise<void> {
    const { farmId, customerId, newUnpaidFcfa } = input;
    if (!customerId || newUnpaidFcfa <= 0) return;
    const customer = await em.getRepository(Customer).findOne({
      where: { id: customerId, farmId },
    });
    if (!customer) return;
    const farm = await this.loadFarmDefaults(em, farmId);
    const limit = customer.creditLimitFcfa ?? farm.defaultCreditLimitFcfa;
    if (limit == null) return;

    // Two operations on the same customer must not both pass on a stale balance.
    await em.query('SELECT pg_advisory_xact_lock(hashtext($1))', [
      `credit:${customerId}`,
    ]);
    const invoices = await this.loadInvoices(em, farmId, {
      customerId,
      excludeSaleId: input.excludeSaleId,
      unpaidOnly: true,
    });
    const outstanding = invoices.reduce((s, i) => s + i.remainingFcfa, 0);
    if (outstanding + newUnpaidFcfa <= limit) return;

    const message = creditRefusalMessage(outstanding, limit, newUnpaidFcfa);
    const canOverride = await this.mayOverride(user, farmId);
    if (!input.override) {
      throw new ConflictException({
        statusCode: 409,
        error: 'Conflict',
        message,
        code: CREDIT_LIMIT_EXCEEDED,
        outstandingFcfa: outstanding,
        creditLimitFcfa: limit,
        requestedFcfa: newUnpaidFcfa,
        overridable: canOverride,
      });
    }
    if (!canOverride) {
      throw new ForbiddenException(
        `${message} Vous n’avez pas le droit de dépasser le plafond de crédit.`,
      );
    }
    await this.audit.record({
      action: AuditAction.SYSTEM,
      method: 'SYSTEM',
      route: 'CREDIT_LIMIT_OVERRIDE',
      actorUserId: user.id,
      actorRole: user.role,
      farmId,
      summary: {
        customerId,
        operation: input.operation,
        outstandingFcfa: outstanding,
        creditLimitFcfa: limit,
        newUnpaidFcfa,
      },
    });
  }

  private async mayOverride(user: AuthUser, farmId: string): Promise<boolean> {
    const eff = await this.farmsService.resolveEffectivePermissions(user, farmId);
    if (eff === 'ALL') return true;
    return eff != null && eff.permissions.has(CREDIT_OVERRIDE_PERMISSION);
  }

  // ── Overdue alert ───────────────────────────────────────────────────────

  /**
   * Raises (deduped: one active alert per farm) or clears the « créances en
   * retard » alert from the farm's unpaid invoices and payment terms.
   */
  async refreshOverdueAlert(farmId: string): Promise<void> {
    const customers = await this.dataSource.getRepository(Customer).find({
      where: { farmId },
      select: { id: true, creditLimitFcfa: true, paymentTermDays: true },
    });
    const views = await this.viewsFor(farmId, customers);
    let late = 0;
    let amount = 0;
    let oldest = 0;
    for (const v of views.values()) {
      if (!v.overdue) continue;
      late += 1;
      amount += v.overdueAmount;
      oldest = Math.max(oldest, v.oldestOverdueDays);
    }
    if (late === 0) {
      await this.alertsService.clearKind(farmId, null, AlertKind.CREANCE_RETARD);
      return;
    }
    await this.alertsService.raise(
      {
        kind: AlertKind.CREANCE_RETARD,
        level: AlertLevel.JAUNE,
        message: `${late} client${late > 1 ? 's' : ''} en retard de paiement : ${amount.toLocaleString('fr-FR')} FCFA impayés au-delà du délai (le plus ancien : ${oldest} jour${oldest > 1 ? 's' : ''} de retard).`,
        recommendation:
          'Relancer ces clients et faire encaisser les factures échues avant de leur accorder de nouveau du crédit.',
        context: { customers: late, overdueAmount: amount },
      },
      { farmId },
      { keepAcknowledgedIfUnchanged: true },
    );
  }

  /** Re-evaluates the overdue alert of every farm that uses payment terms. */
  async sweep(): Promise<number> {
    const rows: { id: string }[] = await this.dataSource.query(
      `SELECT id FROM farms WHERE default_payment_term_days IS NOT NULL
       UNION
       SELECT farm_id AS id FROM customers WHERE payment_term_days IS NOT NULL`,
    );
    for (const { id } of rows) {
      await this.refreshOverdueAlert(id).catch((err) =>
        this.logger.error(`Alerte créances en retard (ferme ${id})`, err),
      );
    }
    return rows.length;
  }
}
