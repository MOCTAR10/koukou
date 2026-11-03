import {
  Injectable,
  Logger,
  OnApplicationBootstrap,
  OnModuleDestroy,
} from '@nestjs/common';
import { MarketOrdersService } from './market-orders.service.js';

const SWEEP_INTERVAL_MS = 60 * 60 * 1000;

@Injectable()
export class MarketSweepService
  implements OnApplicationBootstrap, OnModuleDestroy
{
  private readonly logger = new Logger(MarketSweepService.name);
  private timer?: NodeJS.Timeout;

  constructor(private readonly orders: MarketOrdersService) {}

  onApplicationBootstrap() {
    if (process.env.MARKET_SWEEP_DISABLED === 'true') return;
    const run = () =>
      void this.sweep().catch((err) =>
        this.logger.error('Balayage du Market', err),
      );
    run();
    this.timer = setInterval(run, SWEEP_INTERVAL_MS);
    // Never keep the process alive just for the sweep.
    this.timer.unref();
  }

  onModuleDestroy() {
    if (this.timer) clearInterval(this.timer);
  }

  /** Safe to run twice or on two servers: every change rechecks under a lock. */
  async sweep(now = new Date()) {
    const requests = await this.orders.expireRequests(now);
    const deposits = await this.orders.expireDeposits(now);
    return { requests, deposits };
  }
}
