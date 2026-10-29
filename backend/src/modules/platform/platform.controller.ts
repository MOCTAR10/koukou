import {
  Body,
  Controller,
  Get,
  Param,
  Patch,
  Post,
  Query,
} from '@nestjs/common';
import {
  ApiBearerAuth,
  ApiOperation,
  ApiParam,
  ApiTags,
} from '@nestjs/swagger';
import { CurrentUser } from '../../common/decorators/current-user.decorator.js';
import type { AuthUser } from '../../common/decorators/current-user.decorator.js';
import { Roles } from '../../common/decorators/roles.decorator.js';
import { BatchType } from '../../common/enums/batch-type.enum.js';
import { Species } from '../../common/enums/species.enum.js';
import { UserRole } from '../../common/enums/role.enum.js';
import {
  IsEmail,
  IsEnum,
  IsInt,
  IsNotEmpty,
  IsNumber,
  IsObject,
  IsOptional,
  IsBoolean,
  IsString,
  Min,
  MinLength,
  ValidateNested,
} from 'class-validator';
import { Transform, Type } from 'class-transformer';
import { FarmsService } from '../farms/farms.service.js';
import { PlatformService } from './platform.service.js';

class ProvisionFarmOwnerDto {
  @IsString()
  @IsNotEmpty({ message: 'Le nom complet du propriétaire est requis.' })
  fullName: string;

  // Trimmed like /auth/register and /auth/login, or the owner could never
  // log in with a pasted "077123456 ".
  @Transform(({ value }) => (typeof value === 'string' ? value.trim() : value))
  @IsString()
  @IsNotEmpty({ message: 'Le numéro de téléphone est requis.' })
  phone: string;

  @IsOptional()
  @IsEmail({}, { message: 'Adresse e-mail invalide.' })
  email?: string;

  @IsString()
  @MinLength(6, {
    message: 'Le code doit contenir au moins 6 caractères.',
  })
  code: string;
}

class ProvisionFarmDto {
  @IsString()
  @IsNotEmpty({ message: 'Le nom de la ferme est requis.' })
  name: string;

  @IsString()
  @IsNotEmpty({ message: 'La commune est requise.' })
  administrativeCity: string;

  @IsOptional()
  @IsInt({ message: 'Le nombre de bâtiments doit être un entier.' })
  @Min(1, { message: 'Le nombre de bâtiments doit être supérieur à 0.' })
  buildingCount?: number;

  @IsOptional()
  @IsInt({ message: 'La capacité par bâtiment doit être un entier.' })
  @Min(1, { message: 'La capacité par bâtiment doit être supérieure à 0.' })
  capacityPerBuilding?: number;

  @IsOptional()
  @IsNumber({}, { message: 'La surface doit être un nombre.' })
  @Min(0, { message: 'La surface doit être positive.' })
  buildingAreaM2?: number;

  @IsOptional()
  @IsInt({ message: 'Le poids du sac doit être un entier.' })
  @Min(1, { message: 'Le poids du sac doit être supérieur à 0.' })
  defaultSacKg?: number;

  @IsOptional()
  @IsNumber({}, { message: 'La longitude doit être un nombre.' })
  longitude?: number;

  @IsOptional()
  @IsNumber({}, { message: 'La latitude doit être un nombre.' })
  latitude?: number;

  @IsObject()
  @ValidateNested()
  @Type(() => ProvisionFarmOwnerDto)
  owner: ProvisionFarmOwnerDto;
}

class UpdateFarmDto {
  @IsOptional()
  @IsString()
  @IsNotEmpty({ message: 'Le nom de la ferme est requis.' })
  name?: string;

  @IsOptional()
  @IsString()
  @IsNotEmpty({ message: 'La commune est requise.' })
  administrativeCity?: string;

  @IsOptional()
  @IsInt({ message: 'Le nombre de bâtiments doit être un entier.' })
  @Min(1, { message: 'Le nombre de bâtiments doit être supérieur à 0.' })
  buildingCount?: number;

  @IsOptional()
  @IsInt({ message: 'La capacité par bâtiment doit être un entier.' })
  @Min(1, { message: 'La capacité par bâtiment doit être supérieure à 0.' })
  capacityPerBuilding?: number;

  @IsOptional()
  @IsNumber({}, { message: 'La surface doit être un nombre.' })
  @Min(0, { message: 'La surface doit être positive.' })
  buildingAreaM2?: number;

  @IsOptional()
  @IsInt({ message: 'Le poids du sac doit être un entier.' })
  @Min(1, { message: 'Le poids du sac doit être supérieur à 0.' })
  defaultSacKg?: number;

  @IsOptional()
  @IsNumber({})
  longitude?: number;

  @IsOptional()
  @IsNumber({})
  latitude?: number;

  @IsOptional()
  @IsBoolean({ message: 'active doit être un booléen.' })
  active?: boolean;

  @IsOptional()
  @IsBoolean({ message: 'isVerified doit être un booléen.' })
  isVerified?: boolean;
}

class SuspendUserDto {
  @IsBoolean({ message: 'suspended doit être un booléen.' })
  suspended: boolean;
}

