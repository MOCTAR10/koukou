import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { FarmsModule } from '../farms/farms.module.js';
import { SpatialModule } from '../spatial/spatial.module.js';
import { CulturesController } from './cultures.controller.js';
import { CulturesService } from './cultures.service.js';
import { ParcellesController } from './parcelles.controller.js';
import { ParcellesService } from './parcelles.service.js';
import { Culture } from './entities/culture.entity.js';
import { Parcelle } from './entities/parcelle.entity.js';

@Module({
  imports: [
    TypeOrmModule.forFeature([Culture, Parcelle]),
    FarmsModule,
    SpatialModule,
  ],
  controllers: [CulturesController, ParcellesController],
  providers: [CulturesService, ParcellesService],
  exports: [ParcellesService],
})
export class AgricultureModule {}