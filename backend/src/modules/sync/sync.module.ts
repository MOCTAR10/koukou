import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { FarmsModule } from '../farms/farms.module.js';
import { ProgrammeModule } from '../programme/programme.module.js';
import { SyncClockSample } from './entities/sync-clock-sample.entity.js';
import { SyncConflict } from './entities/sync-conflict.entity.js';
import { SyncController } from './sync.controller.js';
import { SyncService } from './sync.service.js';

/**
 * Offline synchronization of programme farms (architecture §14): phone clock
 * skew and field-by-field conflicts (`backend/docs/poufa-conflits-hors-ligne.md`).
 */
@Module({
  imports: [
    TypeOrmModule.forFeature([SyncConflict, SyncClockSample]),
    FarmsModule,
    ProgrammeModule,
  ],
  controllers: [SyncController],
  providers: [SyncService],
  exports: [SyncService],
})
export class SyncModule {}
