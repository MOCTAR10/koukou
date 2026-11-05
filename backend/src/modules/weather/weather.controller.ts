import { Controller, Get, Param } from '@nestjs/common';
import { ApiOperation, ApiTags } from '@nestjs/swagger';
import { CurrentUser } from '../../common/decorators/current-user.decorator.js';
import type { AuthUser } from '../../common/decorators/current-user.decorator.js';
import { Roles } from '../../common/decorators/roles.decorator.js';
import { UserRole } from '../../common/enums/role.enum.js';
import { FarmsService } from '../farms/farms.service.js';
import { WeatherService } from './weather.service.js';
import { Domain } from '../../common/decorators/domain.decorator.js';

@ApiTags('Météo (heat-stress THI)')
@Domain('TECHNIQUE')
@Controller('farms/:farmId/weather')
export class WeatherController {
  constructor(
    private readonly farmsService: FarmsService,
    private readonly weatherService: WeatherService,
  ) {}

  @Get()
  @Roles(UserRole.PROPRIETAIRE, UserRole.ELEVEUR)
  @ApiOperation({
    summary:
      'Prévision météo de la ville de la ferme : température, humidité, THI et zone (Confort → Danger) sur 7 jours, avec alerte heat-stress',
  })
  async getWeather(
    @CurrentUser() user: AuthUser,
    @Param('farmId') farmId: string,
  ) {
    await this.farmsService.assertAccessible(user, farmId);
    return this.weatherService.forecastForFarm(farmId);
  }
}
