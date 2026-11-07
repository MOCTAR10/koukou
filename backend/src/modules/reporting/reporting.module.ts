import {
  CsvTableSerializer,
  ExportWriter,
  TABLE_SERIALIZERS,
  XlsxTableSerializer,
  type TableSerializer,
} from './export-table.js';
import { INPUT_RECONCILIATION_SOURCE } from './input-reconciliation.js';
import {
  SupplyInputReconciliationSource,
  SurveillancePublishedAlertSource,
} from './integration-sources.js';
import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { CommonModule } from '../../common/services/common.module.js';
import { AccessCoreModule } from '../access/access-core.module.js';
import { ProgramMembership } from '../access/entities/program-membership.entity.js';
import { BandesModule } from '../bandes/bandes.module.js';
import { BandeSnapshot } from '../bandes/entities/bande-snapshot.entity.js';
import { ProductionBatch } from '../batches/entities/production-batch.entity.js';
import { Farm } from '../farms/entities/farm.entity.js';
import { FarmsModule } from '../farms/farms.module.js';
import { ProgrammeModule } from '../programme/programme.module.js';
import {
  BandComparisonController,
  ProgrammePerimeterController,
} from './band-comparison.controller.js';
import { BandComparisonService } from './band-comparison.service.js';
import { ReportRun } from './entities/report-run.entity.js';
import { ReportTemplate } from './entities/report-template.entity.js';
import { PilotageDashboardService } from './pilotage-dashboard.service.js';
import { PilotageDataService } from './pilotage-data.service.js';
import { PilotageExportsService } from './pilotage-exports.service.js';
import { PilotageBiosecurityService } from './pilotage-biosecurity.service.js';
import { PilotageMapService } from './pilotage-map.service.js';
import { PilotageObjectiveService } from './pilotage-objective.service.js';
import { PilotageScopeService } from './pilotage-scope.service.js';
import { PilotageController } from './pilotage.controller.js';
import { PUBLISHED_ALERT_SOURCE } from './published-alerts.js';
import { SupplyModule } from '../supply/supply.module.js';
import { SurveillanceModule } from '../surveillance/surveillance.module.js';
import { ReportSweepService } from './report-sweep.service.js';
import { ReportsController } from './reports.controller.js';
import { ReportsService } from './reports.service.js';

/**
 * Lot L6 « Pilotage » (POUFA plan §13, CDC features 23-26): the farmer's
 * comparison with the programme average, province and national dashboards,
 * map data, the 100 000 t objective, CSV exports and scheduled PDF reports.
 */
@Module({
  imports: [
    TypeOrmModule.forFeature([
      ReportTemplate,
      ReportRun,
      BandeSnapshot,
      ProductionBatch,
      Farm,
      ProgramMembership,
    ]),
    AccessCoreModule,
    BandesModule,
    FarmsModule,
    ProgrammeModule,
    CommonModule,
    SurveillanceModule,
    SupplyModule,
  ],
  controllers: [
    PilotageController,
    ReportsController,
    BandComparisonController,
    ProgrammePerimeterController,
  ],
  providers: [
    PilotageScopeService,
    PilotageDataService,
    PilotageDashboardService,
    PilotageMapService,
    PilotageBiosecurityService,
    PilotageObjectiveService,
    PilotageExportsService,
    BandComparisonService,
    ReportsService,
    ReportSweepService,
    // L5: published official sanitary alerts (SanitaryAlertsService).
    {
      provide: PUBLISHED_ALERT_SOURCE,
      useClass: SurveillancePublishedAlertSource,
    },
    // L4: declarative stock summaries (DeclarativeStockService).
    {
      provide: INPUT_RECONCILIATION_SOURCE,
      useClass: SupplyInputReconciliationSource,
    },
    CsvTableSerializer,
    XlsxTableSerializer,
    {
      provide: TABLE_SERIALIZERS,
      useFactory: (
        csv: CsvTableSerializer,
        xlsx: XlsxTableSerializer,
      ): TableSerializer[] => [csv, xlsx],
      inject: [CsvTableSerializer, XlsxTableSerializer],
    },
    ExportWriter,
  ],
  exports: [
    ReportsService,
    PUBLISHED_ALERT_SOURCE,
    INPUT_RECONCILIATION_SOURCE,
  ],
})
export class ReportingModule {}
