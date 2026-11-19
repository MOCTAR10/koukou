import { ForbiddenException, Injectable, NotFoundException } from '@nestjs/common';
import { InjectDataSource } from '@nestjs/typeorm';
import { DataSource } from 'typeorm';
import { isUuid } from '../../common/context/request-context.js';
import type { AuthUser } from '../../common/decorators/current-user.decorator.js';
import { todayLocal } from '../../common/utils/date.utils.js';
import { OUT_OF_SCOPE_MESSAGE } from '../access/access-rules.js';
import { ConsentService } from './consent.service.js';
import { FinancingFile } from './entities/financing-file.entity.js';
import type * as C from './financing.contract.js';
import { FinancingPortfolioService } from './financing-portfolio.service.js';
import { FinancingViewService } from './financing-view.service.js';
import { addMonths } from './financing-rules.js';

const round = (n: number, digits = 1): number => {
  const k = 10 ** digits;
  return Math.round(n * k) / k;
};

/**
 * Farm 360° for the financer: the registry sheet and, by the caller's
 * matrix, the production, economics, State support and alerts blocks, composed
 * from the same tables as the pilotage (`bande_daily_stats`, sales, expenses,
 * input deliveries, advisory and published sanitary alerts, visits) in a
 * fixed number of queries. A block is null when the matrix lacks its domain;
 * the whole data part is a 403 when the farm is outside the caller's
 * perimeter (FINANCEMENT_PERIMETRE for the FINANCED scope).
 */
@Injectable()
export class FinancingOverviewService {
  constructor(
    @InjectDataSource() private readonly dataSource: DataSource,
    private readonly portfolio: FinancingPortfolioService,
    private readonly view: FinancingViewService,
    private readonly consents: ConsentService,
  ) {}

