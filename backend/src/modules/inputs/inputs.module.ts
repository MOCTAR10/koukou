import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { FarmsModule } from '../farms/farms.module.js';
import { FeedStockModule } from '../feed-stock/feed-stock.module.js';
import { AccountingModule } from '../accounting/accounting.module.js';
import { Expense } from '../finance/entities/expense.entity.js';
import { InputsController } from './inputs.controller.js';
import { InputsService } from './inputs.service.js';
import { InputLot } from './entities/input-lot.entity.js';
import { ProductionBatch } from '../batches/entities/production-batch.entity.js';
import { FeedProduct } from '../feed-stock/entities/feed-product.entity.js';

@Module({
  imports: [
    TypeOrmModule.forFeature([InputLot, ProductionBatch, FeedProduct, Expense]),
    FarmsModule,
    FeedStockModule,
    AccountingModule,
  ],
  controllers: [InputsController],
  providers: [InputsService],
  exports: [InputsService],
})
export class InputsModule {}
