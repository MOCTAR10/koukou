import {
  Injectable,
  Logger,
  OnApplicationBootstrap,
  OnModuleDestroy,
} from '@nestjs/common';
import { ReportsService } from './reports.service.js';

const SWEEP_INTERVAL_MS = 60 * 60 * 1000;

/**
 * Hourly production of the scheduled reports (plain `setInterval`, like the
 * task and Market sweeps). `REPORT_SWEEP_DISABLED=true` turns the timer off
 * (set in e2e; specs call `ReportsService.sweep()` directly).
 */
@Injectable()
export class ReportSweepService
  implements OnApplicationBootstrap, OnModuleDestroy
{
  private readonly logger = new Logger(ReportSweepService.name);
  private timer?: NodeJS.Timeout;

  constructor(private readonly reports: ReportsService) {}

  onApplicationBootstrap() {
    if (process.env.REPORT_SWEEP_DISABLED === 'true') return;
    const run = () =>
      void this.reports
        .sweep()
        .catch((err) => this.logger.error('Rapports planifiés', err));
    // After the boot seeds (programme, parameters) are in place.
    setTimeout(run, 30_000).unref();
    this.timer = setInterval(run, SWEEP_INTERVAL_MS);
    // Never keep the process alive just for the sweep.
    this.timer.unref();
  }

  onModuleDestroy() {
    if (this.timer) clearInterval(this.timer);
  }
}
