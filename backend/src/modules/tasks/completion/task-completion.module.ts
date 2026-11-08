import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { BatchesModule } from '../../batches/batches.module.js';
import { DailyEntriesModule } from '../../daily-entries/daily-entries.module.js';
import { FarmsModule } from '../../farms/farms.module.js';
import { ProphylaxisEvent } from '../../sanitary/entities/prophylaxis-event.entity.js';
import { SanitaryModule } from '../../sanitary/sanitary.module.js';
import { FarmTask } from '../entities/farm-task.entity.js';
import { TasksModule } from '../tasks.module.js';
import { TaskCompletionController } from './task-completion.controller.js';
import { TaskCompletionService } from './task-completion.service.js';

/** Sits above tasks, sanitary and daily entries so none of them imports the others. */
@Module({
  imports: [
    TypeOrmModule.forFeature([FarmTask, ProphylaxisEvent]),
    FarmsModule,
    TasksModule,
    SanitaryModule,
    DailyEntriesModule,
    BatchesModule,
  ],
  controllers: [TaskCompletionController],
  providers: [TaskCompletionService],
})
export class TaskCompletionModule {}
