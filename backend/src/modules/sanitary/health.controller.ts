import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  Patch,
  Post,
} from '@nestjs/common';
import { ApiOperation, ApiParam, ApiTags } from '@nestjs/swagger';
import { CurrentUser } from '../../common/decorators/current-user.decorator.js';
import type { AuthUser } from '../../common/decorators/current-user.decorator.js';
import { Roles } from '../../common/decorators/roles.decorator.js';
import { Permissions } from '../../common/decorators/permissions.decorator.js';
import { UserRole } from '../../common/enums/role.enum.js';
import { HealthService } from './health.service.js';
import { CreateHealthEventDto } from './dto/create-health-event.dto.js';

@ApiTags('Sanitaire & Prophylaxie')
@Roles(UserRole.PROPRIETAIRE, UserRole.ELEVEUR)
@Controller('farms/:farmId/batches/:batchId')
export class HealthController {
  constructor(private readonly healthService: HealthService) {}

  @Get('health')
  @ApiOperation({
    summary:
      'Agrégat santé du lot : métriques (FCR, alvéoles/trays, aliment g/oiseau, mortalité, ponte), score santé 0-100, conseils et tendances hebdomadaires',
  })
  @ApiParam({ name: 'farmId' })
  @ApiParam({ name: 'batchId' })
  getHealth(
    @CurrentUser() user: AuthUser,
    @Param('farmId') farmId: string,
    @Param('batchId') batchId: string,
  ) {
    return this.healthService.getHealth(user, farmId, batchId);
  }

  @Get('health-events')
  @ApiOperation({ summary: 'Chronologie des événements sanitaires du lot' })
  @ApiParam({ name: 'farmId' })
  @ApiParam({ name: 'batchId' })
  listEvents(
    @CurrentUser() user: AuthUser,
    @Param('farmId') farmId: string,
    @Param('batchId') batchId: string,
  ) {
    return this.healthService.listEvents(user, farmId, batchId);
  }

  @Post('health-events')
  @Permissions('sanitaire:gerer')
  @ApiOperation({
    summary:
      "Enregistrer un événement sanitaire (maladie, mortalité, réforme/culling, symptôme, visite vétérinaire) ; une réforme décrémente l'effectif vivant",
  })
  @ApiParam({ name: 'farmId' })
  @ApiParam({ name: 'batchId' })
  createEvent(
    @CurrentUser() user: AuthUser,
    @Param('farmId') farmId: string,
    @Param('batchId') batchId: string,
    @Body() dto: CreateHealthEventDto,
  ) {
    return this.healthService.createEvent(user, farmId, batchId, dto);
  }

  @Patch('health-events/:eventId/resolve')
  @Permissions('sanitaire:gerer')
  @ApiOperation({ summary: "Marquer un événement sanitaire comme résolu" })
  @ApiParam({ name: 'farmId' })
  @ApiParam({ name: 'batchId' })
  @ApiParam({ name: 'eventId' })
  resolveEvent(
    @CurrentUser() user: AuthUser,
    @Param('farmId') farmId: string,
    @Param('batchId') batchId: string,
    @Param('eventId') eventId: string,
  ) {
    return this.healthService.resolveEvent(user, farmId, batchId, eventId);
  }

  @Delete('health-events/:eventId')
  @Permissions('sanitaire:gerer')
  @ApiOperation({
    summary:
      "Supprimer un événement sanitaire ; le retrait d'une réforme réintègre l'effectif",
  })
  @ApiParam({ name: 'farmId' })
  @ApiParam({ name: 'batchId' })
  @ApiParam({ name: 'eventId' })
  deleteEvent(
    @CurrentUser() user: AuthUser,
    @Param('farmId') farmId: string,
    @Param('batchId') batchId: string,
    @Param('eventId') eventId: string,
  ) {
    return this.healthService.deleteEvent(user, farmId, batchId, eventId);
  }
}