  async overview(user: AuthUser, farmId: string): Promise<C.Farm360> {
    const reach = await this.portfolio.reachOf(user);
    const farms: Array<Record<string, unknown>> = isUuid(farmId)
      ? await this.dataSource.query(
          `SELECT f.id, f.code, f.name, f.program_id, p.name AS province_name, l.name AS locality,
                  f.status_code, f.cohort, f.exploitant_name, f.exploitant_phone, f.capacity_places,
                  f.latitude, f.longitude
             FROM farms f
             LEFT JOIN provinces p ON p.id = f.province_id
             LEFT JOIN localites l ON l.id = f.localite_id
            WHERE f.id = $1`,
          [farmId],
        )
      : [];
    const f = farms[0];
    if (!f) throw new NotFoundException('Ferme introuvable.');
    // The financing routes reach every farm; the farm's DATA only its perimeter.
    if (!(await this.portfolio.farmsInReach(reach, [farmId])).has(farmId)) {
      throw new ForbiddenException(OUT_OF_SCOPE_MESSAGE);
    }
    const today = todayLocal();
    const q = <T>(sql: string, params: unknown[]): Promise<T[]> => this.dataSource.query(sql, params);
    const programId = f.program_id as string;

    const [status, lastVisit, bio] = await Promise.all([
      f.status_code
        ? q<{ label: string }>(
            `SELECT label FROM ref_items WHERE program_id = $1 AND list_type = 'STATUT_FERME' AND code = $2`,
            [programId, f.status_code],
          )
        : Promise.resolve([]),
      q<{ visit_date: string }>(`SELECT visit_date FROM farm_visits WHERE farm_id = $1 ORDER BY visit_date DESC LIMIT 1`, [farmId]),
      q<{ classification: string }>(
        `SELECT classification FROM farm_visits WHERE farm_id = $1 AND classification IS NOT NULL ORDER BY visit_date DESC, created_at DESC LIMIT 1`,
        [farmId],
      ),
    ]);

    const economics = reach.reads('ECONOMIQUE') ? await this.economics(farmId, today) : null;
    const settings = await this.view.settings();
    const entities = await this.dataSource.getRepository(FinancingFile).find({ where: { farmId }, order: { createdAt: 'DESC' } });
    const bundles = await this.view.bundles(entities, settings);
    const requirements = await this.view.requirements(programId);
    const limit = addMonths(today, 12);
    const annualDue = [...bundles.values()]
      .flatMap((b) => b.calc.instalments)
      .filter((i) => i.status !== 'PAYEE' && i.dueDate <= limit)
      .reduce((s, i) => s + (i.dueFcfa - i.paidFcfa), 0);

    return {
      farm: {
        id: farmId,
        code: (f.code as string | null) ?? '',
        name: f.name as string,
        provinceName: (f.province_name as string | null) ?? null,
        locality: (f.locality as string | null) ?? null,
        statusLabel: status[0]?.label ?? null,
        cohortLabel: (f.cohort as string | null) ?? null,
        exploitantName: (f.exploitant_name as string | null) ?? null,
        exploitantPhone: (f.exploitant_phone as string | null) ?? null,
        capacityPlaces: (f.capacity_places as number | null) ?? null,
        latitude: (f.latitude as number | null) ?? null,
        longitude: (f.longitude as number | null) ?? null,
        biosecurityClass: bio[0]?.classification ?? null,
        lastVisitOn: lastVisit[0]?.visit_date ?? null,
      },
      production: reach.reads('TECHNIQUE') ? await this.production(farmId, (f.capacity_places as number | null) ?? null, today) : null,
      economics,
      support: reach.reads('INTRANTS') ? await this.support(farmId) : null,
      alerts:
        reach.reads('TECHNIQUE') || reach.reads('SANITAIRE')
          ? await this.alerts(farmId, reach.reads('TECHNIQUE'), reach.reads('SANITAIRE'))
          : null,
      financing: {
        files: entities.map((e) => this.view.row(bundles.get(e.id)!, requirements)),
        consent: await this.consents.consentOfFarm(farmId, programId),
        debtServiceToMarginPct:
          economics && economics.marginFcfa > 0 && annualDue > 0
            ? round((annualDue / economics.marginFcfa) * 100)
            : null,
      },
    };
  }

