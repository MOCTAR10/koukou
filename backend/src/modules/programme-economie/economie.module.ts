import { Module } from '@nestjs/common';
import { CommonModule } from '../../common/services/common.module.js';
import { AccessCoreModule } from '../access/access-core.module.js';
import { FeedStockModule } from '../feed-stock/feed-stock.module.js';
import { ProgrammeModule } from '../programme/programme.module.js';
import { EconomieController } from './economie.controller.js';
import { EconomieService } from './economie.service.js';

/** Programme-wide economic synthesis (POUFA lot A droits). */
@Module({
  imports: [AccessCoreModule, CommonModule, FeedStockModule, ProgrammeModule],
  controllers: [EconomieController],
  providers: [EconomieService],
})
export class EconomieModule {}
