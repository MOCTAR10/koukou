import { Injectable } from '@nestjs/common';
import { InjectDataSource } from '@nestjs/typeorm';
import { DataSource } from 'typeorm';
import { SanitaryAlertsService } from '../surveillance/sanitary-alerts.service.js';
import { DeclarativeStockService } from '../supply/declarative-stock.service.js';
import type {
  InputFarmSummary,
  InputPeriodLine,
  InputReconciliationSource,
} from './input-reconciliation.js';
import type {
  PublishedAlertQuery,
  PublishedAlertSource,
  PublishedSanitaryAlert,
} from './published-alerts.js';

/**
 * L5 → L6: the official sanitary alerts the veterinary authority published
 * (`SanitaryAlertsService`), in the steering's publication window. One
 * programme per instance, so `programId` needs no filter of its own.
 */
@Injectable()
export class SurveillancePublishedAlertSource implements PublishedAlertSource {
  readonly available = true;

  constructor(private readonly alerts: SanitaryAlertsService) {}

  async published(
    query: PublishedAlertQuery,
  ): Promise<PublishedSanitaryAlert[]> {
    const rows = await this.alerts.publishedAlerts({
      publishedFrom: query.from,
      publishedBefore: query.to,
      ...(query.provinceIds ? { provinceIds: query.provinceIds } : {}),
    });
    return rows.flatMap((a) =>
      a.publishedAt
        ? [
            {
              id: a.id,
              provinceId: a.provinceId,
              farmId: a.farmId,
              severity: a.severity,
              publishedAt: new Date(a.publishedAt),
            },
          ]
        : [],
    );
  }
}

/**
 * L4 → L6: the declarative stock summaries (`DeclarativeStockService`)
 * reshaped for the dashboards' input recoupement. The L4 « physical » stock
 * is what is left on the delivery lots (FEFO), null for chicks.
 */
@Injectable()
export class SupplyInputReconciliationSource
  implements InputReconciliationSource
{
  readonly available = true;

  constructor(
    private readonly stock: DeclarativeStockService,
    @InjectDataSource() private readonly dataSource: DataSource,
  ) {}

  /**
   * POUFA lot A: the delivery lines shipped in the period (not cancelled),
   * per input and unit, with their value and the State's subsidy (the
   * confirmation's split, else the expected one from the line's rate).
   */
  async periodLines(
    farmIds: readonly string[],
    period: { from: string; to: string },
  ): Promise<InputPeriodLine[]> {
    if (farmIds.length === 0) return [];
    const rows: Record<string, unknown>[] = await this.dataSource.query(
      `SELECT l.intrant_code, l.unit_code,
              MAX(ri.label) AS intrant_label, MAX(ru.label) AS unit_label,
              COUNT(DISTINCT d.id) AS deliveries,
              COUNT(DISTINCT d.farm_id) AS farms,
              SUM(l.quantity) AS shipped,
              COALESCE(SUM(l.received_quantity) FILTER (WHERE d.status = 'CONFIRMEE'), 0) AS received,
              COALESCE(SUM(l.quantity) FILTER (WHERE d.status = 'EXPEDIEE'), 0) AS pending,
              SUM(ROUND(COALESCE(l.received_quantity, l.quantity) * l.unit_value_fcfa)) AS value_fcfa,
              SUM(COALESCE(l.subsidy_fcfa,
                  ROUND(COALESCE(l.received_quantity, l.quantity) * l.unit_value_fcfa
                        * CASE WHEN l.subsidized
                               THEN LEAST(100, GREATEST(0, COALESCE(l.subsidy_rate, 0)))
                               ELSE 0 END / 100.0))) AS subsidy_fcfa,
              COUNT(*) FILTER (WHERE d.status = 'CONFIRMEE'
                                 AND l.received_quantity IS NOT NULL
                                 AND abs(l.received_quantity - l.quantity) > 1e-9) AS gaps
         FROM input_delivery_lines l
         JOIN input_deliveries d ON d.id = l.delivery_id
         JOIN farms f ON f.id = d.farm_id
         LEFT JOIN ref_items ri ON ri.program_id = f.program_id
              AND ri.list_type = 'INTRANT' AND ri.code = l.intrant_code
         LEFT JOIN ref_items ru ON ru.program_id = f.program_id
              AND ru.list_type = 'UNITE' AND ru.code = l.unit_code
        WHERE d.farm_id = ANY($1::uuid[])
          AND d.status <> 'ANNULEE'
          AND d.shipped_at BETWEEN $2::date AND $3::date
        GROUP BY l.intrant_code, l.unit_code
        ORDER BY l.intrant_code, l.unit_code`,
      [[...farmIds], period.from, period.to],
    );
    const num = (v: unknown) => (v == null ? null : Number(v));
    return rows.map((r) => ({
      inputCode: String(r.intrant_code),
      inputLabel: String(r.intrant_label ?? r.intrant_code),
      unitCode: String(r.unit_code),
      unitLabel: String(r.unit_label ?? r.unit_code),
      deliveries: Number(r.deliveries),
      farms: Number(r.farms),
      shipped: Number(r.shipped),
      received: Number(r.received),
      pending: Number(r.pending),
      valueFcfa: num(r.value_fcfa),
      subsidyFcfa: num(r.subsidy_fcfa),
      linesWithGap: Number(r.gaps),
    }));
  }

  async farmSummaries(
    farmIds: readonly string[],
  ): Promise<InputFarmSummary[]> {
    const summaries = await this.stock.farmSummaries(farmIds);
    return summaries.map((s) => ({
      farmId: s.farmId,
      deliveries: {
        pending: s.deliveries.pending,
        confirmed: s.deliveries.confirmed,
        cancelled: s.deliveries.cancelled,
        withGap: s.deliveries.withDiscrepancy,
      },
      inputs: s.intrants.map((i) => ({
        inputCode: i.intrantCode,
        pending: i.pending,
        shipped: i.shipped,
        received: i.received,
        used: i.used,
        declarativeStock: i.stock,
        physicalStock: i.physicalStock,
      })),
    }));
  }
}
