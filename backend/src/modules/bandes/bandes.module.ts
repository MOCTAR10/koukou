import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { BatchesModule } from '../batches/batches.module.js';
import { ProductionBatch } from '../batches/entities/production-batch.entity.js';
import { DailyEntry } from '../daily-entries/entities/daily-entry.entity.js';
import { Farm } from '../farms/entities/farm.entity.js';
import { FarmsModule } from '../farms/farms.module.js';
import { Sale } from '../finance/entities/sale.entity.js';
import { FinanceModule } from '../finance/finance.module.js';
import { RefItem } from '../programme/entities/ref-item.entity.js';
import { ProgrammeModule } from '../programme/programme.module.js';
import { SlaughterOrder } from '../slaughter/entities/slaughter-order.entity.js';
import { SlaughterModule } from '../slaughter/slaughter.module.js';
import { SyncModule } from '../sync/sync.module.js';
import { TraceCoreModule } from '../trace/trace-core.module.js';
import { TraceLotsService } from '../trace/trace-lots.service.js';
import {
  BAND_PRODUCTION_COST,
  OFFICIAL_BAND_INDICATORS,
} from '../indicators/official-band-indicators.port.js';
import { BandeCorrectionsService } from './bande-corrections.service.js';
import { BandeIndicatorsService } from './bande-indicators.service.js';
import { BandeSnapshotsService } from './bande-snapshots.service.js';
import { BandesController } from './bandes.controller.js';
import { BandesService } from './bandes.service.js';
import { BandeSnapshot } from './entities/bande-snapshot.entity.js';
import { Sortie } from './entities/sortie.entity.js';
import { SORTIE_CESSION_HOOK, SortiesService } from './sorties.service.js';
import { WeighingsService } from './weighings.service.js';

/**
 * POUFA bands (architecture §7-§8) above the batches module: sorties,
 * official indicators, frozen bilans, privileged corrections, weighing
 * schedule. The projection, the band number and the automatic closure live
 * in `batches/poufa/` because every flock write path updates them.
 */
@Module({
  imports: [
    TypeOrmModule.forFeature([
      Sortie,
      BandeSnapshot,
      ProductionBatch,
      DailyEntry,
      Farm,
      RefItem,
      Sale,
      SlaughterOrder,
    ]),
    BatchesModule,
    FarmsModule,
    FinanceModule,
    SlaughterModule,
    ProgrammeModule,
    SyncModule,
    TraceCoreModule,
  ],
  controllers: [BandesController],
  providers: [
    BandesService,
    BandeIndicatorsService,
    BandeSnapshotsService,
    BandeCorrectionsService,
    SortiesService,
    WeighingsService,
    // Traceability (L7): a sortie towards an operator is a cession.
    { provide: SORTIE_CESSION_HOOK, useExisting: TraceLotsService },
    // Official indicators for the passport and lot P&L PDFs (lazy, no cycle).
    { provide: OFFICIAL_BAND_INDICATORS, useExisting: BandeIndicatorsService },
    // Official production cost per kg on the lot sheet / list (lazy, no cycle).
    { provide: BAND_PRODUCTION_COST, useExisting: BandeSnapshotsService },
  ],
  exports: [BandesService, BandeIndicatorsService, WeighingsService],
})
export class BandesModule {}
