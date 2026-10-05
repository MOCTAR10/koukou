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
import { PointsOfSaleService } from './points-of-sale.service.js';
import {
  CreatePointOfSaleDto,
  UpdatePointOfSaleDto,
} from './dto/point-of-sale.dto.js';

@ApiTags('Points de vente')
@Controller('farms/:farmId/points-of-sale')
@Roles(UserRole.PROPRIETAIRE, UserRole.ELEVEUR)
export class PointsOfSaleController {
  constructor(private readonly pointsOfSaleService: PointsOfSaleService) {}

  @Get()
  @ApiOperation({
    summary:
      'Liste des points de vente (crée le point de vente « ferme » par défaut au premier accès).',
  })
  @ApiParam({ name: 'farmId' })
  list(
    @CurrentUser() user: AuthUser,
    @Param('farmId') farmId: string,
  ) {
    return this.pointsOfSaleService.list(user, farmId);
  }

  @Post()
  @Roles(UserRole.PROPRIETAIRE)
  @Permissions('pdv:gerer')
  @ApiOperation({
    summary: 'Créer un point de vente (Propriétaire).',
  })
  @ApiParam({ name: 'farmId' })
  create(
    @CurrentUser() user: AuthUser,
    @Param('farmId') farmId: string,
    @Body() dto: CreatePointOfSaleDto,
  ) {
    return this.pointsOfSaleService.create(user, farmId, dto);
  }

  @Get(':pointOfSaleId')
  @ApiOperation({ summary: 'Détail d’un point de vente.' })
  @ApiParam({ name: 'farmId' })
  getOne(
    @CurrentUser() user: AuthUser,
    @Param('farmId') farmId: string,
    @Param('pointOfSaleId') pointOfSaleId: string,
  ) {
    return this.pointsOfSaleService.getOne(user, farmId, pointOfSaleId);
  }

  @Patch(':pointOfSaleId')
  @Roles(UserRole.PROPRIETAIRE)
  @Permissions('pdv:gerer')
  @ApiOperation({ summary: 'Mettre à jour un point de vente (Propriétaire).' })
  @ApiParam({ name: 'farmId' })
  update(
    @CurrentUser() user: AuthUser,
    @Param('farmId') farmId: string,
    @Param('pointOfSaleId') pointOfSaleId: string,
    @Body() dto: UpdatePointOfSaleDto,
  ) {
    return this.pointsOfSaleService.update(user, farmId, pointOfSaleId, dto);
  }

  @Delete(':pointOfSaleId')
  @Roles(UserRole.PROPRIETAIRE)
  @Permissions('pdv:gerer')
  @ApiOperation({
    summary: 'Supprimer un point de vente (le « ferme » par défaut est protégé).',
  })
  @ApiParam({ name: 'farmId' })
  remove(
    @CurrentUser() user: AuthUser,
    @Param('farmId') farmId: string,
    @Param('pointOfSaleId') pointOfSaleId: string,
  ) {
    return this.pointsOfSaleService.remove(user, farmId, pointOfSaleId);
  }
}