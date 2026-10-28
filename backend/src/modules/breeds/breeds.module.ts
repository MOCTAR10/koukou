import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { FarmsModule } from '../farms/farms.module.js';
import { Breed } from './entities/breed.entity.js';
import { BreedStandard } from './entities/breed-standard.entity.js';
import { BreedsController } from './breeds.controller.js';
import { BreedsService } from './breeds.service.js';

@Module({
  imports: [TypeOrmModule.forFeature([Breed, BreedStandard]), FarmsModule],
  controllers: [BreedsController],
  providers: [BreedsService],
  exports: [BreedsService],
})
export class BreedsModule {}
