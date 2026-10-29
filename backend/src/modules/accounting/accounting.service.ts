import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import {
  DataSource,
  EntityManager,
  In,
  LessThanOrEqual,
  Like,
  Repository,
} from 'typeorm';
import { AuthUser } from '../../common/decorators/current-user.decorator.js';
import { PaymentStatus } from '../../common/enums/payment-method.enum.js';
import { SaleItemProductType } from '../../common/enums/sale-item-type.enum.js';
import {
  CashMovementSource,
  CashMovementType,
} from '../../common/enums/cash-session-status.enum.js';
import { SaleStatus } from '../../common/enums/sale-status.enum.js';
import { FeedUnit } from '../../common/enums/food-type.enum.js';
import { InputKind } from '../../common/enums/input-kind.enum.js';
import { Farm } from '../farms/entities/farm.entity.js';
import { FarmsService } from '../farms/farms.service.js';
import { CashSession } from '../finance/entities/cash-session.entity.js';
import { CashSessionStatus } from '../../common/enums/cash-session-status.enum.js';
import { CashMovement } from '../finance/entities/cash-movement.entity.js';
import { Payment } from '../finance/entities/payment.entity.js';
import { Sale } from '../finance/entities/sale.entity.js';
import { SaleItem } from '../finance/entities/sale-item.entity.js';
import { Expense } from '../finance/entities/expense.entity.js';
import { InputLot } from '../inputs/entities/input-lot.entity.js';
import { StockTransfer } from '../points-of-sale/entities/stock-transfer.entity.js';
import { StockTransferProductType } from '../../common/enums/stock-transfer-product-type.enum.js';
import { StockTransferStatus } from '../../common/enums/stock-transfer-status.enum.js';
import { Order } from '../orders/entities/order.entity.js';
import { OrderStatus } from '../../common/enums/order-status.enum.js';
import { DailyEntry } from '../daily-entries/entities/daily-entry.entity.js';
import { FeedStockLoss } from '../feed-stock/entities/feed-stock-loss.entity.js';
import { FeedStockSale } from '../feed-stock/entities/feed-stock-sale.entity.js';
import { ACCOUNT_PLAN } from './account-plan.data.js';
import { Account } from './entities/account.entity.js';
import { Exercice, ExerciceStatus } from './entities/exercice.entity.js';
import {
  AccountingSource,
  JournalEntry,
  JournalEntryStatus,
} from './entities/journal-entry.entity.js';
import { JournalEntryLine } from './entities/journal-entry-line.entity.js';
import {
  cashAccountForMethod,
  expenseAccountForCategory,
  inputAccountForKind,
  inputValueFcfa,
  revenueLines,
} from './posting-map.js';

export const ENTRY_PREFIX = 'EC';

export interface PostingLine {
  account: string;
  label?: string | null;
  debit?: number;
  credit?: number;
}

export interface PostingSpec {
  farmId: string;
  date: string;
  label: string;
  source: AccountingSource;
  sourceId: string;
  lines: PostingLine[];
  operatorId?: string | null;
}

export interface AccountSoldes {
  code: string;
  label: string;
  classe: number;
  nature: string;
  debitTotalFcfa: number;
  creditTotalFcfa: number;
  soldeFcfa: number;
}

function todayStr(): string {
  return new Date().toISOString().slice(0, 10);
}

@Injectable()
export class AccountingService {
  constructor(
    @InjectRepository(Account)
    private readonly accountRepo: Repository<Account>,
    @InjectRepository(Exercice)
    private readonly exerciceRepo: Repository<Exercice>,
    @InjectRepository(JournalEntry)
    private readonly entryRepo: Repository<JournalEntry>,
    @InjectRepository(JournalEntryLine)
    private readonly lineRepo: Repository<JournalEntryLine>,
    private readonly farmsService: FarmsService,
    private readonly dataSource: DataSource,
  ) {}

  // ---------- Écriture ----------

  /**
   * Passe une écriture dans la transaction fournie. Idempotente :
   * (ferme, source, sourceId) unique — deux passages = une seule écriture.
   * L'écriture est équilibrée (Σ débits = Σ crédits) ou rejetée.
   */
  async post(em: EntityManager, spec: PostingSpec): Promise<JournalEntry | null> {
    if (!spec.lines || spec.lines.length === 0) return null;
    const cleanLines = spec.lines
      .filter((l) => (l.debit ?? 0) > 0 || (l.credit ?? 0) > 0)
      .map((l) => ({
        account: l.account.trim(),
        label: l.label ?? null,
        debit: Math.round(l.debit ?? 0),
        credit: Math.round(l.credit ?? 0),
      }));
    if (cleanLines.length === 0) return null;

    // Plan comptable auto-semé dès la première opération (jamais bloquant).
    await this.ensureAccounts(em, spec.farmId);

    const entryRepo = em.getRepository(JournalEntry);
    const existing = await entryRepo.findOne({
      where: {
        farmId: spec.farmId,
        source: spec.source,
        sourceId: spec.sourceId,
      },
    });
    if (existing) return existing;

    const totalDebit = cleanLines.reduce((s, l) => s + l.debit, 0);
    const totalCredit = cleanLines.reduce((s, l) => s + l.credit, 0);
    if (totalDebit !== totalCredit) {
      throw new BadRequestException(
        `Écriture non équilibrée (débit ${totalDebit} FCFA, crédit ${totalCredit} FCFA).`,
      );
    }

    const codes = [...new Set(cleanLines.map((l) => l.account))];
    const accounts = await em.getRepository(Account).find({
      where: { farmId: spec.farmId, code: In(codes) },
    });
    if (accounts.length !== codes.length) {
      const missing = codes.filter(
        (c) => !accounts.some((a) => a.code === c),
      );
      throw new BadRequestException(
        `Compte comptable inconnu : ${missing.join(', ')}.`,
      );
    }

    const exercice = await this.ensureExercice(em, spec.farmId, spec.date);
    const entry = await entryRepo.save(
      entryRepo.create({
        farmId: spec.farmId,
        exerciceId: exercice.id,
        reference: await this.nextReference(em, spec.date),
        entryDate: spec.date,
        label: spec.label,
        source: spec.source,
        sourceId: spec.sourceId,
        status: JournalEntryStatus.POSTED,
        createdById: spec.operatorId ?? null,
      }),
    );
    await em.getRepository(JournalEntryLine).save(
      cleanLines.map((l) =>
        em.getRepository(JournalEntryLine).create({
          entryId: entry.id,
          accountCode: l.account,
          label: l.label ?? null,
          debitFcfa: l.debit,
          creditFcfa: l.credit,
        }),
      ),
    );
    return entry;
  }

