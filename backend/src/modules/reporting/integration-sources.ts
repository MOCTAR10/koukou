import { Injectable } from '@nestjs/common';
import { SanitaryAlertsService } from '../surveillance/sanitary-alerts.service.js';
import { DeclarativeStockService } from '../supply/declarative-stock.service.js';
import type {
  InputFarmSummary,
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

  constructor(private readonly stock: DeclarativeStockService) {}

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
