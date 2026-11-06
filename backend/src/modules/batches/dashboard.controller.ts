import { AuditThirdPartyRead } from '../../common/decorators/audit.decorator.js';
import { Controller, Get, Param, Query } from '@nestjs/common';
import { ApiOperation, ApiParam, ApiQuery, ApiTags } from '@nestjs/swagger';
import { CurrentUser } from '../../common/decorators/current-user.decorator.js';
import type { AuthUser } from '../../common/decorators/current-user.decorator.js';
import { Roles } from '../../common/decorators/roles.decorator.js';
import { UserRole } from '../../common/enums/role.enum.js';
import { DashboardService } from './dashboard.service.js';
import { Domain } from '../../common/decorators/domain.decorator.js';

@ApiTags('Tableau de bord (agrégats)')
@Domain('TECHNIQUE')
@Controller('farms/:farmId')
export class FarmDashboardController {
  constructor(private readonly dashboardService: DashboardService) {}

  @Get('dashboard')
  @AuditThirdPartyRead('Tableau de bord d’une ferme (encaissé du jour)')
  @Roles(UserRole.PROPRIETAIRE, UserRole.ELEVEUR)
  @ApiOperation({
    summary:
      'Tableau de bord ferme : cheptel vivant, mortalité/viabilité, autonomie provende, encaissé du jour, équipe et alertes par niveau.',
  })
  @ApiParam({ name: 'farmId' })
  @ApiQuery({
    name: 'date',
    required: false,
    description:
      "Date de référence (YYYY-MM-DD). Omettez pour le tableau de bord du jour courant. Les agrégats (encaissé du jour, eau, écarts hebdo, alertes de saisie manquante) sont calculés relativement à cette date.",
  })
  @ApiQuery({
    name: 'time',
    required: false,
    description:
      "Heure de référence (HH:MM). Utilisé avec date pour filtrer les encaissements jusqu'à cette heure.",
  })
  dashboard(
    @CurrentUser() user: AuthUser,
    @Param('farmId') farmId: string,
    @Query('date') date?: string,
    @Query('time') time?: string,
  ) {
    return this.dashboardService.getDashboard(user, farmId, date, time);
  }
}

@ApiTags('Tableau de bord (agrégats)')
@Domain('TECHNIQUE')
@Controller('farms/:farmId/batches')
export class BatchCurveController {
  constructor(private readonly dashboardService: DashboardService) {}

  @Get(':batchId/curve')
  @Roles(UserRole.PROPRIETAIRE, UserRole.ELEVEUR)
  @ApiOperation({
    summary:
      'Courbe de croissance du lot : série hebdo du poids moyen, aliments consommés et IC cumulé (chart-ready).',
  })
  @ApiParam({ name: 'farmId' })
  @ApiParam({ name: 'batchId' })
  curve(
    @CurrentUser() user: AuthUser,
    @Param('farmId') farmId: string,
    @Param('batchId') batchId: string,
  ) {
    return this.dashboardService.getCurve(user, farmId, batchId);
  }
}