  // ---------- Ajustement / recalage d'écritures ----------

  /**
   * Diff entre les lignes souhaitées et les lignes déjà passées (par compte) :
   * → delta équilibré (débits/crédits selon le signe) à poster, ou [] si égal.
   */
  private deltaPostingLines(
    desired: PostingLine[],
    recognized: Map<string, { debit: number; credit: number }>,
  ): PostingLine[] {
    const accounts = new Set<string>();
    for (const l of desired) accounts.add(l.account.trim());
    for (const code of recognized.keys()) accounts.add(code);
    const delta: PostingLine[] = [];
    for (const account of accounts) {
      const want = desired.find((l) => l.account.trim() === account);
      const have = recognized.get(account) ?? { debit: 0, credit: 0 };
      const net =
        (want?.debit ?? 0) -
        (want?.credit ?? 0) -
        (have.debit - have.credit);
      if (net > 0) delta.push({ account, debit: net });
      else if (net < 0) delta.push({ account, credit: -net });
    }
    return delta;
  }

  /** Lignes déjà passées (par compte) pour (ferme, source, préfixe sourceId). */
  private async recognizedLines(
    em: EntityManager,
    farmId: string,
    source: AccountingSource,
    prefix: string,
  ): Promise<Map<string, { debit: number; credit: number }>> {
    const entries = await em.getRepository(JournalEntry).find({
      where: { farmId, source, sourceId: Like(`${prefix}%`) },
    });
    if (entries.length === 0) return new Map();
    const lines = await em.getRepository(JournalEntryLine).find({
      where: { entryId: In(entries.map((e) => e.id)) },
    });
    const map = new Map<string, { debit: number; credit: number }>();
    for (const line of lines) {
      const acc = map.get(line.accountCode) ?? { debit: 0, credit: 0 };
      acc.debit += line.debitFcfa;
      acc.credit += line.creditFcfa;
      map.set(line.accountCode, acc);
    }
    return map;
  }

  private async countEntriesLike(
    em: EntityManager,
    farmId: string,
    source: AccountingSource,
    prefix: string,
  ): Promise<number> {
    return em.getRepository(JournalEntry).count({
      where: { farmId, source, sourceId: Like(`${prefix}%`) },
    });
  }

  /**
   * Passe `spec` dans la transaction (idempotent), ou ajuste les écritures déjà
   * passées sous le préfixe `prefix` (ex. `sale:<id>`) pour atteindre `spec.lines`.
   * Un re-run sans changement ne crée rien. Les ajustements sont postés sous
   * `prefix:adj` puis `prefix:adj#k`, équilibrés (diff des anciennes lignes).
   */
  async postOrAdjust(
    em: EntityManager,
    spec: PostingSpec,
    prefix: string,
  ): Promise<JournalEntry | null> {
    await this.ensureAccounts(em, spec.farmId);
    const recognized = await this.recognizedLines(
      em,
      spec.farmId,
      spec.source,
      prefix,
    );
    if (recognized.size === 0) return this.post(em, spec);
    const delta = this.deltaPostingLines(spec.lines, recognized);
    if (delta.length === 0) {
      return (
        (await em.getRepository(JournalEntry).findOne({
          where: {
            farmId: spec.farmId,
            source: spec.source,
            sourceId: prefix,
          },
        })) ?? null
      );
    }
    const adjustCount = await this.countEntriesLike(
      em,
      spec.farmId,
      spec.source,
      `${prefix}:adj`,
    );
    const sourceId =
      adjustCount === 0 ? `${prefix}:adj` : `${prefix}:adj#${adjustCount + 1}`;
    return this.post(em, {
      ...spec,
      sourceId,
      label: `${spec.label} — ajustement`,
      lines: delta,
    });
  }

  /**
   * Opening of a cash session: only the change from the cash counted at the
   * previous closing is an owner contribution (108 → 571) or withdrawal
   * (571 → 108). Posting the whole float each day would grow 571 and 108 by
   * the carried-over cash at every opening. Null when nothing changed.
   */
  async cashOpeningLines(
    em: EntityManager,
    session: Pick<CashSession, 'id' | 'farmId' | 'openingBalanceFcfa' | 'openedAt' | 'createdAt'>,
  ): Promise<PostingLine[] | null> {
    const previous = await em
      .getRepository(CashSession)
      .createQueryBuilder('s')
      .where('s.farmId = :farmId', { farmId: session.farmId })
      .andWhere('s.id <> :id', { id: session.id })
      .andWhere('s.status = :closed', { closed: CashSessionStatus.CLOSED })
      .andWhere('s.createdAt < :createdAt', { createdAt: session.createdAt })
      .orderBy('s.createdAt', 'DESC')
      .getOne();
    const carried = previous?.closingBalanceFcfa ?? 0;
    const delta = session.openingBalanceFcfa - carried;
    if (delta > 0) {
      return [
        { account: '571', debit: delta, label: 'Caisse — espèces' },
        { account: '108', credit: delta, label: 'Apports de l’exploitant' },
      ];
    }
    if (delta < 0) {
      return [
        { account: '108', debit: -delta, label: 'Retrait de l’exploitant' },
        { account: '571', credit: -delta, label: 'Caisse — espèces' },
      ];
    }
    return null;
  }

  /**
   * Passe (ou ajuste) l'écriture de vente `sale:<id>` pour refléter les montants
   * finaux — utilisé à la livraison d'une commande (reconnaissance du chiffre
   * d'affaires) quand l'`init` a déjà passé l'écriture sur l'instantané du bon.
   */
  async ensureSaleEntry(em: EntityManager, params: {
    farmId: string;
    sale: Pick<Sale, 'id' | 'referenceNumber'>;
    date: string;
    items: { productType: SaleItemProductType; amountFcfa: number }[];
    totalAmountFcfa: number;
    operatorId?: string | null;
  }): Promise<JournalEntry | null> {
    const { farmId, sale, date, items, totalAmountFcfa, operatorId } = params;
    const label = `Vente ${sale.referenceNumber}`;
    return this.postOrAdjust(
      em,
      {
        farmId,
        date,
        label,
        source: 'SALE',
        sourceId: `sale:${sale.id}`,
        lines: [
          {
            account: '411',
            debit: totalAmountFcfa,
            label: 'Clients — créances',
          },
          ...revenueLines(items, totalAmountFcfa),
        ],
        operatorId,
      },
      `sale:${sale.id}`,
    );
  }

