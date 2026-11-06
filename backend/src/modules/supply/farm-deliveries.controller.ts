import { AuditThirdPartyRead } from '../../common/decorators/audit.decorator.js';
import { Body, Controller, Get, Param, Post, Put, Query } from '@nestjs/common';
import { ApiOperation, ApiTags } from '@nestjs/swagger';
import { CurrentUser } from '../../common/decorators/current-user.decorator.js';
import type { AuthUser } from '../../common/decorators/current-user.decorator.js';
import { Domain } from '../../common/decorators/domain.decorator.js';
import { Permissions } from '../../common/decorators/permissions.decorator.js';
import { Roles } from '../../common/decorators/roles.decorator.js';
import { UserRole } from '../../common/enums/role.enum.js';
import { DeclarativeStockService } from './declarative-stock.service.js';
import {
  AttachBandDto,
  ConfirmInputDeliveryDto,
  FarmInputDeliveriesQueryDto,
} from './dto/input-delivery.dto.js';
import { InputDeliveriesService } from './input-deliveries.service.js';

/**
 * Programme input deliveries, farm side (POUFA L4): the farm reads its
 * deliveries and its declarative stock; the farmer (owner, or a member with
 * `stock:gerer`) confirms what he really received. Institutions read within
 * their scope (INTRANTS:CONSULTER) but never confirm.
 */
@ApiTags('Intrants POUFA (livraisons)')
@Domain('INTRANTS')
@Controller('farms/:farmId')
export class FarmDeliveriesController {
  constructor(
    private readonly deliveries: InputDeliveriesService,
    private readonly declarative: DeclarativeStockService,
  ) {}

  @Get('input-deliveries')
  @AuditThirdPartyRead('Livraisons d’intrants d’une ferme (coûts, subventions)')
  @Permissions('intrants:lire', 'stock:gerer')
  @Roles(UserRole.PROPRIETAIRE, UserRole.ELEVEUR)
  @ApiOperation({ summary: 'Livraisons d’intrants de la ferme' })
  list(
    @CurrentUser() user: AuthUser,
    @Param('farmId') farmId: string,
    @Query() query: FarmInputDeliveriesQueryDto,
  ) {
    return this.deliveries.listForFarm(user, farmId, query.status);
  }

  @Get('input-deliveries/:id')
  @AuditThirdPartyRead('Détail d’une livraison d’intrants (coûts, subventions)')
  @Permissions('intrants:lire', 'stock:gerer')
  @Roles(UserRole.PROPRIETAIRE, UserRole.ELEVEUR)
  @ApiOperation({ summary: 'Détail d’une livraison de la ferme' })
  get(
    @CurrentUser() user: AuthUser,
    @Param('farmId') farmId: string,
    @Param('id') id: string,
  ) {
    return this.deliveries.getForFarm(user, farmId, id);
  }

  @Post('input-deliveries/:id/confirm')
  @Roles(UserRole.PROPRIETAIRE, UserRole.ELEVEUR)
  @Permissions('stock:gerer')
  @ApiOperation({
    summary:
      'Confirmer la réception (quantités réellement reçues) : crée les lots d’intrants de la ferme',
  })
  confirm(
    @CurrentUser() user: AuthUser,
    @Param('farmId') farmId: string,
    @Param('id') id: string,
    @Body() dto: ConfirmInputDeliveryDto,
  ) {
    return this.deliveries.confirm(user, farmId, id, dto);
  }

  @Put('input-deliveries/:id/band')
  @Roles(UserRole.PROPRIETAIRE, UserRole.ELEVEUR)
  @Permissions('stock:gerer')
  @ApiOperation({
    summary:
      'Rattacher la livraison à une bande (ex. bande ouverte après une livraison de poussins)',
  })
  attachBand(
    @CurrentUser() user: AuthUser,
    @Param('farmId') farmId: string,
    @Param('id') id: string,
    @Body() dto: AttachBandDto,
  ) {
    return this.deliveries.attachBand(user, farmId, id, dto);
  }

  @Get('declarative-stock')
  @Permissions('intrants:lire', 'stock:gerer')
  @Roles(UserRole.PROPRIETAIRE, UserRole.ELEVEUR)
  @ApiOperation({
    summary:
      'Stock déclaratif par intrant (reçu − utilisé), distinct du stock physique FEFO',
  })
  declarativeStock(
    @CurrentUser() user: AuthUser,
    @Param('farmId') farmId: string,
  ) {
    return this.declarative.forFarm(user, farmId);
  }
}
