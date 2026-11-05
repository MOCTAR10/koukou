import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
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
 * territories, configurable lists, versioned parameters, id counters. Inert
 * when `PROGRAM_CODE` is unset.
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
    ]),
  ],
  controllers: [ProgrammeController],
  providers: [
    ProgrammeService,
    ParametersService,
    RefListsService,
    TerritoryService,
    IdCounterService,
    GeoService,
    ProgrammeSeedService,
  ],
  exports: [
    ProgrammeService,
    ParametersService,
    RefListsService,
    TerritoryService,
    IdCounterService,
    GeoService,
  ],
})
export class ProgrammeModule {}
