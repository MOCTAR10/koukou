import { BadRequestException, Injectable } from '@nestjs/common';
import { InjectDataSource } from '@nestjs/typeorm';
import { DataSource } from 'typeorm';
import type { AuthUser } from '../../common/decorators/current-user.decorator.js';
import { CsvService } from '../../common/services/csv.service.js';
import { toXlsx, XLSX_MIME } from '../../common/utils/spreadsheet.js';
import { consults, scopeReachesFarms } from '../access/access-rules.js';
import { ScopeResolver } from '../access/scope-resolver.service.js';
import { Farm } from '../farms/entities/farm.entity.js';
import { FeedStockService } from '../feed-stock/feed-stock.service.js';
import { ParametersService } from '../programme/parameters.service.js';
import { ProgrammeService } from '../programme/programme.service.js';
import {
  DAY_EXIT_KG,
  weighedSortiesCte,
} from '../reporting/pilotage-data.service.js';
import {
  eligibleBandSql,
  pilotageRulesAt,
  type PilotageRules,
} from '../reporting/pilotage-programme.js';
import {
  buildSynthesis,
  emptySums,
  exportColumns,
  synthesisFormulasOf,
  type FarmFigures,
  type FarmSums,
  type Synthesis,
  type SynthesisColumns,
} from './economie-synthesis.js';
import type {
  EconomieSynthesisExportDto,
  EconomieSynthesisQueryDto,
} from './economie.dto.js';

function today(): string {
  return new Date().toISOString().slice(0, 10);
}

/** Stock reads run a few farms at a time (one query set per farm). */
const STOCK_CONCURRENCY = 4;

/**
 * Programme-wide economic synthesis (POUFA lot A droits, user decision
 * 2026-11-06): sales, expenses, margin, cash collected, payroll and feed
 * stock of every farm in the caller's scope, per province and in total.
 * Platform admin, or an institution with ECONOMIQUE:CONSULTER (the route);
 * the other columns follow its matrix (VENTES, EQUIPE, INTRANTS).
 * POUFA lot A2 dge: plus the SYSCOHADA books (COMPTABILITE), the Market
 * (MARCHE) and the completeness and volumes produced of the programme bands
 * (TECHNIQUE); margin, completeness and volumes go through the `FORMULE_*`
 * in force at the end of the period (CDC §7.3).
 */
@Injectable()
export class EconomieService {
  constructor(
    @InjectDataSource() private readonly dataSource: DataSource,
    private readonly scope: ScopeResolver,
    private readonly programme: ProgrammeService,
    private readonly parameters: ParametersService,
    private readonly feedStock: FeedStockService,
    private readonly csv: CsvService,
  ) {}

  async synthesis(
    user: AuthUser,
    query: EconomieSynthesisQueryDto,
  ): Promise<Synthesis & { from: string; to: string }> {
    const to = query.to ?? today();
    const from = query.from ?? `${to.slice(0, 7)}-01`;
    if (from > to) {
      throw new BadRequestException(
        'La date de début doit précéder la date de fin.',
      );
    }
    const { farms, columns, programId } = await this.farmsOf(
      user,
      query.provinceId,
    );
    const rules = pilotageRulesAt(
      await this.parameters.resolver(programId),
      to < today() ? to : today(),
    );
    const figures = await this.figures(farms, from, to, columns, rules);
    return {
      from,
      to,
      ...buildSynthesis(figures, columns, synthesisFormulasOf(rules.formulas)),
    };
  }

  async export(user: AuthUser, query: EconomieSynthesisExportDto) {
    const s = await this.synthesis(user, query);
    const columns = exportColumns(s.columns);
    const headers = columns.map(([, h]) => h);
    const rows = [
      ...s.farms,
      ...s.provinces.map((p) => ({
        ...p,
        name: `Sous-total (${p.farmCount ?? 0} fermes)`,
      })),
      {
        ...s.total,
        provinceName: 'Programme',
        name: `Total (${s.total.farmCount ?? 0} fermes)`,
      },
    ].map((r) => columns.map(([k]) => r[k] ?? null));
    const baseName = `synthese-economique-${s.from}-${s.to}`;
    if (query.format === 'xlsx') {
      return {
        filename: `${baseName}.xlsx`,
        contentType: XLSX_MIME,
        buffer: await toXlsx(headers, rows, { sheetName: 'Synthèse' }),
      };
    }
    return {
      filename: `${baseName}.csv`,
      contentType: 'text/csv; charset=utf-8',
      buffer: this.csv.toCsv(headers, rows),
    };
  }