  /** Produits nets (classe 7) déjà reconnus en comptabilité pour une vente. */
  async netSaleRevenue(
    em: EntityManager,
    farmId: string,
    saleId: string,
  ): Promise<number> {
    const recognized = await this.recognizedLines(
      em,
      farmId,
      'SALE',
      `sale:${saleId}`,
    );
    let net = 0;
    for (const [account, line] of recognized) {
      if (account.startsWith('7')) net += line.credit - line.debit;
    }
    return net;
  }

  private async nextReference(em: EntityManager, date: string): Promise<string> {
    const stamp = date.replace(/-/g, '');
    for (let attempt = 0; attempt < 5; attempt++) {
      const candidate = `${ENTRY_PREFIX}-${stamp}-${Math.floor(
        100000 + Math.random() * 900000,
      )}`;
      const existing = await em.getRepository(JournalEntry).findOne({
        where: { reference: candidate },
      });
      if (!existing) return candidate;
    }
    throw new BadRequestException(
      'Impossible de générer une référence d’écriture unique. Réessayer.',
    );
  }

  // ---------- Plan comptable & exercices ----------

  /** Plante le plan comptable OHADA pour la ferme (no-op si déjà présent). */
  async ensureAccounts(em: EntityManager, farmId: string): Promise<void> {
    const repo = em.getRepository(Account);
    const existing = await repo.find({
      where: { farmId },
      select: ['code'],
    });
    const have = new Set(existing.map((a) => a.code));
    const missing = ACCOUNT_PLAN.filter((seed) => !have.has(seed.code));
    if (missing.length === 0) return;
    try {
      await repo.save(
        missing.map((seed) =>
          repo.create({
            farmId,
            code: seed.code,
            label: seed.label,
            classe: seed.classe,
            nature: seed.nature,
            isCustom: false,
          }),
        ),
      );
    } catch (err) {
      // Course de transactions : un autre repasse du plan a déjà inséré les
      // codes au moment de notre SELECT (snapshot) → le sous-ensemble restant
      // est déjà présent, rien d'autre à planter.
      if ((err as { code?: string })?.code === '23505') return;
      throw err;
    }
  }

  /** Exercice (any status) whose period contains `date`, without creating one. */
  private exerciceAt(
    em: EntityManager,
    farmId: string,
    date: string,
  ): Promise<Exercice | null> {
    return em
      .getRepository(Exercice)
      .createQueryBuilder('ex')
      .where('ex.farm_id = :farmId', { farmId })
      .andWhere('ex.start_date <= :date', { date })
      .andWhere('ex.end_date >= :date', { date })
      .orderBy('ex.start_date', 'DESC')
      .getOne();
  }

  /** Retourne l'exercice courant contenant `date`, en le créant si besoin. */
  async ensureExercice(
    em: EntityManager,
    farmId: string,
    date: string,
  ): Promise<Exercice> {
    const repo = em.getRepository(Exercice);
    let exercice = await repo
      .createQueryBuilder('ex')
      .where('ex.farm_id = :farmId', { farmId })
      .andWhere('ex.start_date <= :date', { date })
      .andWhere('ex.end_date >= :date', { date })
      .andWhere('ex.status = :status', { status: ExerciceStatus.OPEN })
      .getOne();
    if (exercice) return exercice;
    const year = date.slice(0, 4);
    // Two postings opening a new year at the same moment would each create
    // "Exercice YYYY" (no unique index: adding one would fail the schema sync
    // on farms that already have a duplicate). Serialize the creation.
    await em.query('SELECT pg_advisory_xact_lock(hashtext($1))', [
      `exercice:${farmId}:${year}`,
    ]);
    exercice = await repo
      .createQueryBuilder('ex')
      .where('ex.farm_id = :farmId', { farmId })
      .andWhere('ex.label = :label', { label: `Exercice ${year}` })
      .getOne();
    if (exercice) return exercice;
    return repo.save(
      repo.create({
        farmId,
        label: `Exercice ${year}`,
        startDate: `${year}-01-01`,
        endDate: `${year}-12-31`,
        status: ExerciceStatus.OPEN,
      }),
    );
  }

  // ---------- Initialisation / repasse des écritures historiques ----------

