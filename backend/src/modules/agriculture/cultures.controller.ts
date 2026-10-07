import { Body, Controller, Get, Post } from '@nestjs/common';
import { ApiOperation, ApiTags } from '@nestjs/swagger';
import { IsEnum, IsNotEmpty, IsNumber, IsOptional, IsString, Min } from 'class-validator';
import { CropCategory } from '../../common/enums/crop-category.enum.js';
import { Roles } from '../../common/decorators/roles.decorator.js';
import { UserRole } from '../../common/enums/role.enum.js';
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
}

@ApiTags('Cultures (Agriculture)')
@Controller('cultures')
export class CulturesController {
  constructor(private readonly culturesService: CulturesService) {}

  @Get()
  @ApiOperation({ summary: 'Référentiel des cultures, regroupées par catégorie' })
  @Roles(UserRole.PROPRIETAIRE, UserRole.ELEVEUR)
  findAll() {
    return this.culturesService.findAll();
  }

  @Post()
  @ApiOperation({ summary: 'Ajouter une culture personnalisée' })
  @Roles(UserRole.PROPRIETAIRE)
  create(@Body() dto: CreateCultureDto) {
    return this.culturesService.createCustom(
      dto.name,
      dto.category,
      dto.defaultCycleDays,
      dto.waterNeedsLPlantDay,
      dto.notes,
    );
  }
}