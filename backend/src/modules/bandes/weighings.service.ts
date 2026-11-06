import {
  Injectable,
  Logger,
  OnModuleDestroy,
  OnModuleInit,
} from '@nestjs/common';
import { InjectDataSource } from '@nestjs/typeorm';
import { DataSource } from 'typeorm';
import { BatchStatus } from '../../common/enums/batch-type.enum.js';
import {
  KOUKOU_EVENTS,
  koukouBus,
  type WeighingLateEvent,
} from '../../common/utils/event-bus.js';
import type { ProductionBatch } from '../batches/entities/production-batch.entity.js';
import {
  utcDay,
  weighingStatus,
  type WeighingStatus,
} from '../batches/poufa/bande-rules.js';
import { BandeStatsService } from '../batches/poufa/bande-stats.service.js';
import {
  ParametersService,
  type ParameterResolver,
} from '../programme/parameters.service.js';

const SWEEP_INTERVAL_MS = 60 * 60 * 1000;

/**
 * POUFA weighings (CDC « Pesées »): frequency and sample size come from
 * `PESEE_FREQUENCE_J` / `PESEE_ECHANTILLON_TETES`; a band past its due date
 * raises `WEIGHING_LATE` on the bus, once per due date. The reminder itself
 * (in-app, push) belongs to the notify lot. Sweep at boot and hourly, which
 * also extends the projection of bands nobody wrote to today;
 * `WEIGHING_SWEEP_DISABLED=true` turns the timer off (e2e calls `sweepLate`).
 */
@Injectable()
export class WeighingsService implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(WeighingsService.name);
  private timer: NodeJS.Timeout | null = null;

  constructor(
    private readonly parameters: ParametersService,
    private readonly stats: BandeStatsService,
    @InjectDataSource() private readonly dataSource: DataSource,
  ) {}

  onModuleInit(): void {
    if (process.env.WEIGHING_SWEEP_DISABLED === 'true') return;
    const run = () =>
      this.stats
        .refreshStale()
        .then(() => this.sweepLate())
        .catch((err: unknown) =>
          this.logger.error(`Balayage des bandes : ${String(err)}`),
        );
    void run();
    this.timer = setInterval(run, SWEEP_INTERVAL_MS);
    this.timer.unref();
  }

  onModuleDestroy(): void {
    if (this.timer) clearInterval(this.timer);
  }

  /** Weighing schedule of one band. */
  async status(
    programId: string,
    batch: ProductionBatch,
    resolver?: ParameterResolver,
  ): Promise<WeighingStatus> {
    const params = resolver ?? (await this.parameters.resolver(programId));
    const weighings: { date: string; sampleSize: number | null }[] =
      await this.dataSource.query(
        `SELECT TO_CHAR(entry_date, 'YYYY-MM-DD') AS date, sample_size AS "sampleSize"
           FROM daily_entries
          WHERE batch_id = $1 AND avg_weight_kg > 0
          ORDER BY entry_date`,
        [batch.id],
      );
    const now = new Date();
    return weighingStatus({
      integrationDate: batch.integrationDate.slice(0, 10),
      weighings,
      frequencyDays: params.value<number>('PESEE_FREQUENCE_J', now),
      expectedSampleSize: params.value<number>('PESEE_ECHANTILLON_TETES', now),
      today: utcDay(now),
      closed: batch.status === BatchStatus.CLOTURE,
    });
  }

  /**
   * Open programme bands past their weighing due date. Each band is reported
   * once per due date (atomic claim on `weighing_late_notified_on`); a new
   * weighing moves the due date, so the next delay is reported again.
   */
  async sweepLate(): Promise<WeighingLateEvent[]> {
    const bands: (ProductionBatch & { programId: string })[] =
      await this.dataSource.query(
        `SELECT b.id, b.farm_id AS "farmId", b.code, b.status,
                TO_CHAR(b.integration_date, 'YYYY-MM-DD') AS "integrationDate",
                f.program_id AS "programId"
           FROM production_batches b JOIN farms f ON f.id = b.farm_id
          WHERE b.status <> $1`,
        [BatchStatus.CLOTURE],
      );
    const resolvers = new Map<string, ParameterResolver>();
    const events: WeighingLateEvent[] = [];
    for (const band of bands) {
      let resolver = resolvers.get(band.programId);
      if (!resolver) {
        resolver = await this.parameters.resolver(band.programId);
        resolvers.set(band.programId, resolver);
      }
      const status = await this.status(band.programId, band, resolver);
      if (!status.late) continue;
      const claimed: unknown[] = await this.dataSource.query(
        `UPDATE production_batches SET weighing_late_notified_on = $2
          WHERE id = $1 AND weighing_late_notified_on IS DISTINCT FROM $2
          RETURNING id`,
        [band.id, status.nextDueDate],
      );
      // pg returns [rows, count] for UPDATE ... RETURNING through TypeORM.
      const rows = Array.isArray(claimed[0]) ? (claimed[0] as unknown[]) : claimed;
      if (rows.length === 0) continue;
      const event: WeighingLateEvent = {
        farmId: band.farmId,
        batchId: band.id,
        code: band.code,
        dueDate: status.nextDueDate,
        daysLate: status.daysLate,
      };
      // Reminded by the FERME_/AGENT_PESEE_RETARD rules (notify): the whole farm team and the agents.
      koukouBus.emit(KOUKOU_EVENTS.WEIGHING_LATE, event);
      events.push(event);
    }
    return events;
  }
}