  /**
   * Initialise la comptabilité de la ferme : plan + exercice courant + repasse
   * de TOUT l'historique (ventes, paiements, dépenses, caisse, intrants) selon
   * les mêmes règles que l'écriture temps réel. Idempotente grâce à la
   * dédup (ferme, source, sourceId) — relançable sans duplication.
   */
  async initialize(user: AuthUser, farmId: string) {
    await this.farmsService.assertAccessible(user, farmId);
    return this.dataSource.transaction(async (em) => {
      await this.ensureAccounts(em, farmId);
      const posted = { caisse: 0, ventes: 0, paiements: 0, depenses: 0, intrants: 0 };

      const sessions = await em.getRepository(CashSession).find({
        where: { farmId },
        order: { openedAt: 'ASC', createdAt: 'ASC' },
      });
      for (const session of sessions) {
        const openLines = await this.cashOpeningLines(em, session);
        if (openLines) {
          await this.post(em, {
            farmId,
            date: session.openedAt,
            label: `Ouverture de caisse — caisse du ${session.openedAt}`,
            source: 'CAISSE',
            sourceId: `open:${session.id}`,
            lines: openLines,
            operatorId: session.openedById,
          });
          posted.caisse++;
        }
        if (session.closingDifferenceFcfa != null && session.closingDifferenceFcfa !== 0) {
          await this.post(em, {
            farmId,
            date: session.closedAt
              ? session.closedAt.toISOString().slice(0, 10)
              : session.openedAt,
            label: `Clôture de caisse du ${session.openedAt} — écart`,
            source: 'CAISSE',
            sourceId: `close:${session.id}`,
            lines:
              session.closingDifferenceFcfa < 0
                ? [
                    { account: '658', debit: -session.closingDifferenceFcfa },
                    { account: '571', credit: -session.closingDifferenceFcfa },
                  ]
                : [
                    { account: '571', debit: session.closingDifferenceFcfa },
                    { account: '758', credit: session.closingDifferenceFcfa },
                  ],
            operatorId: session.closedById,
          });
          posted.caisse++;
        }
      }

      const movements = await em.getRepository(CashMovement).find({
        where: { farmId },
        order: { movementDate: 'ASC', createdAt: 'ASC' },
      });
      for (const m of movements) {
        if (m.source === CashMovementSource.MANUAL) {
          await this.post(em, {
            farmId,
            date: m.movementDate,
            label:
              m.type === CashMovementType.IN
                ? `Mouvement de caisse (apport)${m.reason ? ` — ${m.reason}` : ''}`
                : `Mouvement de caisse (prélèvement)${m.reason ? ` — ${m.reason}` : ''}`,
            source: 'CAISSE',
            sourceId: `movement:${m.id}`,
            lines:
              m.type === CashMovementType.IN
                ? [
                    { account: '571', debit: m.amountFcfa },
                    { account: '108', credit: m.amountFcfa },
                  ]
                : [
                    { account: '108', debit: m.amountFcfa },
                    { account: '571', credit: m.amountFcfa },
                  ],
            operatorId: m.createdById,
          });
          posted.caisse++;
          continue;
        }
        if (m.source === CashMovementSource.REFUND) {
          // Remboursement hors annulation d'une vente (surplus d'acompte de
          // commande) : la somme est intégrée à l'écriture d'annulation pour
          // une vente annulée → on ne la passe ici que si la vente survit.
          if (m.saleId) {
            const sale = await em.getRepository(Sale).findOne({
              where: { id: m.saleId, farmId },
            });
            if (sale && sale.status !== SaleStatus.CANCELLED) {
              await this.post(em, {
                farmId,
                date: m.movementDate,
                label: `Remboursement surplus d’acompte${m.reason ? ` — ${m.reason}` : ''}`,
                source: 'ORDER',
                sourceId: `refund:${m.id}`,
                lines: [
                  { account: '411', debit: m.amountFcfa },
                  { account: '571', credit: m.amountFcfa },
                ],
                operatorId: m.createdById,
              });
              posted.paiements++;
            }
          }
        }
      }

      const payments = await em.getRepository(Payment).find({
        where: { farmId, status: PaymentStatus.CONFIRMED },
        order: { paymentDate: 'ASC', createdAt: 'ASC' },
      });
      for (const p of payments) {
        await this.post(em, {
          farmId,
          date: p.paymentDate ?? todayStr(),
          label: `Encaissement vente ${p.sale ? `#${p.sale.referenceNumber}` : ''}`,
          source: 'PAYMENT',
          sourceId: `payment:${p.id}`,
          lines: [
            { account: cashAccountForMethod(p.method), debit: p.amountFcfa },
            { account: '411', credit: p.amountFcfa },
          ],
          operatorId: p.operatorId,
        });
        posted.paiements++;
      }

      const sales = await em.getRepository(Sale).find({
        where: { farmId },
        order: { saleDate: 'ASC', createdAt: 'ASC' },
      });
      const allItems = await em
        .getRepository(SaleItem)
        .createQueryBuilder('item')
        .innerJoin('item.sale', 'sale')
        .where('sale.farm_id = :farmId', { farmId })
        .getMany();
      const itemsBySale = new Map<string, SaleItem[]>();
      for (const item of allItems) {
        const arr = itemsBySale.get(item.saleId) ?? [];
        arr.push(item);
        itemsBySale.set(item.saleId, arr);
      }
      const undeliveredOrderSales = new Set(
        (
          await em.getRepository(Order).find({
            where: {
              farmId,
              status: In([OrderStatus.PENDING, OrderStatus.CONFIRMED]),
            },
            select: { saleId: true },
          })
        ).map((o) => o.saleId),
      );
      for (const sale of sales) {
        const items = itemsBySale.get(sale.id) ?? [];
        if (sale.status === SaleStatus.CANCELLED) {
          // Same rule as the live cancellation: reverse only revenue that was
          // recognized. A sale cancelled before any `sale:` entry (order
          // cancelled before delivery, POS sale before the first init) has
          // nothing to reverse, and its refunded payments are not posted.
          const recognized = await this.netSaleRevenue(em, farmId, sale.id);
          if (recognized <= 0) continue;
          const cancelledDate = sale.cancelledAt
            ? sale.cancelledAt.toISOString().slice(0, 10)
            : sale.saleDate;
          const refunded = movements
            .filter(
              (m) =>
                m.saleId === sale.id && m.source === CashMovementSource.REFUND,
            )
            .reduce((s, m) => s + m.amountFcfa, 0);
          const revenue = revenueLines(
            items.map((i) => ({
              productType: i.productType,
              amountFcfa: i.amountFcfa,
            })),
            sale.totalAmountFcfa,
          );
          const lines: PostingLine[] = revenue.map((r) => ({
            account: r.account,
            debit: r.credit as number,
          }));
          const netReceivable = Math.max(0, sale.totalAmountFcfa - refunded);
          if (netReceivable > 0) {
            lines.push({ account: '411', credit: netReceivable });
          }
          if (refunded > 0) {
            lines.push({ account: '571', credit: refunded });
          }
          await this.post(em, {
            farmId,
            date: cancelledDate,
            label: `Annulation vente ${sale.referenceNumber}`,
            source: 'SALE',
            sourceId: `cancel:${sale.id}`,
            lines,
            operatorId: sale.createdById,
          });
          posted.ventes++;
        } else {
          // Order revenue is recognized at delivery (ensureSaleEntry).
          if (undeliveredOrderSales.has(sale.id)) continue;
          await this.post(em, {
            farmId,
            date: sale.saleDate,
            label: `Vente ${sale.referenceNumber}`,
            source: 'SALE',
            sourceId: `sale:${sale.id}`,
            lines: [
              { account: '411', debit: sale.totalAmountFcfa },
              ...revenueLines(
                items.map((i) => ({
                  productType: i.productType,
                  amountFcfa: i.amountFcfa,
                })),
                sale.totalAmountFcfa,
              ),
            ],
            operatorId: sale.createdById,
          });
          posted.ventes++;
        }
      }

      const expenses = await em.getRepository(Expense).find({
        where: { farmId },
        order: { expenseDate: 'ASC', createdAt: 'ASC' },
      });
      for (const e of expenses) {
        // Reception expenses are already booked by the lot (`input:`).
        if (e.inputLotId != null || e.notes?.startsWith('[Auto] Intrant')) {
          continue;
        }
        await this.post(em, {
          farmId,
          date: e.expenseDate,
          label: e.label
            ? `Dépense ${e.label}${e.supplier ? ` (${e.supplier})` : ''}`
            : `Dépense ${e.category}`,
          source: 'EXPENSE',
          sourceId: `expense:${e.id}`,
          lines: e.paidByCaisse
            ? [
                {
                  account: expenseAccountForCategory(e.category),
                  debit: e.amountFcfa,
                },
                { account: '571', credit: e.amountFcfa },
              ]
            : [
                {
                  account: expenseAccountForCategory(e.category),
                  debit: e.amountFcfa,
                },
                { account: '401', credit: e.amountFcfa },
              ],
          operatorId: e.createdById,
        });
        posted.depenses++;
      }

      const inputs = await em.getRepository(InputLot).find({
        where: { farmId },
        order: { receivedDate: 'ASC', createdAt: 'ASC' },
      });
      for (const input of inputs) {
        const value = inputValueFcfa(input);
        if (value <= 0) continue;
        await this.post(em, {
          farmId,
          date: input.receivedDate,
          label: `Réception intrant ${input.productName} — lot fournisseur ${input.supplierLotNumber}`,
          source: 'INPUT',
          sourceId: `input:${input.id}`,
          lines: [
            { account: inputAccountForKind(input.kind), debit: value },
            { account: '401', credit: value },
          ],
        });
        posted.intrants++;
      }

      return {
        exercice: await em
          .getRepository(Exercice)
          .findOne({ where: { farmId } }),
        posted,
      };
    });
  }