  /** Farms of the scope (all of them for the platform admin) and the columns read. */
  private async farmsOf(
    user: AuthUser,
    provinceId: string | undefined,
  ): Promise<{
    farms: Array<Pick<FarmFigures, 'farmId' | 'code' | 'name' | 'provinceCode' | 'provinceName'>>;
    columns: SynthesisColumns;
    programId: string;
  }> {
    const program = await this.programme.current();
    const qb = this.dataSource
      .getRepository(Farm)
      .createQueryBuilder('f')
      .leftJoin('f.province', 'p')
      .select('f.id', 'farmId')
      .addSelect('f.code', 'code')
      .addSelect('f.name', 'name')
      .addSelect('p.code', 'provinceCode')
      .addSelect('p.name', 'provinceName')
      .where('f.program_id = :programId', { programId: program.id });
    if (provinceId) qb.andWhere('f.province_id = :provinceId', { provinceId });
    let columns: SynthesisColumns = {
      sales: true,
      collected: true,
      payroll: true,
      stock: true,
      accounting: true,
      market: true,
      production: true,
    };
    if (this.scope.isInstitution(user)) {
      const access = await this.scope.requireAccess(user);
      if (!scopeReachesFarms(access.scopeKind)) {
        return { farms: [], columns, programId: program.id };
      }
      this.scope.applyFarmScope(qb, 'f', access);
      columns = {
        sales: consults(access, 'ECONOMIQUE'),
        collected:
          consults(access, 'ECONOMIQUE') || consults(access, 'VENTES'),
        payroll: consults(access, 'EQUIPE'),
        stock: consults(access, 'INTRANTS'),
        // POUFA lot A2 dge: each new column group from its own domain.
        accounting: consults(access, 'COMPTABILITE'),
        market: consults(access, 'MARCHE'),
        production: consults(access, 'TECHNIQUE'),
      };
    }
    const farms = await qb.getRawMany<{
      farmId: string;
      code: string | null;
      name: string;
      provinceCode: string | null;
      provinceName: string | null;
    }>();
    return { farms, columns, programId: program.id };
  }

