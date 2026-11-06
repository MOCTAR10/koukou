import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { BatchesModule } from '../batches/batches.module.js';
import { FarmsModule } from '../farms/farms.module.js';
import { FeedStockModule } from '../feed-stock/feed-stock.module.js';
import { ProductionBatch } from '../batches/entities/production-batch.entity.js';
import { DailyEntriesController } from './daily-entries.controller.js';
import { DailyEntriesService } from './daily-entries.service.js';
import { DailyEntry } from './entities/daily-entry.entity.js';
import { InputLot } from '../inputs/entities/input-lot.entity.js';
import { SyncModule } from '../sync/sync.module.js';

@Module({
  imports: [
    TypeOrmModule.forFeature([DailyEntry, ProductionBatch, InputLot]),
    FarmsModule,
    BatchesModule,
    FeedStockModule,
    SyncModule,
  ],
  controllers: [DailyEntriesController],
  providers: [DailyEntriesService],
  exports: [DailyEntriesService],
})
export class DailyEntriesModule {}