  /** Écriture de régularisation manuelle (gated `compta:ecritures`). */
  async createRegularisation(user: AuthUser, farmId: string, dto: {
    date: string;
    label: string;
    lines: { account: string; label?: string | null; debitFcfa?: number; creditFcfa?: number }[];
  }) {
    await this.farmsService.assertAccessible(user, farmId);
    for (const l of dto.lines) {
      const hasDebit = (l.debitFcfa ?? 0) > 0;
      const hasCredit = (l.creditFcfa ?? 0) > 0;
      if (hasDebit === hasCredit) {
        throw new BadRequestException(
          `Ligne ${l.account} : indiquer soit un débit, soit un crédit (strictement positif), pas les deux.`,
        );
      }
    }
    const entry = await this.dataSource.transaction(async (em) => {
      // A closed exercice is frozen: its result was already carried forward.
      // (Automatic postings from back-dated business operations are still
      // accepted — never blocking — and the bilan recomputes the report à
      // nouveau from the ledger, so it stays balanced.)
      const exercice = await this.exerciceAt(em, farmId, dto.date);
      if (exercice?.status === ExerciceStatus.CLOSED) {
        throw new BadRequestException(
          `L’exercice « ${exercice.label} » est clôturé : impossible d’y passer une régularisation datée du ${dto.date}.`,
        );
      }
      await this.ensureAccounts(em, farmId);
      return this.post(em, {
        farmId,
        date: dto.date,
        label: dto.label,
        source: 'REGULARISATION',
        sourceId: `regul:${Date.now()}-${Math.floor(Math.random() * 1e6)}`,
        lines: dto.lines.map((l) => ({
          account: l.account,
          label: l.label,
          debit: l.debitFcfa,
          credit: l.creditFcfa,
        })),
        operatorId: user.id,
      });
    });
    return this.entryRepo.findOne({
      where: { id: entry?.id },
      relations: { lines: true },
      order: { lines: { debitFcfa: 'DESC', accountCode: 'ASC' } },
    });
  }

  // ---------- Lectures ----------

  /** Farm vérifiée (helper exports). */
  async findFarm(user: AuthUser, farmId: string): Promise<Farm> {
    return this.farmsService.assertAccessible(user, farmId);
  }

  /** Journal : toutes les écritures chronologiques avec leurs lignes. */
  async journal(
    user: AuthUser,
    farmId: string,
    from?: string,
    to?: string,
  ) {
    await this.farmsService.assertAccessible(user, farmId);
    const qb = this.entryRepo
      .createQueryBuilder('entry')
      .leftJoinAndSelect('entry.lines', 'line')
      .where('entry.farm_id = :farmId', { farmId })
      .orderBy('entry.entry_date', 'ASC')
      .addOrderBy('entry.created_at', 'ASC')
      // Lines have no natural order in SQL: show debits first, then credits,
      // each by account code (accounting convention, stable for clients).
      .addOrderBy('line.debitFcfa', 'DESC')
      .addOrderBy('line.accountCode', 'ASC');
    if (from) qb.andWhere('entry.entry_date >= :from', { from });
    if (to) qb.andWhere('entry.entry_date <= :to', { to });
    const entries = await qb.getMany();
    const totals = entries.reduce(
      (acc, entry) => {
        acc.debit += entry.lines.reduce((s, l) => s + l.debitFcfa, 0);
        acc.credit += entry.lines.reduce((s, l) => s + l.creditFcfa, 0);
        return acc;
      },
      { debit: 0, credit: 0 },
    );
    return { entries, totals };
  }

  /** Soldes par compte sur la période (débit, crédit, solde net). */
  async soldes(
    user: AuthUser,
    farmId: string,
    from?: string,
    to?: string,
  ): Promise<AccountSoldes[]> {
    await this.farmsService.assertAccessible(user, farmId);
    return this.computeSoldes(this.dataSource.manager, farmId, from, to);
  }

  /** Soldes par compte sans vérification d'accès (helper interne). */
  private async computeSoldes(
    em: EntityManager,
    farmId: string,
    from?: string,
    to?: string,
  ): Promise<AccountSoldes[]> {
    const accounts = await em.getRepository(Account).find({
      where: { farmId },
      order: { code: 'ASC' },
    });
    const qb = em
      .getRepository(JournalEntryLine)
      .createQueryBuilder('line')
      .innerJoin('line.entry', 'entry')
      .select('line.account_code', 'code')
      .addSelect('SUM(line.debit_fcfa)', 'debit')
      .addSelect('SUM(line.credit_fcfa)', 'credit')
      .where('entry.farm_id = :farmId', { farmId })
      .andWhere('entry.status = :status', { status: JournalEntryStatus.POSTED })
      .groupBy('line.account_code');
    if (from) qb.andWhere('entry.entry_date >= :from', { from });
    if (to) qb.andWhere('entry.entry_date <= :to', { to });
    const rows = (await qb.getRawMany<{
      code: string;
      debit: string | number;
      credit: string | number;
    }>()) as unknown as Array<{ code: string; debit: number; credit: number }>;
    const byCode = new Map<string, { debit: number; credit: number }>();
    for (const r of rows) {
      byCode.set(r.code, {
        debit: Number(r.debit) || 0,
        credit: Number(r.credit) || 0,
      });
    }
    return accounts.map((a) => {
      const t = byCode.get(a.code) ?? { debit: 0, credit: 0 };
      return {
        code: a.code,
        label: a.label,
        classe: a.classe,
        nature: a.nature,
        debitTotalFcfa: t.debit,
        creditTotalFcfa: t.credit,
        soldeFcfa: t.debit - t.credit,
      };
    });
  }

