import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { InjectDataSource } from '@nestjs/typeorm';
import { DataSource } from 'typeorm';
import { isUuid } from '../../common/context/request-context.js';
import type { AuthUser } from '../../common/decorators/current-user.decorator.js';
import { DisbursementStatus } from '../../common/enums/financing.enum.js';
import { PdfService } from '../../common/services/pdf.service.js';
import { dateFr, fcfaFr, isRealIsoDate, todayLocal } from '../../common/utils/date.utils.js';
import { OUT_OF_SCOPE_MESSAGE } from '../access/access-rules.js';
import { AccountingService, type AccountSoldes } from '../accounting/accounting.service.js';
import { ParametersService } from '../programme/parameters.service.js';
import type * as C from './financing.contract.js';
import { FinancingFile } from './entities/financing-file.entity.js';
import { FinancingPortfolioService } from './financing-portfolio.service.js';
import { addMonths } from './financing-rules.js';
import { coveragePctOf, incompleteEntriesWarning, netResultWithStock } from './financing-statements-rules.js';
import { computeRatios, monthsCovered, type RatioInputs } from './financing-ratios.js';
import { FinancingService } from './financing.service.js';
import { FinancingViewService } from './financing-view.service.js';

export const COVERAGE_MIN_KEY = 'FINANCEMENT_COUVERTURE_DETTE_MIN';
export const LEVERAGE_MAX_KEY = 'FINANCEMENT_ENDETTEMENT_MAX';
/** Line of the income statement for the feed stock valued but not yet booked. */
const STOCK_VARIATION_LABEL = 'Variation de stock d’aliment (estimée)';
export const COVERAGE_ENTRIES_MIN_KEY = 'FINANCEMENT_COUVERTURE_SAISIE_MIN';
/** Seeded requirement under which the generated statements are filed. */
export const STATEMENTS_REQUIREMENT_CODE = 'INSTRUCTION_ETATS_FINANCIERS';

const line = (s: AccountSoldes, amountFcfa: number): C.StatementLine => ({
  code: s.code,
  label: s.label,
  amountFcfa,
});

/**
 * Financial statements of a farm for the financer, composed from the farm's
 * SYSCOHADA bookkeeping (`AccountingService`, read only: nothing is ever
 * initialised or written on the farm's books from here) and from its daily
 * entries (reliability, mortality). Figures are the farmer's own entries,
 * never audited, and say so.
 */
@Injectable()
export class FinancingStatementsService {
  constructor(
    @InjectDataSource() private readonly dataSource: DataSource,
    private readonly accounting: AccountingService,
    private readonly portfolio: FinancingPortfolioService,
    private readonly view: FinancingViewService,
    private readonly files: FinancingService,
    private readonly parameters: ParametersService,
    private readonly pdf: PdfService,
  ) {}

  /** COMPTABILITE:CONSULTER on the matrix and the farm inside the perimeter. */
  private async assertReach(user: AuthUser, farmId: string): Promise<void> {
    const reach = await this.portfolio.reachOf(user);
    if (!reach.reads('COMPTABILITE')) {
      throw new ForbiddenException(
        'Accès refusé : votre profil n’ouvre pas la comptabilité des fermes (droit « Comptabilité » en consultation).',
      );
    }
    if (!(await this.portfolio.farmsInReach(reach, [farmId])).has(farmId)) {
      throw new ForbiddenException(OUT_OF_SCOPE_MESSAGE);
    }
  }

  private period(from?: string, to?: string): { from: string; to: string } {
    const end = to ?? todayLocal();
    const start = from ?? addMonths(end, -12);
    for (const [v, name] of [[start, 'de début'], [end, 'de fin']] as const) {
      if (!isRealIsoDate(v)) throw new BadRequestException(`Date ${name} invalide (AAAA-MM-JJ).`);
    }
    if (start > end) throw new BadRequestException('La date de début doit précéder la date de fin.');
    if (monthsCovered(start, end) > 36) {
      throw new BadRequestException('La période ne peut pas dépasser 36 mois.');
    }
    return { from: start, to: end };
  }

  private q<T>(sql: string, params: unknown[]): Promise<T[]> {
    return this.dataSource.query(sql, params);
  }

