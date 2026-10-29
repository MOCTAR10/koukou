import { Body, Controller, Get, Param, Post, Query } from '@nestjs/common';
import { ApiOperation, ApiQuery, ApiTags } from '@nestjs/swagger';
import {
  IsEnum,
  IsNotEmpty,
  IsOptional,
  IsString,
  IsUUID,
} from 'class-validator';
import { CurrentUser } from '../../common/decorators/current-user.decorator.js';
import type { AuthUser } from '../../common/decorators/current-user.decorator.js';
import { BatchType } from '../../common/enums/batch-type.enum.js';
import { Species } from '../../common/enums/species.enum.js';
import { Roles } from '../../common/decorators/roles.decorator.js';
import { UserRole } from '../../common/enums/role.enum.js';
import { FarmsService } from '../farms/farms.service.js';
import { BreedsService } from './breeds.service.js';

class CreateBreedDto {
  @IsString()
  @IsNotEmpty({ message: 'Le nom de la souche est obligatoire.' })
  name: string;

  @IsEnum(BatchType, { message: 'Le type doit être CHAIR ou PONDEUSE.' })
  type: BatchType;

  @IsOptional()
  @IsEnum(Species, { message: 'L’espèce doit être une valeur valide.' })
  species?: Species;

  @IsOptional()
  @IsString()
  @IsNotEmpty({ message: 'Le code de référence doit être non vide.' })
  refCode?: string;

  /** Farm that owns the custom breed (omitted: shared, platform admin only). */
  @IsOptional()
  @IsUUID('4', { message: 'Identifiant de ferme invalide.' })
  farmId?: string;
}

@ApiTags('Souches (Breed)')
@Controller('breeds')
export class BreedsController {
  constructor(
    private readonly breedsService: BreedsService,
    private readonly farmsService: FarmsService,
  ) {}

  @Get()
  @ApiOperation({
    summary:
      'Lister les souches disponibles : référentiel commun + souches de la ferme',
  })
  @ApiQuery({ name: 'farmId', required: false })
  @Roles(UserRole.PROPRIETAIRE, UserRole.ELEVEUR)
  async findAll(
    @CurrentUser() user: AuthUser,
    @Query('farmId') farmId?: string,
  ) {
    const scope = await this.farmsService.resourceScope(user, farmId, 'read');
    return this.breedsService.findAll(scope);
  }

  @Get(':id/standards')
  @ApiOperation({
    summary:
      'Référentiel zootechnique d’une souche : poids moyen / IC / ponte par semaine (Breed Intelligence)',
  })
  @ApiQuery({ name: 'farmId', required: false })
  @Roles(UserRole.PROPRIETAIRE, UserRole.ELEVEUR)
  async getStandards(
    @CurrentUser() user: AuthUser,
    @Param('id') id: string,
    @Query('farmId') farmId?: string,
  ) {
    const scope = await this.farmsService.resourceScope(user, farmId, 'read');
    return this.breedsService.getStandards(id, scope);
  }

  @Post()
  @ApiOperation({ summary: 'Ajouter une souche personnalisée à la ferme' })
  @Roles(UserRole.PROPRIETAIRE)
  async create(@CurrentUser() user: AuthUser, @Body() dto: CreateBreedDto) {
    const scope = await this.farmsService.resourceScope(
      user,
      dto.farmId,
      'write',
    );
    return this.breedsService.createCustom(
      scope,
      dto.name,
      dto.type,
      dto.species,
      dto.refCode,
    );
  }
}