  /** Grand livre : mouvements détaillés par compte avec cumuls. */
  async grandLivre(
    user: AuthUser,
    farmId: string,
    from?: string,
    to?: string,
    accountCode?: string,
  ) {
    const soldes = await this.soldes(user, farmId, from, to);
    const lines = await this.lineRepo
      .createQueryBuilder('line')
      .innerJoinAndSelect('line.entry', 'entry')
      .where('entry.farm_id = :farmId', { farmId })
      .andWhere('entry.status = :status', {
        status: JournalEntryStatus.POSTED,
      })
      .orderBy('entry.entry_date', 'ASC')
      .addOrderBy('entry.created_at', 'ASC');
    if (from) lines.andWhere('entry.entry_date >= :from', { from });
    if (to) lines.andWhere('entry.entry_date <= :to', { to });
    if (accountCode) {
      lines.andWhere('line.account_code = :accountCode', { accountCode });
    }
    const rows = await lines.getMany();
    const groups = new Map<
      string,
      {
        solde: AccountSoldes | undefined;
        mouvements: Array<{
          date: string;
          reference: string;
          label: string;
          source: string;
          sourceId: string;
          debitFcfa: number;
          creditFcfa: number;
        }>;
      }
    >();
    for (const line of rows) {
      const group = groups.get(line.accountCode) ?? {
        solde: soldes.find((s) => s.code === line.accountCode),
        mouvements: [],
      };
      group.mouvements.push({
        date: line.entry.entryDate,
        reference: line.entry.reference,
        label: line.entry.label,
        source: line.entry.source,
        sourceId: line.entry.sourceId,
        debitFcfa: line.debitFcfa,
        creditFcfa: line.creditFcfa,
      });
      groups.set(line.accountCode, group);
    }
    if (accountCode && !groups.has(accountCode)) {
      const solde = soldes.find((s) => s.code === accountCode);
      groups.set(accountCode, {
        solde,
        mouvements: [],
      });
    }
    return [...groups.entries()].map(([code, { solde, mouvements }]) => ({
      account: code,
      label: solde?.label ?? null,
      classe: solde?.classe ?? null,
      nature: solde?.nature ?? null,
      debitTotalFcfa: mouvements.reduce((s, m) => s + m.debitFcfa, 0),
      creditTotalFcfa: mouvements.reduce((s, m) => s + m.creditFcfa, 0),
      soldeFcfa: (solde?.soldeFcfa ?? 0),
      mouvements,
    }));
  }

  /** Balance d'essai (balance des soldes). */
  async balance(
    user: AuthUser,
    farmId: string,
    from?: string,
    to?: string,
  ) {
    const soldes = await this.soldes(user, farmId, from, to);
    const classes = [1, 2, 3, 4, 5, 6, 7];
    const byClasse = new Map<number, AccountSoldes[]>();
    for (const c of classes) byClasse.set(c, []);
    for (const s of soldes) {
      const bucket = byClasse.get(s.classe);
      if (bucket) bucket.push(s);
    }
    const totalDebit = soldes.reduce((s, a) => s + a.debitTotalFcfa, 0);
    const totalCredit = soldes.reduce((s, a) => s + a.creditTotalFcfa, 0);
    const totalSoldeDebit = soldes.reduce(
      (s, a) => s + Math.max(0, a.soldeFcfa),
      0,
    );
    const totalSoldeCredit = soldes.reduce(
      (s, a) => s + Math.max(0, -a.soldeFcfa),
      0,
    );
    return {
      accounts: soldes,
      byClasse: [...byClasse.entries()].map(([classe, accounts]) => ({
        classe,
        accounts,
      })),
      totals: { totalDebit, totalCredit, totalSoldeDebit, totalSoldeCredit },
    };
  }

  /** Compte de résultat : charges (classe 6) − produits (classe 7). */
  async compteResultat(
    user: AuthUser,
    farmId: string,
    from?: string,
    to?: string,
  ) {
    await this.farmsService.assertAccessible(user, farmId);
    return this.computeCompteResultat(this.dataSource.manager, farmId, from, to);
  }

  private async computeCompteResultat(
    em: EntityManager,
    farmId: string,
    from?: string,
    to?: string,
  ) {
    const soldes = await this.computeSoldes(em, farmId, from, to);
    const charges = soldes.filter((s) => s.classe === 6);
    const produits = soldes.filter((s) => s.classe === 7);
    const totalCharges = charges.reduce((s, a) => s + a.soldeFcfa, 0);
    const totalProduits = -produits.reduce((s, a) => s + a.soldeFcfa, 0);
    return {
      charges,
      produits,
      totalCharges,
      totalProduits,
      resultatFcfa: totalProduits - totalCharges,
      resultatNegatif: totalCharges > totalProduits,
    };
  }

