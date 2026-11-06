import {
  BadRequestException,
  Body,
  Controller,
  ForbiddenException,
  Get,
  Param,
  Patch,
  ParseUUIDPipe,
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
import { AuditRead } from '../../common/decorators/audit.decorator.js';
import { Roles } from '../../common/decorators/roles.decorator.js';
import { BatchType } from '../../common/enums/batch-type.enum.js';
import { Species } from '../../common/enums/species.enum.js';
import { UserRole } from '../../common/enums/role.enum.js';
import { MetricsPeriodQueryDto } from './dto/metrics-period.dto.js';
import {
  Allow,
  IsEnum,
  IsInt,
  IsNotEmpty,
  IsOptional,
  IsBoolean,
  IsString,
  Min,
} from 'class-validator';
import { FarmsService } from '../farms/farms.service.js';
import { PlatformService } from './platform.service.js';
import { Domain } from '../../common/decorators/domain.decorator.js';
import { SANITARY_SETTINGS_MESSAGE } from '../surveillance/veterinary-authority.js';

class UpdateFarmDto {
  /** Refused (400): the name changes in the registry (duplicate check). */
  @Allow()
  name?: unknown;

  @IsOptional()
  @IsString()
  @IsNotEmpty({ message: 'La commune est requise.' })
  administrativeCity?: string;

  /** Refused (400): buildings and capacity belong to the registry. */
  @Allow()
  buildingCount?: unknown;

  @Allow()
  capacityPerBuilding?: unknown;

  @Allow()
  buildingAreaM2?: unknown;

  @IsOptional()
  @IsInt({ message: 'Le poids du sac doit être un entier.' })
  @Min(1, { message: 'Le poids du sac doit être supérieur à 0.' })
  defaultSacKg?: number;

  /** Refused (400): the GPS point belongs to the registry (history, province check). */
  @Allow()
  longitude?: unknown;

  @Allow()
  latitude?: unknown;

  /** Refused (400): a farm's `active` follows its programme status. */
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

function assertPeriodOrder(from?: string, to?: string): void {
  if (from && to && from > to) {
    throw new BadRequestException(
      'Période invalide : la date de début suit la date de fin.',
    );
  }
}

@ApiTags('Administration plateforme')
@ApiBearerAuth()
@Domain('PLATEFORME')
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
  metrics(@Query() { from, to }: MetricsPeriodQueryDto) {
    assertPeriodOrder(from, to);
    return this.platformService.metrics(from, to);
  }

  @Get('metrics/by-farm')
  @AuditRead('Métriques détaillées de toutes les fermes (administration)')
  @ApiOperation({
    summary:
      'Métriques détaillées pour chaque ferme de la plateforme (cheptel, ventes, encaissés, alertes, clients).',
  })
  metricsByFarm(@Query() { from, to }: MetricsPeriodQueryDto) {
    assertPeriodOrder(from, to);
    return this.platformService.metricsByFarm(from, to);
  }

  @Get('farms')
  @AuditRead(
    'Liste de toutes les fermes et de leurs propriétaires (administration)',
  )
  @ApiOperation({
    summary: 'Lister toutes les fermes de la plateforme (avec propriétaire).',
  })
  listFarms() {
    return this.farmsService.listAll();
  }

  @Patch('farms/:farmId')
  @ApiParam({ name: 'farmId', description: 'Identifiant de la ferme' })
  @ApiOperation({
    summary:
      'Modifier une ferme (détails). Le nom passe par le registre, la suspension par le statut du programme.',
  })
  updateFarm(
    @CurrentUser() user: AuthUser,
    @Param('farmId') farmId: string,
    @Body() dto: UpdateFarmDto,
  ) {
    const { active, ...fields } = dto;
    if (active != null) {
      // Checked before any write: `active` follows the programme status.
      throw new BadRequestException(
        'Ferme du programme : la suspension passe par son statut (POST /programme/farms/:farmId/status).',
      );
    }
    return this.farmsService.updateFarm(user, farmId, fields);
  }

  @Get('users')
  @AuditRead('Liste de tous les utilisateurs (administration)')
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

  @Post('users/:userId/login-code')
  @ApiParam({ name: 'userId', description: 'Identifiant de l’utilisateur' })
  @ApiOperation({
    summary:
      'Générer un nouveau code de connexion pour un compte (exploitant, membre, agent institutionnel). Le code est renvoyé une seule fois.',
  })
  resetLoginCode(@Param('userId', new ParseUUIDPipe()) userId: string) {
    return this.platformService.resetLoginCode(userId);
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
  updateBreed(@Param('id') _id: string, @Body() _dto: UpdateBreedDto) {
    // POUFA lot A2 divers (F8): the breed reference belongs to a matrix
    // profile (PARAMETRES:CREER, DGE by default), not to the platform admin.
    throw new ForbiddenException(
      'Le référentiel des races est géré par le profil habilité (Paramètres : Créer), pas par l’administrateur plateforme.',
    );
  }

  @Patch('protocols/:id')
  @ApiParam({ name: 'id', description: 'Identifiant du protocole sanitaire' })
  @ApiOperation({
    summary:
      'Fermé (POUFA lot A2 vet) : les calendriers vaccinaux et programmes sanitaires sont tenus par les services vétérinaires (/surveillance/vaccination-calendars) ; l’administrateur plateforme les consulte seulement.',
  })
  updateProtocol(@Param('id') id: string, @Body() dto: UpdateProtocolDto) {
    // POUFA lot A2 vet: every protocol is a vets' calendar or a farm
    // programme they set (CDC « calendrier vaccinal paramétrable par les
    // services vétérinaires »): read-only for the platform admin.
    void id;
    void dto;
    throw new ForbiddenException(SANITARY_SETTINGS_MESSAGE.calendars);
  }
}