  private async figures(
    farms: Array<Pick<FarmFigures, 'farmId' | 'code' | 'name' | 'provinceCode' | 'provinceName'>>,
    from: string,
    to: string,
    columns: SynthesisColumns,
    rules: PilotageRules,
  ): Promise<FarmFigures[]> {
    if (farms.length === 0) return [];
    const ids = farms.map((f) => f.farmId);
    const sum = async (
      sql: string,
      params: unknown[],
    ): Promise<Map<string, { total: number; count: number }>> => {
      const rows: Array<{ farmId: string; total: string | null; count: string }> =
        await this.dataSource.query(sql, params);
      return new Map(
        rows.map((r) => [
          r.farmId,
          { total: Number(r.total ?? 0), count: Number(r.count ?? 0) },
        ]),
      );
    };
    const empty = Promise.resolve(new Map<string, { total: number; count: number }>());
    const [sales, expenses, collected, payroll] = await Promise.all([
      columns.sales
        ? sum(
            `SELECT farm_id AS "farmId", SUM(total_amount_fcfa) AS total, COUNT(*) AS count
               FROM sales
              WHERE farm_id = ANY($1) AND status <> 'CANCELLED'
                AND sale_date BETWEEN $2 AND $3
              GROUP BY farm_id`,
            [ids, from, to],
          )
        : empty,
      columns.sales
        ? sum(
            `SELECT farm_id AS "farmId", SUM(amount_fcfa) AS total, COUNT(*) AS count
               FROM expenses
              WHERE farm_id = ANY($1) AND expense_date BETWEEN $2 AND $3
              GROUP BY farm_id`,
            [ids, from, to],
          )
        : empty,
      columns.collected
        ? sum(
            `SELECT farm_id AS "farmId", SUM(amount_fcfa) AS total, COUNT(*) AS count
               FROM payments
              WHERE farm_id = ANY($1) AND status = 'CONFIRMED'
                AND payment_date BETWEEN $2 AND $3
              GROUP BY farm_id`,
            [ids, from, to],
          )
        : empty,
      columns.payroll
        ? sum(
            `SELECT farm_id AS "farmId", SUM(COALESCE(salary_fcfa, 0)) AS total, COUNT(*) AS count
               FROM farm_employees
              WHERE farm_id = ANY($1) AND active = true
              GROUP BY farm_id`,
            [ids],
          )
        : empty,
    ]);
    const none = new Map<string, Partial<FarmSums>>();
    const [accounting, market, production] = await Promise.all([
      columns.accounting ? this.accounting(ids, from, to) : none,
      columns.market ? this.market(ids, from, to) : none,
      columns.production ? this.production(ids, from, to, rules) : none,
    ]);
    const stock = new Map<string, number>();
    if (columns.stock) {
      for (let i = 0; i < ids.length; i += STOCK_CONCURRENCY) {
        const chunk = ids.slice(i, i + STOCK_CONCURRENCY);
        const values = await Promise.all(
          chunk.map((id) => this.feedStock.availableKg(id)),
        );
        chunk.forEach((id, k) => stock.set(id, values[k]));
      }
    }
    return farms.map((f) => ({
      ...emptySums(),
      ...accounting.get(f.farmId),
      ...market.get(f.farmId),
      ...production.get(f.farmId),
      ...f,
      salesFcfa: sales.get(f.farmId)?.total ?? 0,
      salesCount: sales.get(f.farmId)?.count ?? 0,
      expensesFcfa: expenses.get(f.farmId)?.total ?? 0,
      collectedFcfa: collected.get(f.farmId)?.total ?? 0,
      payrollMonthlyFcfa: payroll.get(f.farmId)?.total ?? 0,
      employeeCount: payroll.get(f.farmId)?.count ?? 0,
      feedStockKg: stock.get(f.farmId) ?? 0,
    }));
  }

  /**
   * POUFA lot A2 dge: SYSCOHADA figures per farm. Charges (class 6) and
   * products (class 7) of the period, like the compte de résultat; treasury
   * (class 5) and customer receivables (411, 416) as balances at `to`, like
   * the bilan. Posted entries only; the class comes from the farm's plan.
   */
  private async accounting(
    ids: string[],
    from: string,
    to: string,
  ): Promise<Map<string, Partial<FarmSums>>> {
    const rows: Array<Record<string, string | null>> =
      await this.dataSource.query(
        `SELECT e.farm_id AS "farmId",
                SUM(l.debit_fcfa - l.credit_fcfa)
                  FILTER (WHERE a.classe = 6 AND e.entry_date >= $2) AS charges,
                SUM(l.credit_fcfa - l.debit_fcfa)
                  FILTER (WHERE a.classe = 7 AND e.entry_date >= $2) AS products,
                SUM(l.debit_fcfa - l.credit_fcfa)
                  FILTER (WHERE a.classe = 5) AS treasury,
                SUM(l.debit_fcfa - l.credit_fcfa)
                  FILTER (WHERE l.account_code IN ('411', '416')) AS receivables
           FROM accounting_journal_entry_lines l
           JOIN accounting_journal_entries e ON e.id = l.entry_id
           JOIN accounting_accounts a
             ON a.farm_id = e.farm_id AND a.code = l.account_code
          WHERE e.farm_id = ANY($1) AND e.status = 'POSTED'
            AND e.entry_date <= $3
          GROUP BY e.farm_id`,
        [ids, from, to],
      );
    return new Map(
      rows.map((r) => [
        String(r.farmId),
        {
          accountingChargesFcfa: Number(r.charges ?? 0),
          accountingProductsFcfa: Number(r.products ?? 0),
          treasuryFcfa: Number(r.treasury ?? 0),
          receivablesFcfa: Number(r.receivables ?? 0),
        },
      ]),
    );
  }

