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
import { ProgrammeService } from '../programme/programme.service.js';
import {
  buildSynthesis,
  exportColumns,
  type FarmFigures,
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
 */
@Injectable()
export class EconomieService {
  constructor(
    @InjectDataSource() private readonly dataSource: DataSource,
    private readonly scope: ScopeResolver,
    private readonly programme: ProgrammeService,
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
    const { farms, columns } = await this.farmsOf(user, query.provinceId);
    const figures = await this.figures(farms, from, to, columns);
    return { from, to, ...buildSynthesis(figures, columns) };
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
    };
    if (this.scope.isInstitution(user)) {
      const access = await this.scope.requireAccess(user);
      if (!scopeReachesFarms(access.scopeKind)) {
        return { farms: [], columns };
      }
      this.scope.applyFarmScope(qb, 'f', access);
      columns = {
        sales: consults(access, 'ECONOMIQUE'),
        collected:
          consults(access, 'ECONOMIQUE') || consults(access, 'VENTES'),
        payroll: consults(access, 'EQUIPE'),
        stock: consults(access, 'INTRANTS'),
      };
    }
    const farms = await qb.getRawMany<{
      farmId: string;
      code: string | null;
      name: string;
      provinceCode: string | null;
      provinceName: string | null;
    }>();
    return { farms, columns };
  }

  private async figures(
    farms: Array<Pick<FarmFigures, 'farmId' | 'code' | 'name' | 'provinceCode' | 'provinceName'>>,
    from: string,
    to: string,
    columns: SynthesisColumns,
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
}
