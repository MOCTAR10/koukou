import { AuditThirdPartyRead } from '../../common/decorators/audit.decorator.js';
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
import { visibleAlerts } from './economic-alerts.js';
import { Domain, InstitutionReadOnly } from '../../common/decorators/domain.decorator.js';

@ApiTags('Alertes (Assistant)')
@Domain('TECHNIQUE')
@InstitutionReadOnly('Conseils d’élevage')
@Controller('farms/:farmId/alerts')
export class AlertsController {
  constructor(
    private readonly alertsService: AlertsService,
    private readonly farmsService: FarmsService,
  ) {}

  @Get()
  @AuditThirdPartyRead('Alertes d’une ferme (contexte économique)')
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
    // POUFA lot A droits: margin and sales alerts for economic readers only (F6).
    return visibleAlerts(
      await this.alertsService.listForFarm(farmId, status),
      await this.farmsService.readsEconomics(user),
    );
  }

  @Get('history')
  @AuditThirdPartyRead('Historique des alertes d’une ferme')
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
    return visibleAlerts(
      await this.alertsService.historyForFarm(farmId),
      await this.farmsService.readsEconomics(user),
    );
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
