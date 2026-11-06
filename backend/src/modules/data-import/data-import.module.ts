import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { CommonModule } from '../../common/services/common.module.js';
import { AccessCoreModule } from '../access/access-core.module.js';
import { BatchesModule } from '../batches/batches.module.js';
import { DailyEntriesModule } from '../daily-entries/daily-entries.module.js';
import { ProgrammeModule } from '../programme/programme.module.js';
import { User } from '../users/entities/user.entity.js';
import { BandRecoveryService } from './band-recovery.service.js';
import { DataImportController } from './data-import.controller.js';
import { ImportJob } from './entities/import-job.entity.js';
import { ImportRow } from './entities/import-row.entity.js';
import { ImportSourceLink } from './entities/import-source-link.entity.js';
import { FarmRecoveryService } from './farm-recovery.service.js';
import { ImportJobsService } from './import-jobs.service.js';

/**
 * Data recovery (POUFA L8, plan §15, CDC feature 31): import jobs with
 * staging, controls, dry run, validation, integration through the registry
 * and band services, recovery report.
 */
@Module({
  imports: [
    TypeOrmModule.forFeature([ImportJob, ImportRow, ImportSourceLink, User]),
    CommonModule,
    AccessCoreModule,
    ProgrammeModule,
    BatchesModule,
    DailyEntriesModule,
  ],
  controllers: [DataImportController],
  providers: [ImportJobsService, FarmRecoveryService, BandRecoveryService],
})
export class DataImportModule {}