  private async production(farmId: string, capacity: number | null, today: string): Promise<NonNullable<C.Farm360['production']>> {
    const q = <T>(sql: string, params: unknown[]): Promise<T[]> => this.dataSource.query(sql, params);
    const [bands, lastEntry, eggs, trend] = await Promise.all([
      q<{
        id: string; name: string | null; code: string | null; type: string; status: string;
        alive: number; start: number; fcr: number; age: number | null; deaths: number | null; weight: number | null;
      }>(
        `SELECT b.id, b.batch_name AS name, b.code, b.type, b.status, b.quantity_alive AS alive,
                b.quantity_at_start AS start, b.last_computed_fcr AS fcr,
                s.age_days AS age, s.deaths_cumulative AS deaths, s.last_weight_g AS weight
           FROM production_batches b
           LEFT JOIN LATERAL (SELECT age_days, deaths_cumulative, last_weight_g FROM bande_daily_stats
                               WHERE batch_id = b.id ORDER BY day DESC LIMIT 1) s ON true
          WHERE b.farm_id = $1 AND b.status IN ('ACTIF', 'EN_VENTE')
          ORDER BY b.integration_date`,
        [farmId],
      ),
      q<{ last: string | null }>(
        `SELECT MAX(e.entry_date) AS last FROM daily_entries e JOIN production_batches b ON b.id = e.batch_id WHERE b.farm_id = $1`,
        [farmId],
      ),
      q<{ eggs: string | null }>(
        `SELECT SUM(e.eggs_collected) AS eggs FROM daily_entries e JOIN production_batches b ON b.id = e.batch_id
          WHERE b.farm_id = $1 AND b.type = 'PONDEUSE' AND e.entry_date > ($2::date - 7)`,
        [farmId, today],
      ),
      q<{ week: string; deaths: string; avg_present: string | null }>(
        `SELECT date_trunc('week', day)::date AS week, SUM(deaths) AS deaths, AVG(present_start) AS avg_present
           FROM bande_daily_stats WHERE farm_id = $1 AND day > ($2::date - 84)
          GROUP BY 1 ORDER BY 1`,
        [farmId, today],
      ),
    ]);
    const birds = bands.reduce((s, b) => s + Number(b.alive), 0);
    const started = bands.reduce((s, b) => s + Number(b.start), 0);
    const deaths = bands.reduce((s, b) => s + Number(b.deaths ?? 0), 0);
    const fcrs = bands.map((b) => Number(b.fcr)).filter((v) => v > 0);
    const weighed = bands.filter((b) => b.weight !== null && Number(b.alive) > 0);
    const weighedBirds = weighed.reduce((s, b) => s + Number(b.alive), 0);
    const layers = bands.some((b) => b.type === 'PONDEUSE');
    return {
      openBands: bands.length,
      birdsPresent: birds,
      occupancyPct: capacity && capacity > 0 ? round((birds / capacity) * 100) : null,
      mortalityPct: started > 0 ? round((deaths / started) * 100, 2) : null,
      feedConversion: fcrs.length ? round(fcrs.reduce((s, v) => s + v, 0) / fcrs.length, 2) : null,
      avgWeightG: weighedBirds > 0 ? Math.round(weighed.reduce((s, b) => s + Number(b.weight) * Number(b.alive), 0) / weighedBirds) : null,
      eggsPerDay: layers ? Math.round(Number(eggs[0]?.eggs ?? 0) / 7) : null,
      lastEntryOn: lastEntry[0]?.last ?? null,
      mortalityTrend: trend.map((w) => ({
        label: String(w.week).slice(5).split('-').reverse().join('/'),
        value: Number(w.avg_present) > 0 ? round((Number(w.deaths) / Number(w.avg_present)) * 100, 2) : 0,
      })),
      bands: bands.map((b) => ({
        id: b.id,
        name: b.name ?? b.code ?? 'Bande',
        type: b.type,
        ageDays: b.age ?? 0,
        birds: Number(b.alive),
        mortalityPct: Number(b.start) > 0 ? round((Number(b.deaths ?? 0) / Number(b.start)) * 100, 2) : null,
        status: b.status,
      })),
    };
  }

  private async economics(farmId: string, today: string): Promise<NonNullable<C.Farm360['economics']>> {
    const q = <T>(sql: string, params: unknown[]): Promise<T[]> => this.dataSource.query(sql, params);
    const since = `${addMonths(`${today.slice(0, 7)}-01`, -11)}`;
    const [sales, expenses, collected, receivables] = await Promise.all([
      q<{ m: string; total: string }>(
        `SELECT to_char(sale_date, 'YYYY-MM') AS m, SUM(total_amount_fcfa) AS total FROM sales
          WHERE farm_id = $1 AND status <> 'CANCELLED' AND sale_date >= $2 GROUP BY 1`,
        [farmId, since],
      ),
      q<{ m: string; total: string }>(
        `SELECT to_char(expense_date, 'YYYY-MM') AS m, SUM(amount_fcfa) AS total FROM expenses
          WHERE farm_id = $1 AND expense_date >= $2 GROUP BY 1`,
        [farmId, since],
      ),
      q<{ total: string | null }>(
        `SELECT SUM(amount_fcfa) AS total FROM payments WHERE farm_id = $1 AND status = 'CONFIRMED' AND payment_date >= $2`,
        [farmId, since],
      ),
      q<{ total: string | null }>(
        `SELECT SUM(s.total_amount_fcfa - COALESCE(p.paid, 0)) AS total FROM sales s
           LEFT JOIN (SELECT sale_id, SUM(amount_fcfa) AS paid FROM payments WHERE status = 'CONFIRMED' GROUP BY sale_id) p
                  ON p.sale_id = s.id
          WHERE s.farm_id = $1 AND s.status = 'OUTSTANDING'`,
        [farmId],
      ),
    ]);
    const sm = new Map(sales.map((r) => [r.m, Number(r.total)]));
    const em = new Map(expenses.map((r) => [r.m, Number(r.total)]));
    const monthly = Array.from({ length: 12 }, (_, i) => {
      const month = addMonths(since, i).slice(0, 7);
      return { month, salesFcfa: sm.get(month) ?? 0, expensesFcfa: em.get(month) ?? 0 };
    });
    const salesFcfa = monthly.reduce((s, m) => s + m.salesFcfa, 0);
    const expensesFcfa = monthly.reduce((s, m) => s + m.expensesFcfa, 0);
    return {
      periodLabel: 'Douze derniers mois',
      salesFcfa,
      expensesFcfa,
      marginFcfa: salesFcfa - expensesFcfa,
      marginRatePct: salesFcfa > 0 ? round(((salesFcfa - expensesFcfa) / salesFcfa) * 100) : null,
      collectedFcfa: Number(collected[0]?.total ?? 0),
      receivablesFcfa: Math.max(0, Number(receivables[0]?.total ?? 0)),
      monthly,
    };
  }

