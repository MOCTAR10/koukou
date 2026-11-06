import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { CommonModule } from '../../common/services/common.module.js';
import { FarmsModule } from '../farms/farms.module.js';
import { ProgrammeModule } from '../programme/programme.module.js';
import { Operator } from './entities/operator.entity.js';
import { OperatorsController } from './operators.controller.js';
import { OperatorsService } from './operators.service.js';
import { PublicLotsController } from './public-lots.controller.js';
import { QrScansService } from './qr-scans.service.js';
import { TraceCoreModule } from './trace-core.module.js';
import { TraceHistoryService } from './trace-history.service.js';
import { FarmTraceController, TraceLotsController } from './trace.controller.js';

/**
 * Traceability MVP (POUFA L7, CDC §6.1 T1-T5, architecture §11): operators
 * registry, lot lists and history, printable QR labels, public lot page and
 * its scan journal. Lot creation itself lives in `TraceCoreModule` (band
 * opening and cession hook).
 */
@Module({
  imports: [
    TypeOrmModule.forFeature([Operator]),
    TraceCoreModule,
    FarmsModule,
    ProgrammeModule,
    CommonModule,
  ],
  controllers: [
    OperatorsController,
    FarmTraceController,
    TraceLotsController,
    PublicLotsController,
  ],
  providers: [OperatorsService, QrScansService, TraceHistoryService],
  exports: [OperatorsService, QrScansService, TraceHistoryService],
})
export class TraceModule {}
