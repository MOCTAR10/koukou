import { BadRequestException, Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { EntityManager, Repository } from 'typeorm';
import { AuthUser } from '../../common/decorators/current-user.decorator.js';
import {
  PaymentMethod,
  PaymentStatus,
} from '../../common/enums/payment-method.enum.js';
import {
  CashMovementSource,
  CashMovementType,
} from '../../common/enums/cash-session-status.enum.js';
import { FarmsService } from '../farms/farms.service.js';
import { Farm } from '../farms/entities/farm.entity.js';
import { Payment } from './entities/payment.entity.js';
import { CashMovement } from './entities/cash-movement.entity.js';
import { PaymentMethodConfig } from './entities/payment-method.entity.js';
import { CashSession } from './entities/cash-session.entity.js';
import { CashSessionStatus } from '../../common/enums/cash-session-status.enum.js';
import { Sale } from './entities/sale.entity.js';
import { AccountingService } from '../accounting/accounting.service.js';
import { cashAccountForMethod } from '../accounting/posting-map.js';

export interface RecordPaymentInput {
  farm: Farm;
  sale: Sale;
  method: PaymentMethod;
  amountFcfa: number;
  paymentDate?: string;
  idempotencyKey?: string | null;
  operatorId: string;
}

const DISABLED_METHOD_MESSAGE: Record<PaymentMethod, string> = {
  [PaymentMethod.CASH]:
    'Le règlement en espèces est indisponible. Vérifier la configuration.',
  [PaymentMethod.MOBILE_MONEY]:
    'Le paiement mobile (Airtel Money / Moov Money) arrive bientôt. Encaissement en espèces uniquement pour le moment.',
  [PaymentMethod.QR_CODE]:
    'Le paiement par QR code arrive bientôt. Encaissement en espèces uniquement pour le moment.',
};

@Injectable()
export class PaymentsService {
  constructor(
    @InjectRepository(Payment)
    private readonly paymentRepo: Repository<Payment>,
    @InjectRepository(PaymentMethodConfig)
    private readonly methodRepo: Repository<PaymentMethodConfig>,
    private readonly farmsService: FarmsService,
    private readonly accountingService: AccountingService,
  ) {}

  async listPaymentMethods(): Promise<PaymentMethodConfig[]> {
    return this.methodRepo.find({ order: { sortOrder: 'ASC' } });
  }

  /** Le POS expose CASH par défaut ; les autres méthodes apparaissent en « Bientôt disponible ». */
  async assertMethodEnabled(
    method: PaymentMethod,
    em: EntityManager,
  ): Promise<PaymentMethodConfig> {
    const repo = em.getRepository(PaymentMethodConfig);
    const config = await repo.findOne({ where: { code: method } });
    const fallback: PaymentMethodConfig = {
      code: method,
      label: method === PaymentMethod.CASH ? 'Espèces' : method,
      enabled: method === PaymentMethod.CASH,
      displayHint: null,
      sortOrder: method === PaymentMethod.CASH ? 0 : 1,
      id: '',
      createdAt: new Date(0),
      updatedAt: new Date(0),
    };
    const effective = config ?? fallback;
    if (!effective.enabled) {
      throw new BadRequestException(DISABLED_METHOD_MESSAGE[method]);
    }
    return effective;
  }

  async recordPayment(
    em: EntityManager,
    input: RecordPaymentInput,
  ): Promise<Payment> {
    const method = input.method ?? PaymentMethod.CASH;
    await this.assertMethodEnabled(method, em);

    const paymentRepo = em.getRepository(Payment);
    const movementRepo = em.getRepository(CashMovement);

    if (input.idempotencyKey) {
      const existing = await paymentRepo.findOne({
        where: {
          farmId: input.farm.id,
          saleId: input.sale.id,
          idempotencyKey: input.idempotencyKey,
        },
      });
      if (existing) return existing;
    }

    const remaining = await this.computeRemainingDue(em, input.sale.id);
    if (input.amountFcfa > remaining) {
      throw new BadRequestException(
        `Le montant (${input.amountFcfa} FCFA) dépasse le solde restant dû (${remaining} FCFA).`,
      );
    }

    let cashSession: CashSession | null = null;
    if (method === PaymentMethod.CASH) {
      cashSession = await em.getRepository(CashSession).findOne({
        where: { farmId: input.farm.id, status: CashSessionStatus.OPEN },
      });
      if (!cashSession) {
        throw new BadRequestException(
          'Aucune session de caisse ouverte : ouvrir la caisse journalière avant tout encaissement en espèces.',
        );
      }
    }

    const payment = await paymentRepo.save(
      paymentRepo.create({
        farmId: input.farm.id,
        saleId: input.sale.id,
        amountFcfa: input.amountFcfa,
        method,
        status: PaymentStatus.CONFIRMED,
        paymentDate: input.paymentDate ?? new Date().toISOString().slice(0, 10),
        idempotencyKey: input.idempotencyKey ?? null,
        cashSessionId: cashSession?.id ?? null,
        operatorId: input.operatorId,
      }),
    );

    if (cashSession) {
      await movementRepo.save(
        movementRepo.create({
          farmId: input.farm.id,
          cashSessionId: cashSession.id,
          type: CashMovementType.IN,
          source: CashMovementSource.SALE_PAYMENT,
          amountFcfa: input.amountFcfa,
          reason: `Encaissement vente ${input.sale.referenceNumber}`,
          saleId: input.sale.id,
          movementDate:
            input.paymentDate ?? new Date().toISOString().slice(0, 10),
          createdById: input.operatorId,
        }),
      );
    }

    // Comptabilité : encaissement → Caisse / Client (idempotent par paiement).
    await this.accountingService.post(em, {
      farmId: input.farm.id,
      date: input.paymentDate ?? new Date().toISOString().slice(0, 10),
      label: `Encaissement vente ${input.sale.referenceNumber}`,
      source: 'PAYMENT',
      sourceId: `payment:${payment.id}`,
      lines: [
        { account: cashAccountForMethod(method), debit: input.amountFcfa, label: 'Caisse — espèces' },
        { account: '411', credit: input.amountFcfa, label: 'Clients — créances' },
      ],
      operatorId: input.operatorId,
    });

    return payment;
  }

  async computeRemainingDue(
    em: EntityManager,
    saleId: string,
  ): Promise<number> {
    const payments = await em.getRepository(Payment).find({
      where: { saleId, status: PaymentStatus.CONFIRMED },
    });
    const paid = payments.reduce((s, p) => s + p.amountFcfa, 0);
    const sale = await em
      .getRepository(Sale)
      .findOne({ where: { id: saleId } });
    const total = sale?.totalAmountFcfa ?? 0;
    return Math.max(0, total - paid);
  }

  async listPayments(
    user: AuthUser,
    farmId: string,
    from?: string,
    to?: string,
    saleId?: string,
  ): Promise<Payment[]> {
    await this.farmsService.assertAccessible(user, farmId);
    const qb = this.paymentRepo
      .createQueryBuilder('payment')
      .where('payment.farm_id = :farmId', { farmId })
      .orderBy('payment.payment_date', 'DESC')
      .addOrderBy('payment.created_at', 'DESC');
    if (from) qb.andWhere('payment.payment_date >= :from', { from });
    if (to) qb.andWhere('payment.payment_date <= :to', { to });
    if (saleId) qb.andWhere('payment.sale_id = :saleId', { saleId });
    return qb.getMany();
  }
}
