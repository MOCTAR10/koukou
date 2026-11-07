import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { ProductionBatch } from '../batches/entities/production-batch.entity.js';
import { FarmsModule } from '../farms/farms.module.js';
import { ProgrammeModule } from '../programme/programme.module.js';
import { FarmVisitAnswer } from './entities/farm-visit-answer.entity.js';
import { FarmVisitPhoto } from './entities/farm-visit-photo.entity.js';
import { FarmVisit } from './entities/farm-visit.entity.js';
import {
  FarmVisitsController,
  ProgrammeVisitsController,
} from './visits.controller.js';
import { VisitsService } from './visits.service.js';

/**
 * Technical visits, biosecurity grid and agent visa (POUFA CDC n° 45, n° 27,
 * §3.2). The grid is a programme list, the class thresholds catalog
 * parameters; the visits feed the band history (`trace`).
 */
@Module({
  imports: [
    TypeOrmModule.forFeature([FarmVisit, FarmVisitAnswer,
      FarmVisitPhoto,
      ProductionBatch,
    ]),
    FarmsModule,
    ProgrammeModule,
  ],
  controllers: [FarmVisitsController, ProgrammeVisitsController],
  providers: [VisitsService],
  exports: [VisitsService],
})
export class VisitsModule {}
