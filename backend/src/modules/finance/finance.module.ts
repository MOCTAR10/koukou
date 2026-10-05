import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { CommonModule } from '../../common/services/common.module.js';
import { FarmsModule } from '../farms/farms.module.js';
import { AccountingModule } from '../accounting/accounting.module.js';
import { PointsOfSaleModule } from '../points-of-sale/points-of-sale.module.js';
import { AlertsModule } from '../alerts/alerts.module.js';
import { ReferenceConstantsModule } from '../reference-constants/reference-constants.module.js';
import { BatchesModule } from '../batches/batches.module.js';
import { FeedStockModule } from '../feed-stock/feed-stock.module.js';
import { ProductionBatch } from '../batches/entities/production-batch.entity.js';
import { InputLot } from '../inputs/entities/input-lot.entity.js';
import { SlaughterOrder } from '../slaughter/entities/slaughter-order.entity.js';
import { Order } from '../orders/entities/order.entity.js';
import { Farm } from '../farms/entities/farm.entity.js';
import { Customer } from './entities/customer.entity.js';
import { Sale } from './entities/sale.entity.js';
import { SaleItem } from './entities/sale-item.entity.js';
import { Payment } from './entities/payment.entity.js';
import { PaymentMethodConfig } from './entities/payment-method.entity.js';
import { CashSession } from './entities/cash-session.entity.js';
import { CashMovement } from './entities/cash-movement.entity.js';
import { Expense } from './entities/expense.entity.js';
import { Promotion } from './entities/promotion.entity.js';
import { CustomersService } from './customers.service.js';
import { PaymentsService } from './payments.service.js';
import { CaisseService } from './caisse.service.js';
import { ExpensesService } from './expenses.service.js';
import { RentabiliteService } from './rentabilite.service.js';
import { SalesService } from './sales.service.js';
import { FinanceEventsService } from './finance-events.service.js';
import { PromotionsService } from './promotions.service.js';
import { CustomersController } from './customers.controller.js';
import { SalesController } from './sales.controller.js';
import {
  PaymentMethodsController,
  PaymentsController,
} from './payments.controller.js';
import { CaisseController } from './caisse.controller.js';
import { ExpensesController } from './expenses.controller.js';
import { RentabiliteController } from './rentabilite.controller.js';
import { PromotionsController } from './promotions.controller.js';

@Module({
  imports: [
    CommonModule,
    TypeOrmModule.forFeature([
      Customer,
      Sale,
      SaleItem,
      Payment,
      PaymentMethodConfig,
      CashSession,
      CashMovement,
      Expense,
      Promotion,
      ProductionBatch,
      InputLot,
      SlaughterOrder,
      Order,
      Farm,
    ]),
    FarmsModule,
    AccountingModule,
    PointsOfSaleModule,
    AlertsModule,
    ReferenceConstantsModule,
    BatchesModule,
    FeedStockModule,
  ],
  controllers: [
    CustomersController,
    SalesController,
    PaymentsController,
    PaymentMethodsController,
    CaisseController,
    ExpensesController,
    RentabiliteController,
    PromotionsController,
  ],
  providers: [
    CustomersService,
    PaymentsService,
    CaisseService,
    ExpensesService,
    RentabiliteService,
    SalesService,
    FinanceEventsService,
    PromotionsService,
  ],
  exports: [
    CustomersService,
    PaymentsService,
    CaisseService,
    ExpensesService,
    RentabiliteService,
    SalesService,
    FinanceEventsService,
    PromotionsService,
  ],
})
export class FinanceModule {}