  private async support(farmId: string): Promise<NonNullable<C.Farm360['support']>> {
    const rows: Array<{ deliveries: string; value: string | null; subsidy: string | null; last: string | null }> =
      await this.dataSource.query(
        `SELECT COUNT(DISTINCT d.id) AS deliveries,
                SUM(COALESCE(l.received_quantity, l.quantity) * COALESCE(l.unit_value_fcfa, 0)) AS value,
                SUM(COALESCE(l.subsidy_fcfa, 0)) AS subsidy,
                MAX(COALESCE(d.received_date, d.shipped_at)) AS last
           FROM input_deliveries d JOIN input_delivery_lines l ON l.delivery_id = d.id
          WHERE d.farm_id = $1 AND d.status = 'CONFIRMEE'`,
        [farmId],
      );
    const r = rows[0];
    return {
      deliveries: Number(r?.deliveries ?? 0),
      valueFcfa: Math.round(Number(r?.value ?? 0)),
      subsidyFcfa: Math.round(Number(r?.subsidy ?? 0)),
      lastDeliveryOn: r?.last ?? null,
    };
  }

  private async alerts(farmId: string, technical: boolean, sanitary: boolean): Promise<NonNullable<C.Farm360['alerts']>> {
    const q = <T>(sql: string, params: unknown[]): Promise<T[]> => this.dataSource.query(sql, params);
    const [advisory, official] = await Promise.all([
      technical
        ? q<{ message: string; level: string; since: string }>(
            `SELECT message, level, to_char("createdAt", 'YYYY-MM-DD') AS since FROM alerts
              WHERE farm_id = $1 AND status = 'ACTIVE' ORDER BY "createdAt" DESC LIMIT 20`,
            [farmId],
          )
        : Promise.resolve([]),
      sanitary
        ? // Published alerts only: an unpublished one stays with the farm and the vets.
          q<{ summary: string; severity: string; since: string }>(
            `SELECT summary, severity, to_char(fact_day, 'YYYY-MM-DD') AS since FROM sanitary_alerts
              WHERE farm_id = $1 AND closed_at IS NULL AND published_at IS NOT NULL ORDER BY fact_day DESC LIMIT 20`,
            [farmId],
          )
        : Promise.resolve([]),
    ]);
    return {
      open: advisory.length + official.length,
      sanitaryOpen: official.length,
      items: [
        ...official.map((a) => ({ label: a.summary, level: a.severity, since: a.since })),
        ...advisory.map((a) => ({ label: a.message, level: a.level, since: a.since })),
      ],
    };
  }
}
