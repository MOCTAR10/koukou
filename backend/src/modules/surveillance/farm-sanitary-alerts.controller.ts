import { Controller, Get, Param, ParseUUIDPipe, Query } from '@nestjs/common';
import { ApiOperation, ApiParam, ApiTags } from '@nestjs/swagger';
import {
  CurrentUser,
  type AuthUser,
} from '../../common/decorators/current-user.decorator.js';
import { Domain } from '../../common/decorators/domain.decorator.js';
import { Permissions } from '../../common/decorators/permissions.decorator.js';
import { Roles } from '../../common/decorators/roles.decorator.js';
import { UserRole } from '../../common/enums/role.enum.js';
import { ListSanitaryAlertsDto } from './dto/sanitary-alert.dto.js';
import { SanitaryAlertsService } from './sanitary-alerts.service.js';

/** Official sanitary alerts of one farm, as the farm (and its agents) see them. */
@ApiTags('Surveillance sanitaire (ferme)')
@Domain('SANITAIRE')
@Roles(UserRole.PROPRIETAIRE, UserRole.ELEVEUR)
@Permissions('sanitaire:lecture', 'sanitaire:gerer', 'sanitaire:signaler')
@Controller('farms/:farmId/sanitary-alerts')
export class FarmSanitaryAlertsController {
  constructor(private readonly alerts: SanitaryAlertsService) {}

  @Get()
  @ApiOperation({
    summary: 'Alertes sanitaires officielles de la ferme et leur statut',
  })
  @ApiParam({ name: 'farmId' })
  list(
    @CurrentUser() user: AuthUser,
    @Param('farmId') farmId: string,
    @Query() query: ListSanitaryAlertsDto,
  ) {
    return this.alerts.listForFarm(user, farmId, query);
  }

  @Get(':alertId')
  @ApiOperation({ summary: 'Détail d’une alerte sanitaire de la ferme' })
  @ApiParam({ name: 'farmId' })
  @ApiParam({ name: 'alertId' })
  detail(
    @CurrentUser() user: AuthUser,
    @Param('farmId') farmId: string,
    @Param('alertId', ParseUUIDPipe) alertId: string,
  ) {
    return this.alerts.detail(user, alertId, farmId);
  }
}