  async financials(user: AuthUser, farmId: string, fromQ?: string, toQ?: string): Promise<C.FarmFinancials> {
    if (!isUuid(farmId)) throw new NotFoundException('Ferme introuvable.');
    const farm = await this.q<{ id: string }>(`SELECT id FROM farms WHERE id = $1`, [farmId]);
    if (farm.length === 0) throw new NotFoundException('Ferme introuvable.');
    await this.assertReach(user, farmId);
    const { from, to } = this.period(fromQ, toQ);
    const today = todayLocal();

    const [exercices, reliability] = await Promise.all([
      this.q<{ start_date: string; end_date: string; status: string }>(
        `SELECT start_date, end_date, status FROM accounting_exercices WHERE farm_id = $1 ORDER BY start_date`,
        [farmId],
      ),
      this.reliability(farmId, from, to),
    ]);
    const initialized = exercices.length > 0;
    const closed = exercices.some((e) => e.status === 'CLOSED' && e.start_date <= to && e.end_date >= to);
    const coverageMinPct = (await this.parameters.get<number>(COVERAGE_ENTRIES_MIN_KEY)) ?? 60;
    const base = {
      farmId,
      from,
      to,
      initialized,
      reliability: {
        ...reliability,
        closed,
        coveragePct: coveragePctOf(reliability.daysWithEntries, reliability.daysInPeriod),
        coverageMinPct,
      },
    };
    const thresholds = await this.thresholds();
    if (!initialized) {
      return {
        ...base,
        incomeStatement: null,
        balanceSheet: null,
        cash: null,
        ratios: computeRatios(this.emptyInputs(reliability.daysInPeriod), thresholds),
        beforeAfter: null,
      };
    }

    const result = await this.accounting.compteResultat(user, farmId, from, to);
    const bilan = await this.accounting.bilan(user, farmId, undefined, to);
    const products = result.produits.filter((s) => s.soldeFcfa !== 0).map((s) => line(s, -s.soldeFcfa));
    const charges = result.charges.filter((s) => s.soldeFcfa !== 0).map((s) => line(s, s.soldeFcfa));
    // The balance sheet adds the feed stock on hand (not yet booked in the
    // ledger) to its result: the income statement shows the same estimate as
    // its own line, so both results agree. Reused from the bilan, never recomputed.
    const stockVariationFcfa = bilan.variationStockFcfa;
    const netResultFcfa = netResultWithStock(result.resultatFcfa, stockVariationFcfa);
    const incomeStatement = {
      products,
      charges,
      revenueFcfa: result.totalProduits,
      chargesFcfa: result.totalCharges,
      stockVariationFcfa,
      netResultFcfa,
    };
    // The bilan's result runs from the start of the fiscal year containing `to`.
    const yearStart = bilan.exercice?.startDate ?? null;
    const resultLabel =
      yearStart && yearStart !== from ? `Résultat de l’exercice (depuis le ${dateFr(yearStart)})` : 'Résultat de la période';
    const liabilities: C.StatementLine[] = [
      ...bilan.capitaux.map((s) => line(s, -s.soldeFcfa)),
      { code: '12', label: resultLabel, amountFcfa: bilan.resultatFcfa },
      ...bilan.passif.map((s) => line(s, -s.soldeFcfa)),
    ];
    const balanceSheet = {
      asOf: bilan.asOf,
      assets: bilan.actif.map((s) => line(s, s.soldeFcfa)),
      liabilities,
      totalAssetsFcfa: bilan.totalActif,
      totalLiabilitiesFcfa: bilan.totalPassifExterne + bilan.totalCapitaux,
    };

    const due12m = await this.due12Months(farmId, today);
    const sum = (rows: AccountSoldes[], test: (s: AccountSoldes) => boolean, sign: 1 | -1 = 1) =>
      rows.filter(test).reduce((t, s) => t + sign * s.soldeFcfa, 0);
    const longDebt = sum(bilan.passif, (s) => s.code.startsWith('16') || s.code.startsWith('17'), -1);
    const overdraft = sum(bilan.passif, (s) => s.classe === 5, -1);
    const equity = bilan.totalCapitaux;
    const inputs: RatioInputs = {
      netResultFcfa,
      depreciationFcfa: result.charges
        .filter((s) => s.code.startsWith('68') || s.code.startsWith('69'))
        .reduce((t, s) => t + s.soldeFcfa, 0),
      revenueFcfa: result.totalProduits,
      due12mFcfa: due12m,
      netCashFcfa: sum(bilan.actif, (s) => s.classe === 5) - overdraft,
      receivablesFcfa: sum(bilan.actif, (s) => s.code.startsWith('41')),
      financialDebtFcfa: longDebt + overdraft,
      equityFcfa: equity,
      stableResourcesFcfa: equity + longDebt,
      fixedAssetsFcfa: sum(bilan.actif, (s) => s.classe === 2),
      daysInPeriod: reliability.daysInPeriod,
    };

    return {
      ...base,
      incomeStatement,
      balanceSheet,
      cash: await this.cash(farmId, from, to),
      ratios: computeRatios(inputs, thresholds),
      beforeAfter: await this.beforeAfter(user, farmId, today),
    };
  }

