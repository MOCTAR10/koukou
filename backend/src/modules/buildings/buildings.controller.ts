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
import { BuildingsService } from './buildings.service.js';
import { CreateBuildingDto } from './dto/create-building.dto.js';
import { UpdateBuildingDto } from './dto/update-building.dto.js';

@ApiTags('Bâtiments')
@Controller('farms/:farmId/buildings')
export class BuildingsController {
  constructor(private readonly buildingsService: BuildingsService) {}

  @Post()
  @Roles(UserRole.PROPRIETAIRE, UserRole.ELEVEUR)
  @Permissions('production:gerer')
  @ApiOperation({ summary: 'Créer un bâtiment dans une ferme' })
  @ApiParam({ name: 'farmId' })
  create(
    @CurrentUser() user: AuthUser,
    @Param('farmId') farmId: string,
    @Body() dto: CreateBuildingDto,
  ) {
    return this.buildingsService.create(user, farmId, dto);
  }

  @Get()
  @Roles(UserRole.PROPRIETAIRE, UserRole.ELEVEUR)
  @ApiOperation({ summary: 'Lister les bâtiments avec occupation et densité' })
  @ApiParam({ name: 'farmId' })
  findAll(@CurrentUser() user: AuthUser, @Param('farmId') farmId: string) {
    return this.buildingsService.findAll(user, farmId);
  }

  @Get(':buildingId')
  @Roles(UserRole.PROPRIETAIRE, UserRole.ELEVEUR)
  @ApiOperation({ summary: 'Détail d’un bâtiment (occupation + densité)' })
  @ApiParam({ name: 'farmId' })
  @ApiParam({ name: 'buildingId' })
  findOne(
    @CurrentUser() user: AuthUser,
    @Param('farmId') farmId: string,
    @Param('buildingId') buildingId: string,
  ) {
    return this.buildingsService.findOne(user, farmId, buildingId);
  }

  @Patch(':buildingId')
  @Roles(UserRole.PROPRIETAIRE, UserRole.ELEVEUR)
  @Permissions('production:gerer')
  @ApiOperation({
    summary: 'Modifier un bâtiment (ex : valider le vide sanitaire)',
  })
  @ApiParam({ name: 'farmId' })
  @ApiParam({ name: 'buildingId' })
  update(
    @CurrentUser() user: AuthUser,
    @Param('farmId') farmId: string,
    @Param('buildingId') buildingId: string,
    @Body() dto: UpdateBuildingDto,
  ) {
    return this.buildingsService.update(user, farmId, buildingId, dto);
  }

  @Delete(':buildingId')
  @Roles(UserRole.PROPRIETAIRE, UserRole.ELEVEUR)
  @Permissions('production:gerer')
  @ApiOperation({ summary: 'Supprimer un bâtiment' })
  @ApiParam({ name: 'farmId' })
  @ApiParam({ name: 'buildingId' })
  remove(
    @CurrentUser() user: AuthUser,
    @Param('farmId') farmId: string,
    @Param('buildingId') buildingId: string,
  ) {
    return this.buildingsService.remove(user, farmId, buildingId);
  }
}
