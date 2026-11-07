import { Injectable, Logger } from '@nestjs/common';
import { InjectDataSource } from '@nestjs/typeorm';
import { DataSource } from 'typeorm';
import { BatchStatus } from '../../common/enums/batch-type.enum.js';
import { ProgramListType } from '../../common/enums/program-list-type.enum.js';
import {
  QrScanResult,
  TraceLotStatus,
} from '../../common/enums/trace.enum.js';
import type { BatchType } from '../../common/enums/batch-type.enum.js';
import type { Species } from '../../common/enums/species.enum.js';
import type { TraceLotKind } from '../../common/enums/trace.enum.js';
import { QrScan } from './entities/qr-scan.entity.js';
import { geoCellOf } from './qr-signature.js';
import { toPublicLotView, type PublicLotView } from './public-lot-view.js';
import { isLotCodeShape } from './trace-codes.js';
import { TraceConfigService } from './trace-config.service.js';
import { effectiveLotStatus } from './trace-lots.service.js';

export interface ScanRequest {
  code: string;
  signature: string | null | undefined;
  ip: string | null | undefined;
  userAgent: string | null | undefined;
  lat?: unknown;
  lng?: unknown;
}

export type ScanOutcome =
  // A closed lot stays readable (« Lot terminé » with its origin): the birds
  // are still being sold after the band is closed. Only unknown or forged
  // codes are rejected.
  | {
      result: QrScanResult.OK | QrScanResult.CLOS;
      view: PublicLotView;
    }
  | { result: Exclude<QrScanResult, QrScanResult.OK | QrScanResult.CLOS> };

/** Scan counts of a lot, for the fraud indicators of the dashboards. */
export interface ScanIndicators {
  lotId: string;
  scans: number;
  ok: number;
  /** Badly signed scans of a known code: forged or altered QR codes. */
  badSignature: number;
  /** Scans after the lot was closed. */
  afterClosure: number;
  /** Distinct devices / networks (IP fingerprints). */
  distinctDevices: number;
  /** Distinct coarse areas (scans sent with a position only). */
  distinctAreas: number;
  firstAt: Date | null;
  lastAt: Date | null;
}

export interface FraudThresholds {
  /** Scans of one lot from which it is flagged (default 200). */
  maxScans?: number;
  /** Distinct areas from which it is flagged (default 3). */
  maxAreas?: number;
  /** Only scans since this instant. */
  since?: Date;
}

interface LotRow {
  id: string;
  code: string;
  kind: TraceLotKind;
  status: TraceLotStatus;
  parentId: string | null;
  quantity: number;
  cededOn: string | null;
  qrToken: string;
  farmName: string;
  localiteName: string | null;
  provinceName: string | null;
  bandCode: string | null;
  bandStatus: BatchStatus;
  species: Species;
  customSpecies: string | null;
  batchType: BatchType;
  integrationDate: string;
  bandClosedAt: Date | null;
  operatorTypeLabel: string | null;
}

/**
 * Public QR scans (CDC §7.5): an unknown or badly signed QR code is rejected
 * (a closed lot is shown as « Lot terminé »), and every scan is journaled in `qr_scans` (never the raw IP).
 * The journal feeds the fraud indicators: a genuine QR can be photocopied,
 * which shows as many scans, scans in distant areas, or scans after closure.
 */
@Injectable()
export class QrScansService {
  private readonly logger = new Logger(QrScansService.name);

  constructor(
    private readonly config: TraceConfigService,
    @InjectDataSource() private readonly dataSource: DataSource,
  ) {}

  async scan(req: ScanRequest): Promise<ScanOutcome> {
    const code = String(req.code ?? '').trim().toUpperCase();
    const signature =
      typeof req.signature === 'string' && req.signature
        ? req.signature
        : null;
    const lot = isLotCodeShape(code) ? await this.lotByCode(code) : null;
    let result: QrScanResult;
    if (!lot) result = QrScanResult.INCONNU;
    else if (!this.config.matches(lot.qrToken, signature)) {
      result = QrScanResult.SIGNATURE_INVALIDE;
    } else if (
      effectiveLotStatus(lot, lot.bandStatus) === TraceLotStatus.CLOS
    ) {
      result = QrScanResult.CLOS;
    } else result = QrScanResult.OK;

    await this.journal({
      lotId: lot?.id ?? null,
      code: code.slice(0, 80) || '-',
      token: signature?.slice(0, 64) ?? null,
      ipHash: this.config.hashIp(req.ip),
      userAgent: req.userAgent ? req.userAgent.slice(0, 300) : null,
      geoCell: geoCellOf(req.lat, req.lng),
      result,
    });
    if (
      !lot ||
      (result !== QrScanResult.OK && result !== QrScanResult.CLOS)
    ) {
      return {
        result: result as Exclude<
          QrScanResult,
          QrScanResult.OK | QrScanResult.CLOS
        >,
      };
    }
    return {
      result,
      view: toPublicLotView(
        {
          code: lot.code,
          kind: lot.kind,
          status: effectiveLotStatus(lot, lot.bandStatus),
          quantity: lot.quantity,
          cededOn: lot.cededOn,
          farmName: lot.farmName,
          localiteName: lot.localiteName,
          provinceName: lot.provinceName,
          bandCode: lot.bandCode,
          species: lot.species,
          customSpecies: lot.customSpecies,
          batchType: lot.batchType,
          integrationDate: lot.integrationDate,
          closedAt: lot.bandClosedAt,
          operatorTypeLabel: lot.operatorTypeLabel,
        },
        this.config.consommonsGabonaisUrl,
      ),
    };
  }