  /**
   * Bilan : situation arrêtée à une date (`to`, défaut aujourd'hui).
   *
   * - A balance sheet is a snapshot: every balance is cumulative from the
   *   first entry up to `asOf`; `from` is ignored (kept for API symmetry).
   * - Classes 2–3 always sit on the asset side (depreciation 28x/39x reduces
   *   it); classes 1 (debts), 4 and 5 are classified by the sign of their
   *   balance (overdrawn bank → passif, supplier advance → actif).
   * - Capitaux = apports (classe 1 CAPITAUX outside 12/129/13) + report à
   *   nouveau + résultat de l'exercice. The report à nouveau is recomputed
   *   from the ledger (classes 6/7 before the exercice start + net 12/129/13),
   *   so it stays right whether or not prior exercices were closed.
   * - Class 8 (hors bilan) is excluded. Since every entry balances,
   *   `ecartFcfa` is 0 by construction.
   */
  async bilan(
    user: AuthUser,
    farmId: string,
    _from?: string,
    to?: string,
  ) {
    await this.farmsService.assertAccessible(user, farmId);
    const em = this.dataSource.manager;
    const asOf = to ?? new Date().toISOString().slice(0, 10);
    const exercice = await this.exerciceAt(em, farmId, asOf);
    const exerciceStart = exercice?.startDate ?? `${asOf.slice(0, 4)}-01-01`;

    const soldes = await this.computeSoldes(em, farmId, undefined, asOf);
    const isReportANouveau = (c: string) =>
      c.startsWith('12') || c.startsWith('13');

    const actif: AccountSoldes[] = [];
    const passif: AccountSoldes[] = [];
    const capitaux: AccountSoldes[] = [];
    let capitauxApportsFcfa = 0;
    let ranComptesFcfa = 0;
    let resultatCumuleFcfa = 0;
    for (const s of soldes) {
      if (s.classe === 6 || s.classe === 7) {
        resultatCumuleFcfa -= s.soldeFcfa;
        continue;
      }
      if (s.classe < 1 || s.classe > 5 || s.soldeFcfa === 0) continue;
      if (s.nature === 'CAPITAUX') {
        if (isReportANouveau(s.code)) {
          ranComptesFcfa -= s.soldeFcfa;
        } else {
          capitauxApportsFcfa -= s.soldeFcfa;
          capitaux.push(s);
        }
      } else if (s.classe === 2 || s.classe === 3 || s.soldeFcfa > 0) {
        actif.push(s);
      } else {
        passif.push(s);
      }
    }

    const resultat = await this.computeCompteResultat(
      em,
      farmId,
      exerciceStart,
      asOf,
    );

    // Feed stock is only booked (311 / 603) at the closing. Until then the
    // ledger shows every purchase as a charge and no stock: value the stock
    // on hand at `asOf` (same rule as the closing) and recognise it as an
    // asset and as a stock variation in the result, so the bilan of an open
    // exercice is not understated. Skipped once the closing entry exists.
    const closingBooked =
      exercice?.status === ExerciceStatus.CLOSED && asOf >= exercice.endDate;
    let variationStockFcfa = 0;
    if (!closingBooked) {
      const farm = await em
        .getRepository(Farm)
        .findOne({ where: { id: farmId } });
      const stock = await this.valeurStockProvende(
        em,
        farmId,
        farm?.defaultSacKg ?? 50,
        asOf,
      );
      variationStockFcfa = stock.totalValueFcfa;
      if (variationStockFcfa > 0) {
        const existing = actif.find((a) => a.code === '311');
        if (existing) {
          existing.soldeFcfa += variationStockFcfa;
        } else {
          actif.push({
            code: '311',
            label: 'Provende et aliments (inventaire estimé)',
            classe: 3,
            nature: 'ACTIF',
            debitTotalFcfa: 0,
            creditTotalFcfa: 0,
            soldeFcfa: variationStockFcfa,
          });
        }
      }
    }

    const resultatFcfa = resultat.resultatFcfa + variationStockFcfa;
    // Prior results from the ledger only (the stock estimate is this year's).
    const reportANouveauFcfa =
      ranComptesFcfa + (resultatCumuleFcfa - resultat.resultatFcfa);
    if (reportANouveauFcfa !== 0) {
      capitaux.push({
        code: '13',
        label: 'Report à nouveau (résultats antérieurs)',
        classe: 1,
        nature: 'CAPITAUX',
        debitTotalFcfa: 0,
        creditTotalFcfa: 0,
        soldeFcfa: -reportANouveauFcfa,
      });
    }

    const totalActif = actif.reduce((s, a) => s + a.soldeFcfa, 0);
    const totalPassifExterne = passif.reduce((s, a) => s + -a.soldeFcfa, 0);
    const totalCapitaux =
      capitauxApportsFcfa + reportANouveauFcfa + resultatFcfa;

    return {
      asOf,
      exercice: exercice
        ? {
            id: exercice.id,
            label: exercice.label,
            startDate: exercice.startDate,
            endDate: exercice.endDate,
            status: exercice.status,
          }
        : null,
      actif,
      passif,
      capitaux,
      resultatFcfa,
      resultatNegatif: resultatFcfa < 0,
      capitauxApportsFcfa,
      reportANouveauFcfa,
      /** Feed stock on hand not yet booked (included in actif and résultat). */
      variationStockFcfa,
      totalActif,
      totalPassifExterne,
      totalCapitaux,
      ecartFcfa: totalActif - (totalPassifExterne + totalCapitaux),
    };
  }

  // ---------- Stock Classe 3 (provende) ----------

  /**
   * Valorisation actuelle du stock de provende (312/603, best-effort).
   * Disponible comptable par lot = réception (kg) − consommation saisie −
   * pertes − ventes (même règle que le module feed-stock), valorisé au prorata
   * de la valeur d'intrant (totalCostFcfa, ou coût/MT, ou prix unitaire × sacs).
   */
  async stockProvende(user: AuthUser, farmId: string) {
    const farm = await this.farmsService.assertAccessible(user, farmId);
    const sacKg = farm.defaultSacKg ?? 50;
    return this.valeurStockProvende(this.dataSource.manager, farmId, sacKg);
  }

  /**
   * Feed stock value on `asOf` (default: now): only receptions, consumption,
   * losses and sales dated on or before that day count. Used for the
   * year-end closing (at the exercice end date, not at the closing day) and
   * for the bilan of an exercice still open.
   */
  private async valeurStockProvende(
    em: EntityManager,
    farmId: string,
    sacKg: number,
    asOf?: string,
  ) {
    const upTo = asOf ? LessThanOrEqual(asOf) : undefined;
    const lots = await em.getRepository(InputLot).find({
      where: {
        farmId,
        kind: InputKind.ALIMENT,
        ...(upTo ? { receivedDate: upTo } : {}),
      },
      order: { receivedDate: 'ASC', createdAt: 'ASC' },
    });
    const lotsDetail: Array<{
      lotId: string;
      productName: string;
      supplierLotNumber: string;
      receivedKg: number;
      availableKg: number;
      valueFcfa: number;
    }> = [];
    let totalValueFcfa = 0;
    const toKg = (lot: InputLot, qty: number) =>
      lot.unit === FeedUnit.KG ? qty : qty * sacKg;
    for (const lot of lots) {
      // A feed transfer to a shop takes its quantity out of lot.quantity: add
      // it back to value the lot on what was really received, and count it as
      // an outflow (only up to asOf for a past snapshot).
      const transfers = await em.getRepository(StockTransfer).find({
        where: {
          farmId,
          inputLotId: lot.id,
          productType: StockTransferProductType.PROVENDE,
        },
      });
      let removedQty = 0;
      let removedAfterAsOfQty = 0;
      for (const t of transfers) {
        const out =
          t.status === StockTransferStatus.CANCELLED ? t.quantitySold : t.quantity;
        const outKg = t.unit === FeedUnit.SAC ? out * sacKg : out;
        const outLotUnits = lot.unit === FeedUnit.KG ? outKg : outKg / sacKg;
        removedQty += outLotUnits;
        if (asOf && t.createdAt.toISOString().slice(0, 10) > asOf) {
          removedAfterAsOfQty += outLotUnits;
        }
      }
      const receivedQty = (lot.quantity ?? 0) + removedQty;
      const totalValue = inputValueFcfa({ ...lot, quantity: receivedQty });
      const receivedKg = toKg(lot, receivedQty) || 0;
      const onLotKg = toKg(lot, (lot.quantity ?? 0) + removedAfterAsOfQty) || 0;
      if (receivedKg <= 0 || totalValue <= 0) continue;
      const [entries, losses, sales] = await Promise.all([
        em.getRepository(DailyEntry).find({
          where: { inputLotId: lot.id, ...(upTo ? { entryDate: upTo } : {}) },
        }),
        em.getRepository(FeedStockLoss).find({
          where: { inputLotId: lot.id, ...(upTo ? { occurredAt: upTo } : {}) },
        }),
        em.getRepository(FeedStockSale).find({
          where: { inputLotId: lot.id, ...(upTo ? { soldAt: upTo } : {}) },
        }),
      ]);
      const usedKg = entries.reduce((s, e) => s + e.feedQuantity, 0);
      const lostKg = losses.reduce((s, l) => s + l.quantityKg, 0);
      const soldKg = sales.reduce((s, x) => s + x.quantityKg, 0);
      const availableKg = Math.max(0, onLotKg - usedKg - lostKg - soldKg);
      const valueFcfa = Math.round((totalValue * availableKg) / receivedKg);
      if (valueFcfa <= 0) continue;
      lotsDetail.push({
        lotId: lot.id,
        productName: lot.productName,
        supplierLotNumber: lot.supplierLotNumber,
        receivedKg: Math.round(receivedKg * 100) / 100,
        availableKg: Math.round(availableKg * 100) / 100,
        valueFcfa,
      });
      totalValueFcfa += valueFcfa;
    }
    return { totalValueFcfa, lots: lotsDetail };
  }