  /**
   * POUFA lot A2 dge: Market activity per farm. Requests received and
   * accepted in the period; orders delivered in the period (delivery
   * instant, UTC days), their amount and the birds and carcasses they carried.
   */
  private async market(
    ids: string[],
    from: string,
    to: string,
  ): Promise<Map<string, Partial<FarmSums>>> {
    const fromTs = `${from}T00:00:00.000Z`;
    const toTs = new Date(
      Date.parse(`${to}T00:00:00.000Z`) + 86_400_000,
    ).toISOString();
    const [requests, delivered]: Array<Array<Record<string, string | null>>> =
      await Promise.all([
        this.dataSource.query(
          `SELECT mo.farm_id AS "farmId",
                  COUNT(*) FILTER (WHERE mo.created_at >= $2 AND mo.created_at < $3) AS requests,
                  COUNT(*) FILTER (WHERE mo.accepted_at >= $2 AND mo.accepted_at < $3) AS accepted
             FROM market_orders mo
            WHERE mo.farm_id = ANY($1)
              AND ((mo.created_at >= $2 AND mo.created_at < $3)
                   OR (mo.accepted_at >= $2 AND mo.accepted_at < $3))
            GROUP BY mo.farm_id`,
          [ids, fromTs, toTs],
        ),
        this.dataSource.query(
          `SELECT o.farm_id AS "farmId", COUNT(DISTINCT o.id) AS delivered,
                  SUM(o.total_amount_fcfa) AS amount,
                  SUM(mo.quantity) FILTER (WHERE l.product = 'BIRDS') AS birds,
                  SUM(mo.quantity) FILTER (WHERE l.product = 'CARCASS') AS carcasses
             FROM orders o
             LEFT JOIN market_orders mo ON mo.order_id = o.id
             LEFT JOIN market_listings l ON l.id = mo.listing_id
            WHERE o.farm_id = ANY($1) AND o.source = 'MARKET'
              AND o.status = 'LIVRE'
              AND o.livred_at >= $2 AND o.livred_at < $3
            GROUP BY o.farm_id`,
          [ids, fromTs, toTs],
        ),
      ]);
    const out = new Map<string, Partial<FarmSums>>();
    for (const r of requests) {
      out.set(String(r.farmId), {
        marketRequests: Number(r.requests ?? 0),
        marketAccepted: Number(r.accepted ?? 0),
      });
    }
    for (const r of delivered) {
      out.set(String(r.farmId), {
        ...out.get(String(r.farmId)),
        marketDelivered: Number(r.delivered ?? 0),
        marketSalesFcfa: Number(r.amount ?? 0),
        marketBirds: Number(r.birds ?? 0),
        marketCarcasses: Number(r.carcasses ?? 0),
      });
    }
    return out;
  }

  /**
   * POUFA lot A2 dge: the facts of completeness and volumes produced per
   * farm, read like the steering's (programme bands of
   * `BANDE_TYPES_ELIGIBLES`, `bande_daily_stats`, weighed sorties first).
   */
  private async production(
    ids: string[],
    from: string,
    to: string,
    rules: PilotageRules,
  ): Promise<Map<string, Partial<FarmSums>>> {
    const rows: Array<Record<string, string | null>> =
      await this.dataSource.query(
        `WITH sf AS (SELECT unnest($1::uuid[]) AS id),
         ${weighedSortiesCte('$2', '$3')},
         st AS (
           SELECT s.farm_id, s.day, s.removals, s.entry_done,
                  ${DAY_EXIT_KG} AS exit_kg
             FROM bande_daily_stats s JOIN sf ON sf.id = s.farm_id
             JOIN production_batches eb ON eb.id = s.batch_id
                  AND ${eligibleBandSql('eb', '$5')}
             LEFT JOIN ws ON ws.batch_id = s.batch_id AND ws.day = s.day
            WHERE s.day >= $2::date AND s.day <= $3::date
         )
         SELECT farm_id AS "farmId",
                COUNT(*) FILTER (WHERE entry_done) AS entered,
                COUNT(*) FILTER (WHERE entry_done OR day < $4::date) AS elapsed,
                SUM(removals) AS exits, SUM(exit_kg) AS exit_kg
           FROM st GROUP BY farm_id`,
        [ids, from, to, today(), rules.eligibleBandKeys],
      );
    return new Map(
      rows.map((r) => [
        String(r.farmId),
        {
          daysEntered: Number(r.entered ?? 0),
          daysElapsed: Number(r.elapsed ?? 0),
          exitHeads: Number(r.exits ?? 0),
          exitKg: Number(r.exit_kg ?? 0),
        },
      ]),
    );
  }
}
