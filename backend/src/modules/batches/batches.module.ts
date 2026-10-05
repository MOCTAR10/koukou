import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { AlertsModule } from '../alerts/alerts.module.js';
import { AccountingModule } from '../accounting/accounting.module.js';
import { BreedsModule } from '../breeds/breeds.module.js';
import { DailyEntry } from '../daily-entries/entities/daily-entry.entity.js';
import { FarmsModule } from '../farms/farms.module.js';
import { Farm } from '../farms/entities/farm.entity.js';
import { FarmEmployee } from '../farms/entities/farm-employee.entity.js';
import { Building } from '../buildings/entities/building.entity.js';
import { InputLot } from '../inputs/entities/input-lot.entity.js';
import { BreedStandard } from '../breeds/entities/breed-standard.entity.js';
import { ReferenceConstantsModule } from '../reference-constants/reference-constants.module.js';
import { WeatherModule } from '../weather/weather.module.js';
import { SaleItem } from '../finance/entities/sale-item.entity.js';
import { Sale } from '../finance/entities/sale.entity.js';
import { Payment } from '../finance/entities/payment.entity.js';
import { Expense } from '../finance/entities/expense.entity.js';
import { FeedStockModule } from '../feed-stock/feed-stock.module.js';
import { Alert } from '../alerts/entities/alert.entity.js';
import { SlaughterOrder } from '../slaughter/entities/slaughter-order.entity.js';
import { HealthEvent } from '../sanitary/entities/health-event.entity.js';
import { StockTransfer } from '../points-of-sale/entities/stock-transfer.entity.js';
import { AdvisoryEngine } from './advisory.engine.js';
import { BatchesController } from './batches.controller.js';
import { BatchesService } from './batches.service.js';
import { FlockReconciliationService } from './flock-reconciliation.service.js';
import { ProductionBatch } from './entities/production-batch.entity.js';
import { TypeHistoryEntry } from './entities/type-history-entry.entity.js';
import { MetricsService } from './metrics.service.js';
import { PondageService } from './pondage.service.js';
import { DashboardService } from './dashboard.service.js';
import {
  BatchCurveController,
  FarmDashboardController,
} from './dashboard.controller.js';

@Module({
  imports: [
    TypeOrmModule.forFeature([
      ProductionBatch,
      TypeHistoryEntry,
      DailyEntry,
      InputLot,
      BreedStandard,
      Farm,
      Building,
      SaleItem,
      Sale,
      Payment,
      Expense,
      Alert,
      FarmEmployee,
      SlaughterOrder,
      HealthEvent,
      StockTransfer,
    ]),
    FarmsModule,
    BreedsModule,
    AlertsModule,
    AccountingModule,
    ReferenceConstantsModule,
    FeedStockModule,
    WeatherModule,
  ],
  controllers: [
    BatchesController,
    FarmDashboardController,
    BatchCurveController,
  ],
  providers: [
    BatchesService,
    MetricsService,
    AdvisoryEngine,
    FlockReconciliationService,
    PondageService,
    DashboardService,
  ],
  exports: [MetricsService, BatchesService, FlockReconciliationService],
})
export class BatchesModule {}
