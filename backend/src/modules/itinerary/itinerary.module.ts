import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { AccessCoreModule } from '../access/access-core.module.js';
import { TechnicalItineraryStep } from './entities/technical-itinerary-step.entity.js';
import { ItineraryController } from './itinerary.controller.js';
import { ItinerarySeedService } from './itinerary-seed.service.js';
import { ItineraryService } from './itinerary.service.js';

@Module({
  imports: [
    TypeOrmModule.forFeature([TechnicalItineraryStep]),
    AccessCoreModule,
  ],
  controllers: [ItineraryController],
  providers: [ItineraryService, ItinerarySeedService],
  exports: [ItineraryService],
})
export class ItineraryModule {}
