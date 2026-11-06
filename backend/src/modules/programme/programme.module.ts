import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { Farm } from '../farms/entities/farm.entity.js';
import { FarmsModule } from '../farms/farms.module.js';
import { FarmGpsHistory } from './entities/farm-gps-history.entity.js';
import { FarmInfrastructure } from './entities/farm-infrastructure.entity.js';
import { FarmStatusHistory } from './entities/farm-status-history.entity.js';
import { FarmImportService } from './farms/farm-import.service.js';
import { ProgrammeFarmsController } from './farms/programme-farms.controller.js';
import { ProgrammeFarmsService } from './farms/programme-farms.service.js';
import { IdCounter } from './entities/id-counter.entity.js';
import { Localite } from './entities/localite.entity.js';
import { ProgramParameter } from './entities/program-parameter.entity.js';
import { Program } from './entities/program.entity.js';
import { Province } from './entities/province.entity.js';
import { RefItem } from './entities/ref-item.entity.js';
import { GeoService } from './geo.service.js';
import { IdCounterService } from './id-counter.service.js';
import { ParametersService } from './parameters.service.js';
import { ProgrammeSeedService } from './programme-seed.service.js';
import { ProgrammeController } from './programme.controller.js';
import { ProgrammeService } from './programme.service.js';
import { RefListsService } from './ref-lists.service.js';
import { TerritoryService } from './territory.service.js';

/**
 * Programme layer above the farms (POUFA first, generic): registry,
 * territories, configurable lists, versioned parameters, id counters, farm
 * registry (programme farms, import, status history). `PROGRAM_CODE` is
 * mandatory (`ProgrammeService` stops the boot without it).
 */
@Module({
  imports: [
    TypeOrmModule.forFeature([
      Program,
      Province,
      Localite,
      RefItem,
      ProgramParameter,
      IdCounter,
      Farm,
      FarmStatusHistory,
      FarmInfrastructure,
      FarmGpsHistory,
    ]),
    FarmsModule,
  ],
  controllers: [ProgrammeController, ProgrammeFarmsController],
  providers: [
    ProgrammeService,
    ParametersService,
    RefListsService,
    TerritoryService,
    IdCounterService,
    GeoService,
    ProgrammeSeedService,
    ProgrammeFarmsService,
    FarmImportService,
  ],
  exports: [
    ProgrammeService,
    ParametersService,
    RefListsService,
    TerritoryService,
    IdCounterService,
    GeoService,
    ProgrammeFarmsService,
  ],
})
export class ProgrammeModule {}
