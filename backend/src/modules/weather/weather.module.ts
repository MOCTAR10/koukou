import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { AlertsModule } from '../alerts/alerts.module.js';
import { FarmsModule } from '../farms/farms.module.js';
import { Farm } from '../farms/entities/farm.entity.js';
import { WeatherObservation } from './entities/weather-observation.entity.js';
import { ReferenceConstantsModule } from '../reference-constants/reference-constants.module.js';
import { WeatherController } from './weather.controller.js';
import { WeatherService } from './weather.service.js';

@Module({
  imports: [
    TypeOrmModule.forFeature([WeatherObservation, Farm]),
    FarmsModule,
    AlertsModule,
    ReferenceConstantsModule,
  ],
  controllers: [WeatherController],
  providers: [WeatherService],
  exports: [WeatherService],
})
export class WeatherModule {}
