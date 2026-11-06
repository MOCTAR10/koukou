import { Body, Controller, Get, Param, Post, Query } from '@nestjs/common';
import { ApiOperation, ApiTags } from '@nestjs/swagger';
import { CurrentUser } from '../../common/decorators/current-user.decorator.js';
import type { AuthUser } from '../../common/decorators/current-user.decorator.js';
import { Action, Domain } from '../../common/decorators/domain.decorator.js';
import { Roles } from '../../common/decorators/roles.decorator.js';
import { UserRole } from '../../common/enums/role.enum.js';
import {
  CancelInputDeliveryDto,
  CreateInputDeliveryDto,
  ListInputDeliveriesQueryDto,
} from './dto/input-delivery.dto.js';
import { InputDeliveriesService } from './input-deliveries.service.js';

/**
 * Programme input deliveries, DGE side (POUFA L4): the platform admin or an
 * institutional profile granted INTRANTS records them for a farm of its
 * scope; lists are filtered in SQL by the scope. The farmer confirms from
 * `/farms/:farmId/input-deliveries`.
 */
@ApiTags('Intrants POUFA (livraisons)')
@Domain('INTRANTS')
@Controller('programme/input-deliveries')
export class ProgrammeDeliveriesController {
  constructor(private readonly deliveries: InputDeliveriesService) {}

  @Post()
  @Roles(UserRole.PLATFORM_ADMIN)
  @ApiOperation({
    summary:
      'Enregistrer une livraison d’intrants pour une ferme (en attente de confirmation par l’éleveur)',
  })
  create(@CurrentUser() user: AuthUser, @Body() dto: CreateInputDeliveryDto) {
    return this.deliveries.create(user, dto);
  }

  @Get()
  @Roles(UserRole.PLATFORM_ADMIN)
  @ApiOperation({
    summary:
      'Livraisons du périmètre : par province, statut, ferme et période d’expédition',
  })
  list(
    @CurrentUser() user: AuthUser,
    @Query() query: ListInputDeliveriesQueryDto,
  ) {
    return this.deliveries.list(user, query);
  }

  @Get(':id')
  @Roles(UserRole.PLATFORM_ADMIN)
  @ApiOperation({ summary: 'Détail d’une livraison' })
  get(@CurrentUser() user: AuthUser, @Param('id') id: string) {
    return this.deliveries.getForProgramme(user, id);
  }

  @Post(':id/cancel')
  // Whoever records a delivery may withdraw it before confirmation; no
  // MODIFIER here, which would also grant `stock:gerer` on the farms.
  @Action('CREER')
  @Roles(UserRole.PLATFORM_ADMIN)
  @ApiOperation({ summary: 'Annuler une livraison non encore confirmée' })
  cancel(
    @CurrentUser() user: AuthUser,
    @Param('id') id: string,
    @Body() dto: CancelInputDeliveryDto,
  ) {
    return this.deliveries.cancel(user, id, dto);
  }
}
