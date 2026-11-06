import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { ProductionBatch } from '../batches/entities/production-batch.entity.js';
import { BreedStandard } from '../breeds/entities/breed-standard.entity.js';
import { FarmsModule } from '../farms/farms.module.js';
import { OrdersModule } from '../orders/orders.module.js';
import { ReferenceConstantsModule } from '../reference-constants/reference-constants.module.js';
import { MarketListing } from './entities/market-listing.entity.js';
import {
  FarmMarketController,
  MarketCatalogueController,
} from './market.controller.js';
import { MarketListingsService } from './market-listings.service.js';

@Module({
  imports: [
    TypeOrmModule.forFeature([MarketListing, ProductionBatch, BreedStandard]),
    FarmsModule,
    OrdersModule,
    ReferenceConstantsModule,
  ],
  controllers: [MarketCatalogueController, FarmMarketController],
  providers: [MarketListingsService],
  exports: [MarketListingsService],
})
export class MarketModule {}