  /** Scan counts per lot (lots never scanned are absent). */
  async indicators(
    lotIds: readonly string[],
    since?: Date,
  ): Promise<Map<string, ScanIndicators>> {
    if (lotIds.length === 0) return new Map();
    const rows: Record<string, string | Date | null>[] =
      await this.dataSource.query(
        `${INDICATORS_SQL} WHERE s.lot_id = ANY($1::uuid[])
           AND ($2::timestamptz IS NULL OR s.scanned_at >= $2::timestamptz)
         GROUP BY s.lot_id`,
        [lotIds, since ?? null],
      );
    return new Map(rows.map((r) => [String(r.lotId), toIndicators(r)]));
  }

  /**
   * Lots of a programme whose scans look like copies (for the traceability
   * dashboards): scanned after closure, in too many areas, or too often.
   */
  async suspiciousLots(
    programId: string,
    thresholds: FraudThresholds = {},
  ): Promise<ScanIndicators[]> {
    const maxScans = thresholds.maxScans ?? 200;
    const maxAreas = thresholds.maxAreas ?? 3;
    const rows: Record<string, string | Date | null>[] =
      await this.dataSource.query(
        `${INDICATORS_SQL}
           JOIN trace_lots l ON l.id = s.lot_id
          WHERE l.program_id = $1
            AND ($2::timestamptz IS NULL OR s.scanned_at >= $2::timestamptz)
          GROUP BY s.lot_id
         HAVING COUNT(*) FILTER (WHERE s.result = 'CLOS') > 0
             OR COUNT(*) FILTER (WHERE s.result = 'SIGNATURE_INVALIDE') > 0
             OR COUNT(DISTINCT s.geo_cell) >= $3
             OR COUNT(*) >= $4
          ORDER BY COUNT(*) DESC
          LIMIT 500`,
        [programId, thresholds.since ?? null, maxAreas, maxScans],
      );
    return rows.map(toIndicators);
  }

  private async journal(row: Omit<QrScan, 'id' | 'scannedAt' | 'lot'>) {
    try {
      await this.dataSource.getRepository(QrScan).insert(row);
    } catch (err) {
      // A scan is answered even if its journal line could not be written.
      this.logger.error(`Journal des scans QR : ${String(err)}`);
    }
  }

  private async lotByCode(code: string): Promise<LotRow | null> {
    const rows: LotRow[] = await this.dataSource.query(
      `SELECT l.id, l.code, l.kind, l.status, l.parent_id AS "parentId",
              l.quantity, l.ceded_on::text AS "cededOn", l.qr_token AS "qrToken",
              f.name AS "farmName", loc.name AS "localiteName",
              p.name AS "provinceName",
              b.code AS "bandCode", b.status AS "bandStatus",
              b.species, b.custom_species AS "customSpecies",
              b.type AS "batchType", b.integration_date::text AS "integrationDate",
              b.closed_at AS "bandClosedAt",
              t.label AS "operatorTypeLabel"
         FROM trace_lots l
         JOIN farms f ON f.id = l.farm_id
         JOIN production_batches b ON b.id = l.batch_id
         LEFT JOIN localites loc ON loc.id = f.localite_id
         LEFT JOIN provinces p ON p.id = f.province_id
         LEFT JOIN operators o ON o.id = l.operator_id
         LEFT JOIN ref_items t ON t.program_id = o.program_id
               AND t.list_type = $2 AND t.code = o.type_code
        WHERE l.code = $1`,
      [code, ProgramListType.TYPE_OPERATEUR],
    );
    return rows[0] ?? null;
  }
}

const INDICATORS_SQL = `
  SELECT s.lot_id AS "lotId",
         COUNT(*)::int AS scans,
         (COUNT(*) FILTER (WHERE s.result = 'OK'))::int AS ok,
         (COUNT(*) FILTER (WHERE s.result = 'SIGNATURE_INVALIDE'))::int AS "badSignature",
         (COUNT(*) FILTER (WHERE s.result = 'CLOS'))::int AS "afterClosure",
         COUNT(DISTINCT s.ip_hash)::int AS "distinctDevices",
         COUNT(DISTINCT s.geo_cell)::int AS "distinctAreas",
         MIN(s.scanned_at) AS "firstAt",
         MAX(s.scanned_at) AS "lastAt"
    FROM qr_scans s`;

function toIndicators(r: Record<string, string | Date | null>): ScanIndicators {
  const n = (v: unknown) => Number(v ?? 0);
  return {
    lotId: String(r.lotId),
    scans: n(r.scans),
    ok: n(r.ok),
    badSignature: n(r.badSignature),
    afterClosure: n(r.afterClosure),
    distinctDevices: n(r.distinctDevices),
    distinctAreas: n(r.distinctAreas),
    firstAt: r.firstAt ? new Date(r.firstAt) : null,
    lastAt: r.lastAt ? new Date(r.lastAt) : null,
  };
}
