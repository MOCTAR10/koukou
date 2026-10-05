import { Injectable, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { In, Repository } from 'typeorm';
import { AuthUser } from '../../common/decorators/current-user.decorator.js';
import { AlertKind, AlertLevel } from '../../common/enums/alert-level.enum.js';
import { ReferenceKey } from '../../common/enums/reference-key.enum.js';
import { SaleStatus } from '../../common/enums/sale-status.enum.js';
import { PaymentStatus } from '../../common/enums/payment-method.enum.js';
import { BatchStatus } from '../../common/enums/batch-type.enum.js';
import {
  SaleItemProductType,
  SaleItemUnit,
} from '../../common/enums/sale-item-type.enum.js';
import { InputKind } from '../../common/enums/input-kind.enum.js';
import { FarmsService } from '../farms/farms.service.js';
import { AlertsService } from '../alerts/alerts.service.js';
import { ReferenceConstantsService } from '../reference-constants/reference-constants.service.js';
import { PdfService } from '../../common/services/pdf.service.js';
import { ProductionBatch } from '../batches/entities/production-batch.entity.js';
import { InputLot } from '../inputs/entities/input-lot.entity.js';
import { Farm } from '../farms/entities/farm.entity.js';
import { Sale } from './entities/sale.entity.js';
import { SaleItem } from './entities/sale-item.entity.js';
import { Expense } from './entities/expense.entity.js';
import { Payment } from './entities/payment.entity.js';

const CATEGORY_LABELS: Record<string, string> = {
  ACHAT_POUSSINS: 'Achat de poussins',
  ALIMENTS: 'Aliments / provende',
  VETERINAIRE: 'Vétérinaire / soins',
  TRANSPORT: 'Transport',
  EAU: 'Eau',
  ENERGIE_GAZ: 'Énergie & gaz',
  LOYER: 'Loyer',
  MAINTENANCE: 'Maintenance',
  ASSURANCE: 'Assurance',
  MAIN_D_OEUVRE: 'Main d’œuvre',
  COTISATIONS: 'Cotisations sociales',
  FRAIS_BANCAIRES: 'Frais bancaires',
  AUTRE: 'Autre',
};

const PRODUCT_LABELS: Record<string, string> = {
  POULET_PIECE: 'Poulet à la pièce',
  POULET_KG: 'Poulet au kilo',
  OEUFS: 'Œufs (alvéoles)',
  PROVENDE: 'Provende',
  AUTRE: 'Autre vente',
};

function todayStr(): string {
  return new Date().toISOString().slice(0, 10);
}

function daysAgoStr(n: number): string {
  const d = new Date();
  d.setUTCDate(d.getUTCDate() - n);
  return d.toISOString().slice(0, 10);
}

export interface BatchPnl {
  batchId: string;
  batchName: string | null;
  status: BatchStatus;
  revenueFcfa: number;
  expensesFcfa: number;
  netFcfa: number;
  marginPct: number | null;
  costPerKgFcfa: number | null;
  kgSold: number;
  birdsSold: number;
  eggsSold: number;
  breakdown: {
    byProduct: {
      productType: SaleItemProductType;
      label: string;
      quantity: number;
      amountFcfa: number;
    }[];
    byExpenseCategory: {
      category: string;
      label: string;
      amountFcfa: number;
    }[];
  };
  enrichment: {
    chickCostFcfa: number | null;
    feedLotsCostFcfa: number | null;
  };
}

export interface OverviewPnl {
  period: { from: string; to: string };
  sales: { count: number; totalFcfa: number };
  collectedFcfa: number;
  outstandingFcfa: number;
  expenses: { count: number; totalFcfa: number };
  netFcfa: number;
  breakdown: {
    byProduct: {
      productType: SaleItemProductType;
      label: string;
      quantity: number;
      amountFcfa: number;
    }[];
    byExpenseCategory: {
      category: string;
      label: string;
      amountFcfa: number;
    }[];
    byPaymentMethod: { method: string; label: string; amountFcfa: number }[];
  };
}

@Injectable()
export class RentabiliteService {
  constructor(
    @InjectRepository(Sale)
    private readonly saleRepo: Repository<Sale>,
    @InjectRepository(SaleItem)
    private readonly itemRepo: Repository<SaleItem>,
    @InjectRepository(Expense)
    private readonly expenseRepo: Repository<Expense>,
    @InjectRepository(Payment)
    private readonly paymentRepo: Repository<Payment>,
    @InjectRepository(ProductionBatch)
    private readonly batchRepo: Repository<ProductionBatch>,
    @InjectRepository(InputLot)
    private readonly inputRepo: Repository<InputLot>,
    @InjectRepository(Farm)
    private readonly farmRepo: Repository<Farm>,
    private readonly farmsService: FarmsService,
    private readonly alertsService: AlertsService,
    private readonly constants: ReferenceConstantsService,
    private readonly pdfService: PdfService,
  ) {}

  async getOverview(
    user: AuthUser,
    farmId: string,
    from?: string,
    to?: string,
  ): Promise<OverviewPnl> {
    await this.farmsService.assertAccessible(user, farmId);
    const f = from ?? daysAgoStr(29);
    const t = to ?? todayStr();
    return this.buildOverview(farmId, f, t);
  }

  private async buildOverview(
    farmId: string,
    from: string,
    to: string,
  ): Promise<OverviewPnl> {
    const qb = this.saleRepo
      .createQueryBuilder('sale')
      .where('sale.farm_id = :farmId', { farmId })
      .andWhere('sale.sale_date >= :from', { from })
      .andWhere('sale.sale_date <= :to', { to });
    const sales = await qb.getMany();
    const activeSales = sales.filter((s) => s.status !== SaleStatus.CANCELLED);
    const salesTotal = activeSales.reduce((s, x) => s + x.totalAmountFcfa, 0);

    const saleIds = activeSales.map((s) => s.id);
    const items = saleIds.length
      ? await this.itemRepo.find({ where: { saleId: In(saleIds) } })
      : [];

    const byProductMap = new Map<
      SaleItemProductType,
      {
        productType: SaleItemProductType;
        label: string;
        quantity: number;
        amountFcfa: number;
      }
    >();
    for (const it of items) {
      const acc = byProductMap.get(it.productType) ?? {
        productType: it.productType,
        label: PRODUCT_LABELS[it.productType] ?? it.productType,
        quantity: 0,
        amountFcfa: 0,
      };
      acc.quantity += it.quantity;
      acc.amountFcfa += it.amountFcfa;
      byProductMap.set(it.productType, acc);
    }

    // 1) Recouvrements confirmés sur la période
    const payRows = await this.paymentRepo
      .createQueryBuilder('p')
      .where('p.farm_id = :farmId', { farmId })
      .andWhere('p.payment_date >= :from', { from })
      .andWhere('p.payment_date <= :to', { to })
      .andWhere('p.status = :status', { status: PaymentStatus.CONFIRMED })
      .getMany();
    const collectedFcfa = payRows.reduce((s, p) => s + p.amountFcfa, 0);

    // 2) Reste à recouvrer sur les ventes (toutes non annulées, non limitées à la période)
    const allActive = await this.saleRepo.find({
      where: { farmId },
    });
    const activeAll = allActive.filter(
      (s) => s.status !== SaleStatus.CANCELLED,
    );
    const idsAll = activeAll.map((s) => s.id);
    let outstandingFcfa = 0;
    if (idsAll.length) {
      const allPaid = await this.paymentRepo.find({
        where: { saleId: In(idsAll), status: PaymentStatus.CONFIRMED },
      });
      const paidBySale = new Map<string, number>();
      for (const p of allPaid) {
        paidBySale.set(
          p.saleId,
          (paidBySale.get(p.saleId) ?? 0) + p.amountFcfa,
        );
      }
      outstandingFcfa = activeAll.reduce(
        (s, x) =>
          s + Math.max(0, x.totalAmountFcfa - (paidBySale.get(x.id) ?? 0)),
        0,
      );
    }

    const expenses = await this.expenseRepo
      .createQueryBuilder('e')
      .where('e.farm_id = :farmId', { farmId })
      .andWhere('e.expense_date >= :from', { from })
      .andWhere('e.expense_date <= :to', { to })
      .getMany();
    const expensesTotal = expenses.reduce((s, e) => s + e.amountFcfa, 0);

    const byExpenseMap = new Map<
      string,
      { category: string; label: string; amountFcfa: number }
    >();
    for (const e of expenses) {
      const acc = byExpenseMap.get(e.category) ?? {
        category: e.category,
        label: CATEGORY_LABELS[e.category] ?? e.category,
        amountFcfa: 0,
      };
      acc.amountFcfa += e.amountFcfa;
      byExpenseMap.set(e.category, acc);
    }

    const byMethodMap = new Map<
      string,
      { method: string; label: string; amountFcfa: number }
    >();
    for (const p of payRows) {
      const acc = byMethodMap.get(p.method) ?? {
        method: p.method,
        label: p.method === 'CASH' ? 'Espèces' : p.method,
        amountFcfa: 0,
      };
      acc.amountFcfa += p.amountFcfa;
      byMethodMap.set(p.method, acc);
    }

    return {
      period: { from, to },
      sales: { count: activeSales.length, totalFcfa: salesTotal },
      collectedFcfa,
      outstandingFcfa,
      expenses: { count: expenses.length, totalFcfa: expensesTotal },
      netFcfa: salesTotal - expensesTotal,
      breakdown: {
        byProduct: [...byProductMap.values()],
        byExpenseCategory: [...byExpenseMap.values()],
        byPaymentMethod: [...byMethodMap.values()],
      },
    };
  }

  async getBatchPnl(
    user: AuthUser,
    farmId: string,
    batchId: string,
  ): Promise<BatchPnl> {
    await this.farmsService.assertAccessible(user, farmId);
    const batch = await this.batchRepo.findOne({
      where: { id: batchId, farmId },
    });
    if (!batch) throw new NotFoundException('Lot de production introuvable.');
    return this.computeBatchPnl(farmId, batch.id);
  }

  async computeBatchPnl(farmId: string, batchId: string): Promise<BatchPnl> {
    const batch = await this.batchRepo.findOne({ where: { id: batchId } });
    const batchBase = {
      batchId,
      batchName: batch?.batchName ?? null,
      status: batch?.status ?? ('' as BatchStatus),
    };

    const sales = await this.saleRepo.find({
      where: { farmId },
    });
    const activeIds = sales
      .filter((s) => s.status !== SaleStatus.CANCELLED)
      .map((s) => s.id);

    const items = activeIds.length
      ? await this.itemRepo.find({
          where: { saleId: In(activeIds), batchId },
        })
      : [];

    let revenueFcfa = 0;
    let kgSold = items
      .filter((i) => i.productType === SaleItemProductType.POULET_KG)
      .reduce((s, i) => s + i.quantity, 0);
    let birdsSold = items
      .filter((i) => i.productType === SaleItemProductType.POULET_PIECE)
      .reduce((s, i) => s + (i.pieceCount ?? Math.ceil(i.quantity)), 0);
    for (const i of items) {
      revenueFcfa += i.amountFcfa;
      if (
        i.productType === SaleItemProductType.POULET_KG &&
        i.pieceCount != null
      ) {
        birdsSold += i.pieceCount;
      }
    }
    const eggsSold = items
      .filter(
        (i) =>
          i.productType === SaleItemProductType.OEUFS &&
          i.unit === SaleItemUnit.ALVEOLES,
      )
      .reduce((s, i) => s + i.quantity, 0);

    const expenses = await this.expenseRepo.find({
      where: { farmId, batchId },
    });
    const expensesFcfa = expenses.reduce((s, e) => s + e.amountFcfa, 0);

    // Déduction automatique des coûts d'intrants (optionnels) : poussins et
    // aliments liés au lot. Ne pas les ressaisir en dépenses manuelles.
    let chickCostFcfa: number | null = null;
    let feedLotsCostFcfa: number | null = null;
    if (batch?.chickUnitPriceFcfa != null && batch.quantityAtStart) {
      chickCostFcfa = batch.chickUnitPriceFcfa * batch.quantityAtStart;
    }
    const feedLots = await this.inputRepo.find({
      where: { batchId, farmId, kind: InputKind.ALIMENT },
    });
    if (feedLots.length > 0) {
      const total = feedLots.reduce(
        (s, l) => s + l.quantity * (l.unitPriceFcfa ?? 0),
        0,
      );
      feedLotsCostFcfa = total > 0 ? total : null;
    }
    const inputsCostFcfa = (chickCostFcfa ?? 0) + (feedLotsCostFcfa ?? 0);
    const totalCostFcfa = expensesFcfa + inputsCostFcfa;

    const netFcfa = revenueFcfa - totalCostFcfa;
    const marginPct = revenueFcfa > 0 ? (netFcfa / revenueFcfa) * 100 : null;
    const costPerKgFcfa =
      kgSold > 0 ? Math.round((totalCostFcfa / kgSold) * 100) / 100 : null;

    const byExpenseMap = new Map<
      string,
      { category: string; label: string; amountFcfa: number }
    >();
    for (const e of expenses) {
      const acc = byExpenseMap.get(e.category) ?? {
        category: e.category,
        label: CATEGORY_LABELS[e.category] ?? e.category,
        amountFcfa: 0,
      };
      acc.amountFcfa += e.amountFcfa;
      byExpenseMap.set(e.category, acc);
    }

    const byProductMap = new Map<
      SaleItemProductType,
      {
        productType: SaleItemProductType;
        label: string;
        quantity: number;
        amountFcfa: number;
      }
    >();
    for (const it of items) {
      const acc = byProductMap.get(it.productType) ?? {
        productType: it.productType,
        label: PRODUCT_LABELS[it.productType] ?? it.productType,
        quantity: 0,
        amountFcfa: 0,
      };
      acc.quantity += it.quantity;
      acc.amountFcfa += it.amountFcfa;
      byProductMap.set(it.productType, acc);
    }

    // Enrichissement : coût poussins réel (si renseigné) + prix des intrants alimentaires liés.
    return {
      ...batchBase,
      revenueFcfa,
      expensesFcfa,
      netFcfa,
      marginPct,
      costPerKgFcfa,
      kgSold,
      birdsSold,
      eggsSold,
      breakdown: {
        byProduct: [...byProductMap.values()],
        byExpenseCategory: [...byExpenseMap.values()],
      },
      enrichment: { chickCostFcfa, feedLotsCostFcfa },
    };
  }

  /** Alerte rentabilité d'un lot : ROUGE si perte nette, JAUNE si marge < seuil. */
  async evaluateForBatch(farmId: string, batchId: string): Promise<void> {
    const pnl = await this.computeBatchPnl(farmId, batchId);
    const threshold = await this.constants.get(
      ReferenceKey.RENTABILITE_MARGE_MIN_PCT,
      5,
    );

    if (pnl.revenueFcfa === 0 && pnl.expensesFcfa === 0) {
      await this.alertsService.clearKind(
        farmId,
        batchId,
        AlertKind.RENTABILITE,
      );
      return;
    }

    if (pnl.netFcfa < 0) {
      await this.alertsService.raise(
        {
          kind: AlertKind.RENTABILITE,
          level: AlertLevel.ROUGE,
          message: `Le lot ${pnl.batchName ?? ''} est en perte : revenus ${pnl.revenueFcfa} FCFA pour des dépenses de ${pnl.expensesFcfa} FCFA.`,
          recommendation:
            'Réviser la structure de coûts (aliment, intrants) et/ou le prix de vente avant clôture définitive — objectiver la décision d’arrêt du lot.',
          context: { netFcfa: pnl.netFcfa, marginPct: pnl.marginPct },
        },
        { farmId, batchId },
      );
    } else if (pnl.marginPct != null && pnl.marginPct < threshold) {
      await this.alertsService.raise(
        {
          kind: AlertKind.RENTABILITE,
          level: AlertLevel.JAUNE,
          message: `Marge nette du lot ${pnl.batchName ?? ''} faible : ${pnl.marginPct.toFixed(1)} % (seuil recommandé ${threshold} %).`,
          recommendation:
            'Comparer le prix de vente au kilo au coût de revient et ajuster avant la fin du lot.',
          context: { netFcfa: pnl.netFcfa, marginPct: pnl.marginPct },
        },
        { farmId, batchId },
      );
    } else {
      await this.alertsService.clearKind(
        farmId,
        batchId,
        AlertKind.RENTABILITE,
      );
    }
  }

  /** Alerte vente : lot en EN_VENTE sans vente confirmée depuis N jours. */
  async evaluateInvendus(farmId: string): Promise<void> {
    const days = await this.constants.get(ReferenceKey.VENTE_INVENDUS_DAYS, 5);
    const since = daysAgoStr(days);
    const batches = await this.batchRepo.find({
      where: { farmId, status: BatchStatus.EN_VENTE },
    });

    for (const batch of batches) {
      const [viaSale, viaItems] = await Promise.all([
        this.saleRepo
          .createQueryBuilder('sale')
          .select('MAX(sale.sale_date)', 'max')
          .where('sale.farm_id = :farmId', { farmId })
          .andWhere('sale.batch_id = :batchId', { batchId: batch.id })
          .andWhere('sale.status != :cancelled', {
            cancelled: SaleStatus.CANCELLED,
          })
          .getRawOne<{ max: string | null }>(),
        this.itemRepo
          .createQueryBuilder('item')
          .select('MAX(sale.sale_date)', 'max')
          .innerJoin(Sale, 'sale', 'sale.id = item.sale_id')
          .where('sale.farm_id = :farmId', { farmId })
          .andWhere('item.batch_id = :batchId', { batchId: batch.id })
          .andWhere('sale.status != :cancelled', {
            cancelled: SaleStatus.CANCELLED,
          })
          .getRawOne<{ max: string | null }>(),
      ]);
      const candidates = [viaSale?.max, viaItems?.max].filter(
        (v): v is string => !!v,
      );
      const lastSaleDate = candidates.length
        ? candidates.reduce((a, b) => (a > b ? a : b))
        : null;

      if (!lastSaleDate || lastSaleDate < since) {
        await this.alertsService.raise(
          {
            kind: AlertKind.VENTE,
            level: AlertLevel.JAUNE,
            message: `Lot « ${batch.batchName ?? batch.id.slice(0, 8)} » en vente sans écoulement confirmé depuis ${days} jours.`,
            recommendation:
              'Relancer la mise en avant du lot (débouchés B2B/B2C) ou réévaluer le prix pour éviter la surcharge du bâtiment.',
            context: {
              lastSaleDate,
              days,
            },
          },
          { farmId, batchId: batch.id },
        );
      } else {
        await this.alertsService.clearKind(farmId, batch.id, AlertKind.VENTE);
      }
    }
  }

  async exportOverviewPdf(
    user: AuthUser,
    farmId: string,
    from?: string,
    to?: string,
  ): Promise<Buffer> {
    const farm = await this.farmsService.assertAccessible(user, farmId);
    const overview = await this.getOverview(user, farmId, from, to);
    const rows = [
      ...overview.breakdown.byProduct.map((p) => ({
        label: `${p.label} (${p.quantity} ${p.productType === 'OEUFS' ? 'alvéoles' : p.productType === 'POULET_KG' || p.productType === 'PROVENDE' ? 'kg' : 'unités'})`,
        value: String(p.amountFcfa),
      })),
      ...overview.breakdown.byProduct.map(() => ({ label: '', value: '' })),
      {
        label: 'Recouvrements (encaissés sur la période)',
        value: String(overview.collectedFcfa),
      },
      {
        label: 'Reste à recouvrer (créances)',
        value: String(overview.outstandingFcfa),
      },
      ...overview.breakdown.byExpenseCategory.map((e) => ({
        label: `Dépense — ${e.label}`,
        value: String(e.amountFcfa),
      })),
    ].filter((r) => r.label !== '' || r.value !== '');
    const totals = [
      { label: 'Total ventes', value: String(overview.sales.totalFcfa) },
      { label: 'Total dépenses', value: String(overview.expenses.totalFcfa) },
      { label: 'Résultat net', value: String(overview.netFcfa) },
    ];
    return this.pdfService.createPnlReportPdf({
      farmName: farm.name,
      title: 'Rapport de période — Commerce & résultats',
      period: `Du ${overview.period.from} au ${overview.period.to} — ${overview.sales.count} vente(s)`,
      rows,
      totals,
      grossMarginPct:
        overview.sales.totalFcfa > 0
          ? (overview.netFcfa / overview.sales.totalFcfa) * 100
          : null,
    });
  }

  async exportBatchPnlPdf(
    user: AuthUser,
    farmId: string,
    batchId: string,
  ): Promise<Buffer> {
    const farm = await this.farmsService.assertAccessible(user, farmId);
    const pnl = await this.getBatchPnl(user, farmId, batchId);
    const rows = [
      ...pnl.breakdown.byProduct.map((p) => ({
        label: `${p.label} (${p.quantity})`,
        value: String(p.amountFcfa),
      })),
      {
        label: 'Coût poussins (auto)',
        value:
          pnl.enrichment.chickCostFcfa != null
            ? String(pnl.enrichment.chickCostFcfa)
            : '—',
      },
      {
        label: 'Intrants alimentaires liés (auto)',
        value:
          pnl.enrichment.feedLotsCostFcfa != null
            ? String(pnl.enrichment.feedLotsCostFcfa)
            : '—',
      },
      ...pnl.breakdown.byExpenseCategory.map((e) => ({
        label: `Dépense — ${e.label}`,
        value: String(e.amountFcfa),
      })),
    ];
    const totals = [
      { label: 'Revenus', value: String(pnl.revenueFcfa) },
      {
        label: 'Dont coûts d’intrants déduits',
        value: String(
          (pnl.enrichment.chickCostFcfa ?? 0) +
            (pnl.enrichment.feedLotsCostFcfa ?? 0),
        ),
      },
      { label: 'Dépenses', value: String(pnl.expensesFcfa) },
      { label: 'Résultat net', value: String(pnl.netFcfa) },
      ...(pnl.costPerKgFcfa != null
        ? [{ label: 'Coût de revient au kilo', value: `${pnl.costPerKgFcfa}` }]
        : []),
    ];
    return this.pdfService.createPnlReportPdf({
      farmName: farm.name,
      title: `Compte de résultat du lot${pnl.batchName ? ` — ${pnl.batchName}` : ''}`,
      period: `${pnl.kgSold} kg vendus · ${pnl.birdsSold} poulets · ${pnl.eggsSold} alvéoles d'œufs`,
      rows,
      totals,
      grossMarginPct: pnl.marginPct,
    });
  }
}
