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
import { CreateParcelleDto } from './dto/create-parcelle.dto.js';
import { UpdateParcelleDto } from './dto/update-parcelle.dto.js';
import { ParcellesService } from './parcelles.service.js';

@ApiTags('Parcelles (Agriculture)')
@Controller('farms/:farmId/parcelles')
export class ParcellesController {
  constructor(private readonly parcellesService: ParcellesService) {}

  @Post()
  @Roles(UserRole.PROPRIETAIRE, UserRole.ELEVEUR)
  @Permissions('agri:gerer')
  @ApiOperation({ summary: 'Créer une parcelle dans une ferme' })
  @ApiParam({ name: 'farmId' })
  create(
    @CurrentUser() user: AuthUser,
    @Param('farmId') farmId: string,
    @Body() dto: CreateParcelleDto,
  ) {
    return this.parcellesService.create(user, farmId, dto);
  }

  @Get()
  @Roles(UserRole.PROPRIETAIRE, UserRole.ELEVEUR)
  @ApiOperation({ summary: 'Lister les parcelles de la ferme' })
  @ApiParam({ name: 'farmId' })
  findAll(@CurrentUser() user: AuthUser, @Param('farmId') farmId: string) {
    return this.parcellesService.findAll(user, farmId);
  }

  @Get(':parcelleId')
  @Roles(UserRole.PROPRIETAIRE, UserRole.ELEVEUR)
  @ApiOperation({ summary: 'Détail d’une parcelle' })
  @ApiParam({ name: 'farmId' })
  @ApiParam({ name: 'parcelleId' })
  findOne(
    @CurrentUser() user: AuthUser,
    @Param('farmId') farmId: string,
    @Param('parcelleId') parcelleId: string,
  ) {
    return this.parcellesService.findOne(user, farmId, parcelleId);
  }

  @Patch(':parcelleId')
  @Roles(UserRole.PROPRIETAIRE, UserRole.ELEVEUR)
  @Permissions('agri:gerer')
  @ApiOperation({ summary: 'Modifier une parcelle' })
  @ApiParam({ name: 'farmId' })
  @ApiParam({ name: 'parcelleId' })
  update(
    @CurrentUser() user: AuthUser,
    @Param('farmId') farmId: string,
    @Param('parcelleId') parcelleId: string,
    @Body() dto: UpdateParcelleDto,
  ) {
    return this.parcellesService.update(user, farmId, parcelleId, dto);
  }

  @Delete(':parcelleId')
  @Roles(UserRole.PROPRIETAIRE, UserRole.ELEVEUR)
  @Permissions('agri:gerer')
  @ApiOperation({ summary: 'Supprimer une parcelle' })
  @ApiParam({ name: 'farmId' })
  @ApiParam({ name: 'parcelleId' })
  remove(
    @CurrentUser() user: AuthUser,
    @Param('farmId') farmId: string,
    @Param('parcelleId') parcelleId: string,
  ) {
    return this.parcellesService.remove(user, farmId, parcelleId);
  }
}