  private emptyInputs(daysInPeriod: number): RatioInputs {
    return {
      netResultFcfa: null,
      depreciationFcfa: null,
      revenueFcfa: null,
      due12mFcfa: null,
      netCashFcfa: null,
      receivablesFcfa: null,
      financialDebtFcfa: null,
      equityFcfa: null,
      stableResourcesFcfa: null,
      fixedAssetsFcfa: null,
      daysInPeriod,
    };
  }

  private async thresholds() {
    const [coverageMin, leverageMax] = await Promise.all([
      this.parameters.get<number>(COVERAGE_MIN_KEY),
      this.parameters.get<number>(LEVERAGE_MAX_KEY),
    ]);
    return { coverageMin: coverageMin ?? 1.2, leverageMax: leverageMax ?? 2 };
  }

  /** Days with something entered (daily entry or posted accounting entry), count of entries, last day. */
  private async reliability(farmId: string, from: string, to: string): Promise<Omit<C.FarmFinancials['reliability'], 'closed' | 'coveragePct' | 'coverageMinPct'>> {
    const daysInPeriod =
      (Date.parse(`${to}T00:00:00Z`) - Date.parse(`${from}T00:00:00Z`)) / 86_400_000 + 1;
    const rows = await this.q<{ with_entries: string; journal: string; last: string | null }>(
      `WITH d AS (
         SELECT e.entry_date AS day, 'D' AS kind FROM daily_entries e
           JOIN production_batches b ON b.id = e.batch_id
          WHERE b.farm_id = $1 AND e.entry_date BETWEEN $2 AND $3
         UNION ALL
         SELECT j.entry_date, 'J' FROM accounting_journal_entries j
          WHERE j.farm_id = $1 AND j.status = 'POSTED' AND j.entry_date BETWEEN $2 AND $3)
       SELECT COUNT(DISTINCT day) AS with_entries,
              COUNT(*) FILTER (WHERE kind = 'J') AS journal,
              MAX(day)::text AS last FROM d`,
      [farmId, from, to],
    );
    return {
      daysInPeriod,
      daysWithEntries: Number(rows[0].with_entries),
      journalEntries: Number(rows[0].journal),
      lastEntryOn: rows[0].last ?? null,
    };
  }

  /** Unpaid instalments falling in the next 12 months, every file of the farm. */
  private async due12Months(farmId: string, today: string): Promise<number> {
    const files = await this.dataSource.getRepository(FinancingFile).find({ where: { farmId } });
    if (files.length === 0) return 0;
    const bundles = await this.view.bundles(files, await this.view.settings());
    const limit = addMonths(today, 12);
    return [...bundles.values()]
      .flatMap((b) => b.calc.instalments)
      .filter((i) => i.status !== 'PAYEE' && i.dueDate <= limit)
      .reduce((s, i) => s + (i.dueFcfa - i.paidFcfa), 0);
  }

  /**
   * Cash view over class 5: per accounting entry the net movement of the
   * treasury accounts, so a transfer between cash and bank counts for nothing.
   */
  private async cash(farmId: string, from: string, to: string): Promise<NonNullable<C.FarmFinancials['cash']>> {
    const [opening, months] = await Promise.all([
      this.q<{ n: string | null }>(
        `SELECT SUM(l.debit_fcfa - l.credit_fcfa) AS n
           FROM accounting_journal_entries e JOIN accounting_journal_entry_lines l ON l.entry_id = e.id
          WHERE e.farm_id = $1 AND e.status = 'POSTED' AND l.account_code LIKE '5%' AND e.entry_date < $2`,
        [farmId, from],
      ),
      this.q<{ m: string; inflows: string; outflows: string }>(
        `SELECT to_char(x.entry_date, 'YYYY-MM') AS m,
                SUM(GREATEST(x.n, 0)) AS inflows, SUM(GREATEST(-x.n, 0)) AS outflows
           FROM (SELECT e.id, e.entry_date, SUM(l.debit_fcfa - l.credit_fcfa) AS n
                   FROM accounting_journal_entries e JOIN accounting_journal_entry_lines l ON l.entry_id = e.id
                  WHERE e.farm_id = $1 AND e.status = 'POSTED' AND l.account_code LIKE '5%'
                    AND e.entry_date BETWEEN $2 AND $3
                  GROUP BY e.id, e.entry_date) x
          GROUP BY 1`,
        [farmId, from, to],
      ),
    ]);
    const byMonth = new Map(months.map((r) => [r.m, r]));
    const monthly: Array<{ month: string; inflowsFcfa: number; outflowsFcfa: number }> = [];
    for (let m = from.slice(0, 7); m <= to.slice(0, 7); m = addMonths(`${m}-01`, 1).slice(0, 7)) {
      const r = byMonth.get(m);
      monthly.push({ month: m, inflowsFcfa: Number(r?.inflows ?? 0), outflowsFcfa: Number(r?.outflows ?? 0) });
    }
    const openingFcfa = Number(opening[0]?.n ?? 0);
    const inflowsFcfa = monthly.reduce((s, m) => s + m.inflowsFcfa, 0);
    const outflowsFcfa = monthly.reduce((s, m) => s + m.outflowsFcfa, 0);
    return { openingFcfa, inflowsFcfa, outflowsFcfa, closingFcfa: openingFcfa + inflowsFcfa - outflowsFcfa, monthly };
  }

