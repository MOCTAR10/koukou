import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { FarmsModule } from '../farms/farms.module.js';
import { Farm } from '../farms/entities/farm.entity.js';
import { SlaughterOrder } from '../slaughter/entities/slaughter-order.entity.js';
import { StockTransfersService } from './stock-transfers.service.js';
import { StockTransfersController } from './stock-transfers.controller.js';
import { StockTransfer } from './entities/stock-transfer.entity.js';
import { PointOfSale } from './entities/point-of-sale.entity.js';
import { PointsOfSaleService } from './points-of-sale.service.js';
import { PointsOfSaleController } from './points-of-sale.controller.js';

@Module({
  imports: [
    TypeOrmModule.forFeature([PointOfSale, Farm, SlaughterOrder, StockTransfer]),
    FarmsModule,
  ],
  controllers: [PointsOfSaleController, StockTransfersController],
  providers: [PointsOfSaleService, StockTransfersService],
  exports: [PointsOfSaleService, StockTransfersService],
})
export class PointsOfSaleModule {}