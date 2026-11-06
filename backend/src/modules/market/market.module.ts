import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { ProductionBatch } from '../batches/entities/production-batch.entity.js';
import { BreedStandard } from '../breeds/entities/breed-standard.entity.js';
import { FarmEmployee } from '../farms/entities/farm-employee.entity.js';
import { FarmsModule } from '../farms/farms.module.js';
import { FinanceModule } from '../finance/finance.module.js';
import { BuyerProfile } from '../users/entities/buyer-profile.entity.js';
import { User } from '../users/entities/user.entity.js';
import { OrdersModule } from '../orders/orders.module.js';
import { ReferenceConstantsModule } from '../reference-constants/reference-constants.module.js';
import { TraceCoreModule } from '../trace/trace-core.module.js';
import { MarketListing } from './entities/market-listing.entity.js';
import { MarketOrder } from './entities/market-order.entity.js';
import {
  BuyerMarketOrdersController,
  FarmMarketController,
  FarmMarketOrdersController,
  MarketCatalogueController,
} from './market.controller.js';
import { MarketListingsService } from './market-listings.service.js';
import { MarketOrdersService } from './market-orders.service.js';
import { MarketSweepService } from './market-sweep.service.js';

@Module({
  imports: [
    TypeOrmModule.forFeature([
      MarketListing,
      MarketOrder,
      ProductionBatch,
      BreedStandard,
      FarmEmployee,
      User,
      BuyerProfile,
    ]),
    FarmsModule,
    FinanceModule,
    OrdersModule,
    ReferenceConstantsModule,
    TraceCoreModule,
  ],
  controllers: [
    MarketCatalogueController,
    FarmMarketController,
    BuyerMarketOrdersController,
    FarmMarketOrdersController,
  ],
  providers: [MarketListingsService, MarketOrdersService, MarketSweepService],
  exports: [MarketListingsService, MarketOrdersService, MarketSweepService],
})
export class MarketModule {}