  /** Headline figures in the 6 months before and after the first released tranche. */
  private async beforeAfter(user: AuthUser, farmId: string, today: string): Promise<C.FarmFinancials['beforeAfter']> {
    const pivots = await this.q<{ d: string | null }>(
      `SELECT MIN(d.released_on)::text AS d FROM financing_disbursements d
         JOIN financing_files f ON f.id = d.file_id
        WHERE f.farm_id = $1 AND d.status = $2`,
      [farmId, DisbursementStatus.DEBLOQUEE],
    );
    const pivot = pivots[0]?.d;
    if (!pivot) return null;
    const first = await this.q<{ d: string | null }>(
      `SELECT LEAST(
         (SELECT MIN(entry_date) FROM accounting_journal_entries WHERE farm_id = $1 AND status = 'POSTED'),
         (SELECT MIN(e.entry_date) FROM daily_entries e JOIN production_batches b ON b.id = e.batch_id WHERE b.farm_id = $1)
       )::text AS d`,
      [farmId],
    );
    const firstDay = first[0]?.d ?? null;
    const dayBefore = (iso: string) => new Date(Date.parse(`${iso}T00:00:00Z`) - 86_400_000).toISOString().slice(0, 10);
    const side = async (from: string, to: string) => {
      const start = firstDay && firstDay > from ? firstDay : from;
      const months = firstDay ? monthsCovered(start, to) : 0;
      if (months === 0) {
        return { months: 0, revenueFcfa: 0, chargesFcfa: 0, netResultFcfa: 0, mortalityPct: null };
      }
      const r = await this.accounting.compteResultat(user, farmId, start, to);
      const mort = await this.q<{ deaths: string | null; present: string | null }>(
        `SELECT SUM(deaths) AS deaths, AVG(present_start) AS present FROM bande_daily_stats
          WHERE farm_id = $1 AND day BETWEEN $2 AND $3`,
        [farmId, start, to],
      );
      const present = Number(mort[0]?.present ?? 0);
      return {
        months,
        revenueFcfa: r.totalProduits,
        chargesFcfa: r.totalCharges,
        netResultFcfa: r.resultatFcfa,
        mortalityPct: present > 0 ? Math.round((Number(mort[0].deaths ?? 0) / present) * 1000) / 10 : null,
      };
    };
    const afterEnd = addMonths(pivot, 6) > today ? today : dayBefore(addMonths(pivot, 6));
    return {
      pivotDate: pivot,
      before: await side(addMonths(pivot, -6), dayBefore(pivot)),
      after: await side(pivot, afterEnd),
    };
  }

  // ── PDF ──────────────────────────────────────────────────────────────────

