import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { CommonModule } from '../../common/services/common.module.js';
import { Alert } from '../alerts/entities/alert.entity.js';
import { ProductionBatch } from '../batches/entities/production-batch.entity.js';
import { BatchesModule } from '../batches/batches.module.js';
import { FarmsModule } from '../farms/farms.module.js';
import { TraceCoreModule } from '../trace/trace-core.module.js';
import { SlaughterOrder } from './entities/slaughter-order.entity.js';
import {
  BatchPasseportController,
  SlaughterController,
} from './slaughter.controller.js';
import { SlaughterService } from './slaughter.service.js';

@Module({
  imports: [
    TypeOrmModule.forFeature([SlaughterOrder, ProductionBatch, Alert]),
    FarmsModule,
    BatchesModule,
    CommonModule,
    // POUFA lot A2 divers (F4): cession at processing.
    TraceCoreModule,
  ],
  controllers: [SlaughterController, BatchPasseportController],
  providers: [SlaughterService],
  exports: [SlaughterService],
})
export class SlaughterModule {}
