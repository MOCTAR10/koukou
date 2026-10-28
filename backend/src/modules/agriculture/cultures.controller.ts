import { Body, Controller, Get, Post, Query } from '@nestjs/common';
import { ApiOperation, ApiQuery, ApiTags } from '@nestjs/swagger';
import {
  IsEnum,
  IsNotEmpty,
  IsNumber,
  IsOptional,
  IsString,
  IsUUID,
  Min,
} from 'class-validator';
import { CurrentUser } from '../../common/decorators/current-user.decorator.js';
import type { AuthUser } from '../../common/decorators/current-user.decorator.js';
import { CropCategory } from '../../common/enums/crop-category.enum.js';
import { Roles } from '../../common/decorators/roles.decorator.js';
import { UserRole } from '../../common/enums/role.enum.js';
import { FarmsService } from '../farms/farms.service.js';
import { CulturesService } from './cultures.service.js';

class CreateCultureDto {
  @IsString()
  @IsNotEmpty({ message: 'Le nom de la culture est obligatoire.' })
  name: string;

  @IsEnum(CropCategory, { message: 'La catégorie est invalide.' })
  category: CropCategory;

  @IsOptional()
  @IsNumber()
  @Min(1)
  defaultCycleDays?: number;

  @IsOptional()
  @IsNumber()
  @Min(0)
  waterNeedsLPlantDay?: number;

  @IsOptional()
  @IsString()
  notes?: string;

  /** Farm that owns the custom culture (omitted: shared, platform admin only). */
  @IsOptional()
  @IsUUID('4', { message: 'Identifiant de ferme invalide.' })
  farmId?: string;
}

@ApiTags('Cultures (Agriculture)')
@Controller('cultures')
export class CulturesController {
  constructor(
    private readonly culturesService: CulturesService,
    private readonly farmsService: FarmsService,
  ) {}

  @Get()
  @ApiOperation({ summary: 'Référentiel des cultures, regroupées par catégorie' })
  @ApiQuery({ name: 'farmId', required: false })
  @Roles(UserRole.PROPRIETAIRE, UserRole.ELEVEUR)
  async findAll(
    @CurrentUser() user: AuthUser,
    @Query('farmId') farmId?: string,
  ) {
    const scope = await this.farmsService.resourceScope(user, farmId, 'read');
    return this.culturesService.findAll(scope);
  }

  @Post()
  @ApiOperation({ summary: 'Ajouter une culture personnalisée à la ferme' })
  @Roles(UserRole.PROPRIETAIRE)
  async create(@CurrentUser() user: AuthUser, @Body() dto: CreateCultureDto) {
    const scope = await this.farmsService.resourceScope(
      user,
      dto.farmId,
      'write',
    );
    return this.culturesService.createCustom(
      scope,
      dto.name,
      dto.category,
      dto.defaultCycleDays,
      dto.waterNeedsLPlantDay,
      dto.notes,
    );
  }
}