import { Body, Controller, Delete, Get, Param, Patch, Post } from '@nestjs/common';
import { ApiOperation, ApiParam, ApiTags } from '@nestjs/swagger';
import { CurrentUser } from '../../common/decorators/current-user.decorator.js';
import type { AuthUser } from '../../common/decorators/current-user.decorator.js';
import { Roles } from '../../common/decorators/roles.decorator.js';
import { Permissions } from '../../common/decorators/permissions.decorator.js';
import { UserRole } from '../../common/enums/role.enum.js';
import { CaisseService } from './caisse.service.js';
import {
  CloseCashSessionDto,
  CreateCashMovementDto,
  OpenCashSessionDto,
  UpdateCashMovementDto,
} from './dto/caisse.dto.js';

@ApiTags('Finance — Caisse journalière')
@Controller('farms/:farmId/caisse')
export class CaisseController {
  constructor(private readonly caisseService: CaisseService) {}

  @Get('current')
  @Roles(UserRole.PROPRIETAIRE, UserRole.ELEVEUR)
  @ApiOperation({
    summary: 'Session de caisse ouverte (mouvements + solde attendu) ou null',
  })
  @ApiParam({ name: 'farmId' })
  current(@CurrentUser() user: AuthUser, @Param('farmId') farmId: string) {
    return this.caisseService.getCurrent(user, farmId);
  }

  @Get('sessions')
  @Roles(UserRole.PROPRIETAIRE, UserRole.ELEVEUR)
  @ApiOperation({ summary: 'Historique des sessions de caisse' })
  @ApiParam({ name: 'farmId' })
  sessions(@CurrentUser() user: AuthUser, @Param('farmId') farmId: string) {
    return this.caisseService.listSessions(user, farmId);
  }

  @Post('open')
  @Roles(UserRole.PROPRIETAIRE, UserRole.ELEVEUR)
  @Permissions('caisse:ouvrir')
  @ApiOperation({
    summary:
      'Ouvrir la caisse journalière (fonds de caisse initial).',
  })
  @ApiParam({ name: 'farmId' })
  open(
    @CurrentUser() user: AuthUser,
    @Param('farmId') farmId: string,
    @Body() dto: OpenCashSessionDto,
  ) {
    return this.caisseService.open(user, farmId, dto);
  }

  @Post('close')
  @Roles(UserRole.PROPRIETAIRE, UserRole.ELEVEUR)
  @Permissions('caisse:fermer')
  @ApiOperation({
    summary:
      'Clôturer la caisse : solde déclaré vs attendu, écart tracé.',
  })
  @ApiParam({ name: 'farmId' })
  close(
    @CurrentUser() user: AuthUser,
    @Param('farmId') farmId: string,
    @Body() dto: CloseCashSessionDto,
  ) {
    return this.caisseService.close(user, farmId, dto);
  }

  @Post('movements')
  @Roles(UserRole.PROPRIETAIRE)
  @ApiOperation({
    summary:
      'Mouvement manuel de caisse (dépense/retrait IN ou OUT) — réservé au Propriétaire.',
  })
  @ApiParam({ name: 'farmId' })
  movement(
    @CurrentUser() user: AuthUser,
    @Param('farmId') farmId: string,
    @Body() dto: CreateCashMovementDto,
  ) {
    return this.caisseService.createMovement(user, farmId, dto);
  }

  @Patch('movements/:movementId')
  @Roles(UserRole.PROPRIETAIRE)
  @ApiOperation({
    summary:
      'Modifier un mouvement manuel (montant, raison, date) — ajustement comptable automatique. Réservé au Propriétaire.',
  })
  @ApiParam({ name: 'farmId' })
  updateMovement(
    @CurrentUser() user: AuthUser,
    @Param('farmId') farmId: string,
    @Param('movementId') movementId: string,
    @Body() dto: UpdateCashMovementDto,
  ) {
    return this.caisseService.updateMovement(user, farmId, movementId, dto);
  }

  @Delete('movements/:movementId')
  @Roles(UserRole.PROPRIETAIRE)
  @ApiOperation({
    summary:
      'Supprimer un mouvement manuel — contrepassation comptable automatique. Réservé au Propriétaire.',
  })
  @ApiParam({ name: 'farmId' })
  deleteMovement(
    @CurrentUser() user: AuthUser,
    @Param('farmId') farmId: string,
    @Param('movementId') movementId: string,
  ) {
    return this.caisseService.deleteMovement(user, farmId, movementId);
  }
}
