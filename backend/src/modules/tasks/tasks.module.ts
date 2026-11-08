import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { AlertsModule } from '../alerts/alerts.module.js';
import { ProductionBatch } from '../batches/entities/production-batch.entity.js';
import { DailyEntry } from '../daily-entries/entities/daily-entry.entity.js';
import { Farm } from '../farms/entities/farm.entity.js';
import { FarmEmployee } from '../farms/entities/farm-employee.entity.js';
import { FarmsModule } from '../farms/farms.module.js';
import { ProgrammeModule } from '../programme/programme.module.js';
import { ReferenceConstantsModule } from '../reference-constants/reference-constants.module.js';
import { ProphylaxisEvent } from '../sanitary/entities/prophylaxis-event.entity.js';
import { FarmTask } from './entities/farm-task.entity.js';
import { TaskSyncService } from './task-sync.service.js';
import { TasksController } from './tasks.controller.js';
import { TasksService } from './tasks.service.js';

/**
 * Leaf module (imported by batches, daily entries and sanitary): it only
 * reads their tables, so the generation hooks create no import cycle. The
 * completion endpoint, which needs those services, lives in
 * `TaskCompletionModule`.
 */
@Module({
  imports: [
    TypeOrmModule.forFeature([
      FarmTask,
      FarmEmployee,
      ProductionBatch,
      ProphylaxisEvent,
      DailyEntry,
      Farm,
    ]),
    FarmsModule,
    AlertsModule,
    ProgrammeModule,
    ReferenceConstantsModule,
  ],
  controllers: [TasksController],
  providers: [TasksService, TaskSyncService],
  exports: [TasksService, TaskSyncService],
})
export class TasksModule {}
