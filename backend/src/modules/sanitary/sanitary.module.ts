import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { FarmsModule } from '../farms/farms.module.js';
import { AlertsModule } from '../alerts/alerts.module.js';
import { ReferenceConstantsModule } from '../reference-constants/reference-constants.module.js';
import { BatchesModule } from '../batches/batches.module.js';
import { ProductionBatch } from '../batches/entities/production-batch.entity.js';
import { DailyEntry } from '../daily-entries/entities/daily-entry.entity.js';
import { InputLot } from '../inputs/entities/input-lot.entity.js';
import { SanitaryController } from './sanitary.controller.js';
import { SanitaryProtocolsController } from './sanitary-protocols.controller.js';
import { HealthController } from './health.controller.js';
import { VaccineSchedulesController } from './vaccine-schedules.controller.js';
import { SanitaryService } from './sanitary.service.js';
import { HealthService } from './health.service.js';
import { SanitaryProtocol } from './entities/sanitary-protocol.entity.js';
import { ProtocolStep } from './entities/protocol-step.entity.js';
import { ProphylaxisEvent } from './entities/prophylaxis-event.entity.js';
import { TreatmentRecord } from './entities/treatment-record.entity.js';
import { HealthEvent } from './entities/health-event.entity.js';
import { HealthEventPhoto } from './entities/health-event-photo.entity.js';
import { TasksModule } from '../tasks/tasks.module.js';
import { ProgrammeModule } from '../programme/programme.module.js';
import { SurveillanceModule } from '../surveillance/surveillance.module.js';
import { VaccinationCalendarsController } from './vaccination-calendars.controller.js';
import { VaccinationCalendarsService } from './vaccination-calendars.service.js';
import { SanitaryLotsController } from './sanitary-lots.controller.js';
import { SanitaryLotsService } from './sanitary-lots.service.js';

@Module({
  imports: [
    TypeOrmModule.forFeature([
      SanitaryProtocol,
      ProtocolStep,
      ProphylaxisEvent,
      TreatmentRecord,
      HealthEvent,
      HealthEventPhoto,
      ProductionBatch,
      InputLot,
      DailyEntry,
    ]),
    FarmsModule,
    AlertsModule,
    ReferenceConstantsModule,
    BatchesModule,
    TasksModule,
    ProgrammeModule,
    SurveillanceModule,
  ],
  controllers: [
    SanitaryController,
    SanitaryProtocolsController,
    HealthController,
    VaccineSchedulesController,
    VaccinationCalendarsController,
    SanitaryLotsController,
  ],
  providers: [
    SanitaryService,
    HealthService,
    VaccinationCalendarsService,
    SanitaryLotsService,
  ],
  exports: [SanitaryService],
})
export class SanitaryModule {}
