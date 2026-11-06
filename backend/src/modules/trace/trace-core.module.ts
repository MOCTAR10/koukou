import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { ProgrammeModule } from '../programme/programme.module.js';
import { LotEvent } from './entities/lot-event.entity.js';
import { Operator } from './entities/operator.entity.js';
import { QrScan } from './entities/qr-scan.entity.js';
import { TraceLot } from './entities/trace-lot.entity.js';
import { TraceConfigService } from './trace-config.service.js';
import { TraceLotsService } from './trace-lots.service.js';

/**
 * Traceability core (POUFA L7): lot creation and the QR key. It depends only
 * on the programme (id counters), so the band opening (`BatchesModule`) and
 * the sorties (`BandesModule`, which binds `SORTIE_CESSION_HOOK` to
 * `TraceLotsService`) import it without a cycle. Routes live in `TraceModule`.
 */
@Module({
  imports: [
    TypeOrmModule.forFeature([TraceLot, LotEvent, Operator, QrScan]),
    ProgrammeModule,
  ],
  providers: [TraceConfigService, TraceLotsService],
  exports: [TraceConfigService, TraceLotsService],
})
export class TraceCoreModule {}
