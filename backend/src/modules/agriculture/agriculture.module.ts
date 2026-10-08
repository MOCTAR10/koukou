import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { FarmsModule } from '../farms/farms.module.js';
import { SpatialModule } from '../spatial/spatial.module.js';
import { CulturesController } from './cultures.controller.js';
import { CulturesService } from './cultures.service.js';
import { ParcellesController } from './parcelles.controller.js';
import { ParcellesService } from './parcelles.service.js';
import { RecoltesController } from './recoltes.controller.js';
import { RecoltesService } from './recoltes.service.js';
import { Culture } from './entities/culture.entity.js';
import { Parcelle } from './entities/parcelle.entity.js';
import { Recolte } from './entities/recolte.entity.js';

@Module({
  imports: [
    TypeOrmModule.forFeature([Culture, Parcelle, Recolte]),
    FarmsModule,
    SpatialModule,
  ],
  controllers: [CulturesController, ParcellesController, RecoltesController],
  providers: [CulturesService, ParcellesService, RecoltesService],
  exports: [ParcellesService, RecoltesService],
})
export class AgricultureModule {}