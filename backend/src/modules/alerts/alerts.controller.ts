import {
  BadRequestException,
  Controller,
  Get,
  Param,
  Post,
  Query,
} from '@nestjs/common';
import { ApiOperation, ApiParam, ApiQuery, ApiTags } from '@nestjs/swagger';
import { CurrentUser } from '../../common/decorators/current-user.decorator.js';
import type { AuthUser } from '../../common/decorators/current-user.decorator.js';
import { Roles } from '../../common/decorators/roles.decorator.js';
import { UserRole } from '../../common/enums/role.enum.js';
import { AlertStatus } from '../../common/enums/alert-level.enum.js';
import { FarmsService } from '../farms/farms.service.js';
import { AlertsService } from './alerts.service.js';
import { Domain } from '../../common/decorators/domain.decorator.js';

@ApiTags('Alertes (Assistant)')
@Domain('TECHNIQUE')
@Controller('farms/:farmId/alerts')
export class AlertsController {
  constructor(
    private readonly alertsService: AlertsService,
    private readonly farmsService: FarmsService,
  ) {}

  @Get()
  @Roles(UserRole.PROPRIETAIRE, UserRole.ELEVEUR)
  @ApiOperation({ summary: 'Lister les alertes d’une ferme' })
  @ApiParam({ name: 'farmId' })
  @ApiQuery({ name: 'status', required: false, enum: AlertStatus })
  async list(
    @CurrentUser() user: AuthUser,
    @Param('farmId') farmId: string,
    @Query('status') status?: AlertStatus,
  ) {
    await this.farmsService.assertAccessible(user, farmId);
    // An unknown value would reach the Postgres enum (500).
    if (
      status !== undefined &&
      !Object.values(AlertStatus).includes(status)
    ) {
      throw new BadRequestException('Statut d’alerte invalide.');
    }
    return this.alertsService.listForFarm(farmId, status);
  }

  @Get('history')
  @Roles(UserRole.PROPRIETAIRE, UserRole.ELEVEUR)
  @ApiOperation({
    summary:
      'Historique COMPLET des alertes (actives + acquittées + résolues) — visibilité 360° pour les rapports',
  })
  @ApiParam({ name: 'farmId' })
  async history(
    @CurrentUser() user: AuthUser,
    @Param('farmId') farmId: string,
  ) {
    await this.farmsService.assertAccessible(user, farmId);
    return this.alertsService.historyForFarm(farmId);
  }

  @Post(':alertId/acknowledge')
  @Roles(UserRole.PROPRIETAIRE, UserRole.ELEVEUR)
  @ApiOperation({
    summary:
      'Acquitter une alerte : le fermier reconnaît l’avoir prise en compte (ACTIVE → ACQUITTEE). Re-levée si le risque persiste.',
  })
  @ApiParam({ name: 'farmId' })
  @ApiParam({ name: 'alertId' })
  async acknowledge(
    @CurrentUser() user: AuthUser,
    @Param('farmId') farmId: string,
    @Param('alertId') alertId: string,
  ) {
    await this.farmsService.assertAccessible(user, farmId);
    return this.alertsService.acknowledge(farmId, alertId);
  }
}