  // ---------- Exercices & clôture ----------

  /** Liste des exercices comptables de la ferme (du plus ancien au plus récent). */
  async exercices(user: AuthUser, farmId: string) {
    await this.farmsService.assertAccessible(user, farmId);
    const rows = await this.exerciceRepo.find({
      where: { farmId },
      order: { startDate: 'ASC' },
    });
    return rows.map((e) => ({
      id: e.id,
      label: e.label,
      startDate: e.startDate,
      endDate: e.endDate,
      status: e.status,
      createdAt: e.createdAt,
    }));
  }

  /**
   * Clôture d'un exercice passé :
   * 1. stock final provende → 311 / 603 (charge diminuée, actif créé),
   * 2. résultat de l'exercice rapporté à RAN (129 / 12),
   * 3. exercice marqué CLOSED + ouverture de l'exercice suivant,
   * 4. reprise du stock initial dans l'exercice suivant (603 / 311).
   * Idempotente (dédup par (ferme, source, sourceId)).
   */
  async cloturer(user: AuthUser, farmId: string, exerciceId: string) {
    await this.farmsService.assertAccessible(user, farmId);
    return this.dataSource.transaction(async (em) => {
      const ex = await em
        .getRepository(Exercice)
        .findOne({ where: { id: exerciceId, farmId } });
      if (!ex) {
        throw new NotFoundException('Exercice comptable introuvable.');
      }
      if (ex.status === ExerciceStatus.CLOSED) {
        throw new BadRequestException(
          `L’exercice ${ex.label} est déjà clôturé.`,
        );
      }
      const now = todayStr();
      if (ex.endDate > now) {
        throw new BadRequestException(
          `Impossible de clôturer l’exercice ${ex.label} : il se termine le ${ex.endDate}, période en cours — clôture réservée aux exercices passés.`,
        );
      }

      await this.ensureAccounts(em, farmId);
      const farm = await em.getRepository(Farm).findOne({
        where: { id: farmId },
      });
      const sacKg = farm?.defaultSacKg ?? 50;
      // Stock at the exercice end date, whenever the closing is run.
      const stock = await this.valeurStockProvende(
        em,
        farmId,
        sacKg,
        ex.endDate,
      );
      const posted: string[] = [];

      if (stock.totalValueFcfa > 0) {
        await this.post(em, {
          farmId,
          date: ex.endDate,
          label: `Stock final de provende — ${ex.label}`,
          source: 'STOCK',
          sourceId: `close:${ex.id}`,
          lines: [
            {
              account: '311',
              debit: stock.totalValueFcfa,
              label: 'Provende et aliments',
            },
            {
              account: '603',
              credit: stock.totalValueFcfa,
              label: 'Variation de stocks de matières premières',
            },
          ],
          operatorId: user.id,
        });
        posted.push('stock');
      }

      const resultat = await this.computeCompteResultat(
        em,
        farmId,
        ex.startDate,
        ex.endDate,
      );
      if (resultat.resultatFcfa !== 0) {
        const benefice = resultat.resultatFcfa > 0;
        await this.post(em, {
          farmId,
          date: ex.endDate,
          label: `Clôture ${ex.label} — résultat reporté à nouveau`,
          source: 'CLOTURE',
          sourceId: `ran:${ex.id}`,
          lines: benefice
            ? [
                { account: '129', debit: resultat.resultatFcfa },
                { account: '12', credit: resultat.resultatFcfa },
              ]
            : [
                { account: '12', debit: -resultat.resultatFcfa },
                { account: '129', credit: -resultat.resultatFcfa },
              ],
          operatorId: user.id,
        });
        posted.push('resultat');
      }

      ex.status = ExerciceStatus.CLOSED;
      await em.getRepository(Exercice).save(ex);

      const nextYear = Number(ex.startDate.slice(0, 4)) + 1;
      const next = await this.ensureExercice(
        em,
        farmId,
        `${nextYear}-01-01`,
      );
      if (stock.totalValueFcfa > 0) {
        await this.post(em, {
          farmId,
          date: next.startDate,
          label: `Reprise stock de provende — ${next.label}`,
          source: 'STOCK',
          sourceId: `open:${ex.id}`,
          lines: [
            {
              account: '603',
              debit: stock.totalValueFcfa,
              label: 'Variation de stocks de matières premières',
            },
            {
              account: '311',
              credit: stock.totalValueFcfa,
              label: 'Provende et aliments',
            },
          ],
          operatorId: user.id,
        });
        posted.push('reprise');
      }

      return {
        exercice: {
          id: ex.id,
          label: ex.label,
          startDate: ex.startDate,
          endDate: ex.endDate,
          status: ex.status,
        },
        next: {
          id: next.id,
          label: next.label,
          startDate: next.startDate,
          endDate: next.endDate,
          status: next.status,
        },
        resultatFcfa: resultat.resultatFcfa,
        resultatNegatif: resultat.resultatNegatif,
        stockFcfa: stock.totalValueFcfa,
        posted,
      };
    });
  }
}