class UpdatePaymentMethodDto {
  @IsBoolean({ message: 'enabled doit être un booléen.' })
  enabled: boolean;
}

class UpdateBreedDto {
  @IsOptional()
  @IsString()
  @IsNotEmpty({ message: 'Le nom de la souche est requis.' })
  name?: string;

  @IsOptional()
  @IsEnum(BatchType, { message: 'Type invalide (CHAIR ou PONDEUSE).' })
  type?: BatchType;

  @IsOptional()
  @IsEnum(Species, { message: 'Espèce invalide.' })
  species?: Species;

  @IsOptional()
  @IsBoolean({ message: 'active doit être un booléen.' })
  active?: boolean;
}

class UpdateProtocolDto {
  @IsOptional()
  @IsString()
  @IsNotEmpty({ message: 'Le nom du protocole est requis.' })
  name?: string;

  @IsOptional()
  @IsBoolean({ message: 'isEditable doit être un booléen.' })
  isEditable?: boolean;
}

@ApiTags('Administration plateforme')
@ApiBearerAuth()
@Controller('admin')
@Roles(UserRole.PLATFORM_ADMIN)
export class PlatformAdminController {
  constructor(
    private readonly platformService: PlatformService,
    private readonly farmsService: FarmsService,
  ) {}

  @Get('metrics')
  @ApiOperation({
    summary:
      'Vue d’ensemble de la plateforme (fermes, utilisateurs, lots, ventes, encaissés, alertes, clients) — période optionnelle.',
  })
  metrics(@Query('from') from?: string, @Query('to') to?: string) {
    return this.platformService.metrics(from, to);
  }

  @Get('metrics/by-farm')
  @ApiOperation({
    summary:
      'Métriques détaillées pour chaque ferme de la plateforme (cheptel, ventes, encaissés, alertes, clients).',
  })
  metricsByFarm(@Query('from') from?: string, @Query('to') to?: string) {
    return this.platformService.metricsByFarm(from, to);
  }

  @Get('farms')
  @ApiOperation({
    summary: 'Lister toutes les fermes de la plateforme (avec propriétaire).',
  })
  listFarms() {
    return this.farmsService.listAll();
  }

  @Post('farms')
  @ApiOperation({
    summary:
      'Provisionner une ferme : crée le compte Propriétaire puis sa ferme.',
  })
  provision(@Body() dto: ProvisionFarmDto) {
    const { owner, ...farmInput } = dto;
    return this.farmsService.provision(farmInput, owner);
  }

  @Patch('farms/:farmId')
  @ApiParam({ name: 'farmId', description: 'Identifiant de la ferme' })
  @ApiOperation({ summary: 'Modifier une ferme (détails, suspension).' })
  async updateFarm(
    @CurrentUser() user: AuthUser,
    @Param('farmId') farmId: string,
    @Body() dto: UpdateFarmDto,
  ) {
    const { active, ...fields } = dto;
    const farm = await this.farmsService.updateFarm(user, farmId, fields);
    if (active != null) {
      return this.farmsService.setFarmActive(farmId, active);
    }
    return farm;
  }

  @Get('users')
  @ApiOperation({ summary: 'Lister tous les utilisateurs de la plateforme.' })
  listUsers() {
    return this.platformService.listUsers();
  }

  @Patch('users/:userId/suspend')
  @ApiParam({ name: 'userId', description: 'Identifiant de l’utilisateur' })
  @ApiOperation({
    summary:
      'Suspendre / réactiver un utilisateur (suspended: true suspend, non suspendu pour l’administration).',
  })
  suspendUser(@Param('userId') userId: string, @Body() dto: SuspendUserDto) {
    return this.platformService.suspendUser(userId, dto.suspended);
  }

  @Get('rules')
  @ApiOperation({
    summary: 'Lister les règles du registre (moteur d’alertes).',
  })
  listRules() {
    return this.platformService.listRules();
  }

  @Patch('payment-methods/:code')
  @ApiParam({ name: 'code', description: 'CASH | MOBILE_MONEY | QR_CODE' })
  @ApiOperation({
    summary:
      'Activer / désactiver une méthode de paiement sur toute la plateforme (les espèces ne peuvent pas être désactivées).',
  })
  setPaymentMethod(
    @Param('code') code: string,
    @Body() dto: UpdatePaymentMethodDto,
  ) {
    return this.platformService.setPaymentMethodEnabled(code, dto.enabled);
  }

  @Patch('breeds/:id')
  @ApiParam({ name: 'id', description: 'Identifiant de la souche' })
  @ApiOperation({
    summary:
      'Modifier une souche (nom, type, espèce, actif) — disponible aussi au Propriétaire dans la ferme.',
  })
  updateBreed(@Param('id') id: string, @Body() dto: UpdateBreedDto) {
    return this.platformService.updateBreed(id, dto);
  }

  @Patch('protocols/:id')
  @ApiParam({ name: 'id', description: 'Identifiant du protocole sanitaire' })
  @ApiOperation({ summary: 'Modifier un protocole sanitaire (nom, éditable).' })
  updateProtocol(@Param('id') id: string, @Body() dto: UpdateProtocolDto) {
    return this.platformService.updateProtocol(id, dto);
  }
}
