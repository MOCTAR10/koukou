import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { AlertsModule } from '../alerts/alerts.module.js';
import { ProductionBatch } from '../batches/entities/production-batch.entity.js';
import { DailyEntry } from '../daily-entries/entities/daily-entry.entity.js';
import { Farm } from '../farms/entities/farm.entity.js';
import { FarmsModule } from '../farms/farms.module.js';
import { FeedStockLoss } from '../feed-stock/entities/feed-stock-loss.entity.js';
import { FeedStockSale } from '../feed-stock/entities/feed-stock-sale.entity.js';
import { FeedStockModule } from '../feed-stock/feed-stock.module.js';
import { Expense } from '../finance/entities/expense.entity.js';
import { InputLot } from '../inputs/entities/input-lot.entity.js';
import { InputsModule } from '../inputs/inputs.module.js';
import { RefItem } from '../programme/entities/ref-item.entity.js';
import { ProgrammeModule } from '../programme/programme.module.js';
import { DeclarativeStockService } from './declarative-stock.service.js';
import { InputDeliveryLine } from './entities/input-delivery-line.entity.js';
import { InputDelivery } from './entities/input-delivery.entity.js';
import { FarmDeliveriesController } from './farm-deliveries.controller.js';
import { InputDeliveriesService } from './input-deliveries.service.js';
import { ProgrammeDeliveriesController } from './programme-deliveries.controller.js';

/**
 * Programme inputs (POUFA L4, architecture §9 `supply`): deliveries recorded
 * by the DGE and confirmed by the farmer, declarative stock and its alert.
 * `DeclarativeStockService.farmSummaries` is what the L6 dashboards read.
 */
@Module({
  imports: [
    TypeOrmModule.forFeature([
      InputDelivery,
      InputDeliveryLine,
      InputLot,
      DailyEntry,
      FeedStockLoss,
      FeedStockSale,
      ProductionBatch,
      Farm,
      RefItem,
      Expense,
    ]),
    FarmsModule,
    InputsModule,
    FeedStockModule,
    AlertsModule,
    ProgrammeModule,
  ],
  controllers: [ProgrammeDeliveriesController, FarmDeliveriesController],
  providers: [InputDeliveriesService, DeclarativeStockService],
  exports: [InputDeliveriesService, DeclarativeStockService],
})
export class SupplyModule {}
