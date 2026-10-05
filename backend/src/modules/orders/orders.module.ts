import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { CommonModule } from '../../common/services/common.module.js';
import { FarmsModule } from '../farms/farms.module.js';
import { PointsOfSaleModule } from '../points-of-sale/points-of-sale.module.js';
import { BatchesModule } from '../batches/batches.module.js';
import { FinanceModule } from '../finance/finance.module.js';
import { AccountingModule } from '../accounting/accounting.module.js';
import { Order } from './entities/order.entity.js';
import { OrdersService } from './orders.service.js';
import { OrdersController } from './orders.controller.js';

@Module({
  imports: [
    CommonModule,
    TypeOrmModule.forFeature([Order]),
    FarmsModule,
    PointsOfSaleModule,
    BatchesModule,
    FinanceModule,
    AccountingModule,
  ],
  controllers: [OrdersController],
  providers: [OrdersService],
  exports: [OrdersService],
})
export class OrdersModule {}
