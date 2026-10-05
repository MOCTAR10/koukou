import {
  BadRequestException,
  Injectable,
  Logger,
  NotFoundException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { DataSource, Repository } from 'typeorm';
import { AuthUser } from '../../common/decorators/current-user.decorator.js';
import { ExpenseCategory } from '../../common/enums/expense-category.enum.js';
import {
  CashMovementSource,
  CashMovementType,
} from '../../common/enums/cash-session-status.enum.js';
import { InputKind } from '../../common/enums/input-kind.enum.js';
import { FarmsService } from '../farms/farms.service.js';
import { ProductionBatch } from '../batches/entities/production-batch.entity.js';
import { InputLot } from '../inputs/entities/input-lot.entity.js';
import { CashSession } from './entities/cash-session.entity.js';
import { CashSessionStatus } from '../../common/enums/cash-session-status.enum.js';
import { CashMovement } from './entities/cash-movement.entity.js';
import { Expense } from './entities/expense.entity.js';
import {
  CreateExpenseDto,
  UpdateExpenseDto,
  ListExpensesQueryDto,
} from './dto/expense.dto.js';
import { AccountingService } from '../accounting/accounting.service.js';
import {
  expenseAccountForCategory,
  inputValueFcfa,
} from '../accounting/posting-map.js';

/** Map InputKind → ExpenseCategory for auto-created expense records. */
function expenseCategoryForInputKind(kind: InputKind): ExpenseCategory {
  switch (kind) {
    case InputKind.POUSSINS:
      return ExpenseCategory.ACHAT_POUSSINS;
    case InputKind.ALIMENT:
      return ExpenseCategory.ALIMENTS;
    case InputKind.MEDICAMENT:
    case InputKind.VITAMINE:
      return ExpenseCategory.VETERINAIRE;
    default:
      return ExpenseCategory.AUTRE;
  }
}

@Injectable()
export class ExpensesService {
  private readonly logger = new Logger(ExpensesService.name);

  constructor(
    @InjectRepository(Expense)
    private readonly expenseRepo: Repository<Expense>,
    @InjectRepository(ProductionBatch)
    private readonly batchRepo: Repository<ProductionBatch>,
    @InjectRepository(InputLot)
    private readonly inputRepo: Repository<InputLot>,
    private readonly farmsService: FarmsService,
    private readonly dataSource: DataSource,
    private readonly accountingService: AccountingService,
  ) {}

  async list(
    user: AuthUser,
    farmId: string,
    query: ListExpensesQueryDto,
  ): Promise<Expense[]> {
    await this.farmsService.assertAccessible(user, farmId);
    const qb = this.expenseRepo
      .createQueryBuilder('expense')
      .where('expense.farm_id = :farmId', { farmId })
      .orderBy('expense.expense_date', 'DESC')
      .addOrderBy('expense.created_at', 'DESC');
    if (query.from)
      qb.andWhere('expense.expense_date >= :from', { from: query.from });
    if (query.to) qb.andWhere('expense.expense_date <= :to', { to: query.to });
    if (query.category)
      qb.andWhere('expense.category = :category', { category: query.category });
    if (query.batchId)
      qb.andWhere('expense.batch_id = :batchId', { batchId: query.batchId });
    return qb.getMany();
  }

  async create(
    user: AuthUser,
    farmId: string,
    dto: CreateExpenseDto,
  ): Promise<Expense> {
    await this.farmsService.assertAccessible(user, farmId);
    const batch = await this.resolveBatch(farmId, dto.batchId);

    return this.dataSource.transaction(async (em) => {
      let cashMovement: CashMovement | null = null;
      if (dto.paidByCaisse) {
        const session = await em.getRepository(CashSession).findOne({
          where: { farmId, status: CashSessionStatus.OPEN },
          lock: { mode: 'pessimistic_write' },
        });
        if (!session) {
          throw new BadRequestException(
            'Aucune session de caisse ouverte : impossible de payer depuis la caisse.',
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
        if (dto.amountFcfa > available) {
          throw new BadRequestException(
            `Solde de caisse insuffisant (${available} FCFA) pour cette dépense de ${dto.amountFcfa} FCFA. Une caisse ne peut pas être négative.`,
          );
        }
        cashMovement = await em.getRepository(CashMovement).save(
          em.getRepository(CashMovement).create({
            farmId,
            cashSessionId: session.id,
            type: CashMovementType.OUT,
            source: CashMovementSource.EXPENSE,
            amountFcfa: dto.amountFcfa,
            reason: dto.label ?? dto.category,
            movementDate:
              dto.expenseDate ?? new Date().toISOString().slice(0, 10),
            createdById: user.id,
          }),
        );
      }

      const expense = await em.getRepository(Expense).save(
        em.getRepository(Expense).create({
          farmId,
          expenseDate: dto.expenseDate ?? new Date().toISOString().slice(0, 10),
          category: dto.category,
          amountFcfa: dto.amountFcfa,
          label: dto.label ?? null,
          supplier: dto.supplier ?? null,
          notes: dto.notes ?? null,
          paidByCaisse: dto.paidByCaisse ?? false,
          batchId: batch?.id ?? null,
          cashMovementId: cashMovement?.id ?? null,
          createdById: user.id,
        }),
      );

      // Comptabilité : dépense → charge (par catégorie) / Caisse ou Fournisseurs.
      await this.accountingService.post(em, {
        farmId,
        date: expense.expenseDate,
        label: expense.label
          ? `Dépense ${expense.label}${expense.supplier ? ` (${expense.supplier})` : ''}`
          : `Dépense ${expense.category}`,
        source: 'EXPENSE',
        sourceId: `expense:${expense.id}`,
        lines: cashMovement
          ? [
              {
                account: expenseAccountForCategory(expense.category),
                debit: expense.amountFcfa,
              },
              { account: '571', credit: expense.amountFcfa },
            ]
          : [
              {
                account: expenseAccountForCategory(expense.category),
                debit: expense.amountFcfa,
              },
              { account: '401', credit: expense.amountFcfa },
            ],
        operatorId: user.id,
      });

      return expense;
    });
  }

  async update(
    user: AuthUser,
    farmId: string,
    expenseId: string,
    dto: UpdateExpenseDto,
  ): Promise<Expense> {
    await this.farmsService.assertAccessible(user, farmId);
    return this.dataSource.transaction(async (em) => {
      const expenseRepo = em.getRepository(Expense);
      const expense = await expenseRepo.findOne({
        where: { id: expenseId, farmId },
        lock: { mode: 'pessimistic_write' },
      });
      if (!expense) throw new NotFoundException('Dépense introuvable.');

      const oldCategory = expense.category;
      if (dto.category != null) expense.category = dto.category;
      if (dto.label != null) expense.label = dto.label;
      if (dto.supplier != null) expense.supplier = dto.supplier;
      if (dto.notes != null) expense.notes = dto.notes;
      if (dto.batchId != null || dto.batchId === null) {
        const batch = await this.resolveBatch(farmId, dto.batchId);
        expense.batchId = batch?.id ?? null;
      }
      const saved = await expenseRepo.save(expense);

      if (dto.category != null && dto.category !== oldCategory) {
        // Comptabilité : reclassement du compte de charge — débit nouveau
        // compte / crédit ancien compte, équilibré et idempotent (ajustement).
        const chargeAccount = expenseAccountForCategory(expense.category);
        await this.accountingService.postOrAdjust(
          em,
          {
            farmId,
            date: expense.expenseDate,
            label: expense.label
              ? `Dépense ${expense.label}${expense.supplier ? ` (${expense.supplier})` : ''}`
              : `Dépense ${expense.category}`,
            source: 'EXPENSE',
            sourceId: `expense:${expense.id}`,
            lines: expense.paidByCaisse
              ? [
                  {
                    account: chargeAccount,
                    debit: expense.amountFcfa,
                  },
                  { account: '571', credit: expense.amountFcfa },
                ]
              : [
                  {
                    account: chargeAccount,
                    debit: expense.amountFcfa,
                  },
                  { account: '401', credit: expense.amountFcfa },
                ],
            operatorId: user.id,
          },
          `expense:${expense.id}`,
        );
      }

      if (dto.label != null && saved.cashMovementId != null) {
        await em.getRepository(CashMovement).update(
          { id: saved.cashMovementId },
          { reason: dto.label ?? expense.category },
        );
      }
      return saved;
    });
  }

  async remove(
    user: AuthUser,
    farmId: string,
    expenseId: string,
  ): Promise<{ id: string }> {
    await this.farmsService.assertAccessible(user, farmId);
    return this.dataSource.transaction(async (em) => {
      const expense = await em.getRepository(Expense).findOne({
        where: { id: expenseId, farmId },
        lock: { mode: 'pessimistic_write' },
      });
      if (!expense) throw new NotFoundException('Dépense introuvable.');

      if (expense.cashMovementId != null) {
        const movement = await em.getRepository(CashMovement).findOne({
          where: { id: expense.cashMovementId },
        });
        const session = movement?.cashSessionId
          ? await em.getRepository(CashSession).findOne({
              where: { id: movement.cashSessionId },
            })
          : null;
        if (!session || session.status !== CashSessionStatus.OPEN) {
          throw new BadRequestException(
            'Dépense payée depuis une session de caisse clôturée : suppression refusée (écritures clôturées immuables).',
          );
        }
        await em.getRepository(CashMovement).delete(expense.cashMovementId);
      }

      // Comptabilité : contrepassation intégrale de l'écriture d'origine
      // (trésorerie ou fournisseur rendu + compte de charge annulé).
      const chargeAccount = expenseAccountForCategory(expense.category);
      await this.accountingService.post(em, {
        farmId,
        date: new Date().toISOString().slice(0, 10),
        label: expense.label
          ? `Suppression dépense ${expense.label}`
          : `Suppression dépense ${expense.category}`,
        source: 'EXPENSE',
        sourceId: `expense-cancel:${expense.id}`,
        lines: expense.paidByCaisse
          ? [
              {
                account: '571',
                debit: expense.amountFcfa,
                label: 'Caisse — espèces',
              },
              { account: chargeAccount, credit: expense.amountFcfa },
            ]
          : [
              {
                account: '401',
                debit: expense.amountFcfa,
                label: 'Fournisseurs — dettes',
              },
              { account: chargeAccount, credit: expense.amountFcfa },
            ],
        operatorId: user.id,
      });

      await em.getRepository(Expense).delete(expenseId);
      return { id: expenseId };
    });
  }

  // ---------- Sync / Backfill ----------

  /**
   * Synchronise les dépenses auto-créées pour une ferme.
   * 1. Lots avec chickUnitPriceFcfa > 0 sans dépense liée → crée ACHAT_POUSSINS + écriture compta.
   * 2. Intrants (input_lots) valorisés sans dépense [Auto] → crée la dépense (écriture compta déjà postée par l'intrant).
   * Idempotent : peut être relancé sans duplication.
   */
  async syncAutoExpenses(
    user: AuthUser,
    farmId: string,
  ): Promise<{ batchesSynced: number; inputsSynced: number }> {
    await this.farmsService.assertAccessible(user, farmId);

    return this.dataSource.transaction(async (em) => {
      let batchesSynced = 0;
      let inputsSynced = 0;

      // 1. Lots de production avec prix poussin > 0, sans dépense ACHAT_POUSSINS liée
      const batches = await em.getRepository(ProductionBatch).find({
        where: { farmId },
      });
      for (const batch of batches) {
        if (!batch.chickUnitPriceFcfa || batch.chickUnitPriceFcfa <= 0) continue;
        const totalFcfa = Math.round(batch.chickUnitPriceFcfa * batch.quantityAtStart);
        if (totalFcfa <= 0) continue;

        // Vérifier si une dépense ACHAT_POUSSINS existe déjà pour ce lot
        const existing = await em.getRepository(Expense).findOne({
          where: {
            farmId,
            batchId: batch.id,
            category: ExpenseCategory.ACHAT_POUSSINS,
          },
        });
        if (existing) continue;

        // Créer la dépense
        const expense = await em.getRepository(Expense).save(
          em.getRepository(Expense).create({
            farmId,
            batchId: batch.id,
            expenseDate: batch.integrationDate,
            category: ExpenseCategory.ACHAT_POUSSINS,
            amountFcfa: totalFcfa,
            label: `Achat ${batch.quantityAtStart} poussins — ${batch.batchName}`,
            supplier: batch.couvoirSupplier ?? null,
            notes: `[Auto] Créé lors de la synchronisation — lot ${batch.batchName}`,
            paidByCaisse: false,
            createdById: user.id,
          }),
        );

        // Écriture comptable (idempotente — post() dédup par sourceId)
        await this.accountingService.post(em, {
          farmId,
          date: batch.integrationDate,
          label: `Achat poussins — ${batch.batchName}`,
          source: 'EXPENSE',
          sourceId: `expense:${expense.id}`,
          lines: [
            { account: '6010', debit: totalFcfa },
            { account: '401', credit: totalFcfa },
          ],
          operatorId: user.id,
        });

        batchesSynced++;
        this.logger.log(
          `Sync: created expense for batch ${batch.batchName} (${totalFcfa} FCFA)`,
        );
      }

      // 2. Intrants valorisés sans dépense [Auto] existante
      const inputs = await em.getRepository(InputLot).find({
        where: { farmId },
      });
      for (const input of inputs) {
        const value = inputValueFcfa(input);
        if (value <= 0) continue;

        // Vérifier si une dépense [Auto] existe déjà pour cet intrant
        const autoNote = `[Auto] Intrant ${input.kind} — lot ${input.supplierLotNumber}`;
        const existing = await em.getRepository(Expense).findOne({
          where: {
            farmId,
            notes: autoNote,
          },
        });
        if (existing) continue;

        const expCategory = expenseCategoryForInputKind(input.kind);
        await em.getRepository(Expense).save(
          em.getRepository(Expense).create({
            farmId,
            batchId: input.batchId ?? null,
            expenseDate: input.receivedDate,
            category: expCategory,
            amountFcfa: value,
            label: `Réception ${input.productName}`,
            supplier: input.supplier || null,
            notes: autoNote,
            paidByCaisse: false,
            createdById: user.id,
          }),
        );

        // L'écriture compta existe déjà via la source INPUT — pas de double comptabilisation.
        inputsSynced++;
        this.logger.log(
          `Sync: created expense for input ${input.productName} (${value} FCFA)`,
        );
      }

      return { batchesSynced, inputsSynced };
    });
  }

  private async resolveBatch(
    farmId: string,
    batchId?: string,
  ): Promise<ProductionBatch | null> {
    if (!batchId) return null;
    const batch = await this.batchRepo.findOne({
      where: { id: batchId, farmId },
    });
    if (!batch) throw new NotFoundException('Lot de production introuvable.');
    return batch;
  }
}