  async pdfOf(user: AuthUser, farmId: string, from?: string, to?: string): Promise<{ buffer: Buffer; fileName: string }> {
    const data = await this.financials(user, farmId, from, to);
    const name = (await this.q<{ name: string }>(`SELECT name FROM farms WHERE id = $1`, [farmId]))[0].name;
    const n = (v: number) => String(v);
    const sections: Array<{ title: string; columns: string[]; rows: string[][]; totals?: { label: string; value: string }[] }> = [];
    if (data.incomeStatement) {
      const is = data.incomeStatement;
      sections.push(
        {
          title: 'Compte de résultat — produits',
          columns: ['Compte', 'Libellé', 'Montant (FCFA)'],
          rows: is.products.map((l) => [l.code, l.label, n(l.amountFcfa)]),
          totals: [{ label: 'Total produits', value: n(is.revenueFcfa) }],
        },
        {
          title: 'Compte de résultat — charges',
          columns: ['Compte', 'Libellé', 'Montant (FCFA)'],
          rows: is.charges.map((l) => [l.code, l.label, n(l.amountFcfa)]),
          totals: [
            { label: 'Total charges', value: n(is.chargesFcfa) },
            ...(is.stockVariationFcfa !== 0
              ? [{ label: `${STOCK_VARIATION_LABEL} (estimation, non comptabilisée)`, value: n(is.stockVariationFcfa) }]
              : []),
            { label: 'Résultat net', value: n(is.netResultFcfa) },
          ],
        },
      );
    }
    if (data.balanceSheet) {
      const b = data.balanceSheet;
      sections.push(
        {
          title: `Bilan au ${dateFr(b.asOf)} — actif`,
          columns: ['Compte', 'Libellé', 'Montant (FCFA)'],
          rows: b.assets.map((l) => [l.code, l.label, n(l.amountFcfa)]),
          totals: [{ label: 'Total actif', value: n(b.totalAssetsFcfa) }],
        },
        {
          title: `Bilan au ${dateFr(b.asOf)} — passif`,
          columns: ['Compte', 'Libellé', 'Montant (FCFA)'],
          rows: b.liabilities.map((l) => [l.code, l.label, n(l.amountFcfa)]),
          totals: [{ label: 'Total passif', value: n(b.totalLiabilitiesFcfa) }],
        },
      );
    }
    if (data.cash) {
      const c = data.cash;
      sections.push({
        title: 'Trésorerie',
        columns: ['Mois', 'Entrées (FCFA)', 'Sorties (FCFA)'],
        rows: c.monthly.map((m) => [m.month, n(m.inflowsFcfa), n(m.outflowsFcfa)]),
        totals: [
          { label: 'Trésorerie à l’ouverture', value: fcfaFr(c.openingFcfa) },
          { label: 'Trésorerie à la clôture', value: fcfaFr(c.closingFcfa) },
        ],
      });
    }
    const unit = (r: C.FarmFinancials['ratios'][number]) =>
      r.value === null ? 'non calculable' : r.unit === 'FCFA' ? fcfaFr(r.value) : `${r.value.toLocaleString('fr-FR')} ${r.unit}`;
    sections.push({
      title: 'Ratios',
      columns: ['Ratio', 'Valeur', 'Mode de calcul'],
      rows: data.ratios.map((r) => [r.label, unit(r), r.formula]),
    });
    const mention = `États issus de la saisie de l'exploitation dans Fermia, non audités. ${data.reliability.daysWithEntries} jours saisis sur ${data.reliability.daysInPeriod}.`;
    const buffer = await this.pdf.createAccountingPdf({
      farmName: `États financiers — ${name}`,
      title: 'Comptabilité SYSCOHADA',
      period: `Période du ${dateFr(data.from)} au ${dateFr(data.to)}${data.initialized ? '' : ' — comptabilité non ouverte par l’exploitation'}. ${mention}`,
      warnings: [incompleteEntriesWarning(data.reliability)].filter((w): w is string => w !== null),
      generatedAtLabel: dateFr(todayLocal()),
      sections,
      totals: [{ label: 'Mention', value: mention }],
    });
    return { buffer, fileName: `etats-financiers-${data.from}-${data.to}.pdf` };
  }

  /** Files the PDF on a financing file, under the seeded « états financiers » requirement. */
  async attachToFile(user: AuthUser, fileId: string, from: string, to: string): Promise<C.FinancingFile> {
    const { farmId } = await this.files.farmOfFile(fileId);
    const opened = await this.q<{ n: string }>(`SELECT COUNT(*) AS n FROM accounting_exercices WHERE farm_id = $1`, [farmId]);
    if (Number(opened[0].n) === 0) {
      throw new ConflictException('Cette exploitation n’a pas ouvert sa comptabilité dans Fermia : il n’y a pas d’états financiers à déposer.');
    }
    const period = this.period(from, to);
    const pdf = await this.pdfOf(user, farmId, period.from, period.to);
    return this.files.attachGenerated(user, fileId, {
      requirementCode: STATEMENTS_REQUIREMENT_CODE,
      label: `États financiers du ${dateFr(period.from)} au ${dateFr(period.to)}`,
      originalName: pdf.fileName,
      buffer: pdf.buffer,
    });
  }
}
