import {
  Body,
  Controller,
  ForbiddenException,
  Get,
  Param,
  Patch,
  Post,
  Query,
} from '@nestjs/common';
import { ApiOperation, ApiQuery, ApiTags } from '@nestjs/swagger';
import {
  IsBoolean,
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
import { Action, Domain } from '../../common/decorators/domain.decorator.js';
import { AccessScopeKind } from '../../common/enums/access-scope-kind.enum.js';
import { ScopeResolver } from '../access/scope-resolver.service.js';

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

/** POUFA lot A2 divers (F8): edit of a shared (reference) breed. */
class UpdateReferenceBreedDto {
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

@ApiTags('Souches (Breed)')
@Domain('TECHNIQUE')
@Controller('breeds')
export class BreedsController {
  constructor(
    private readonly breedsService: BreedsService,
    private readonly farmsService: FarmsService,
    private readonly scope: ScopeResolver,
  ) {}

  // POUFA lot A2 divers (F8): the shared breed reference is managed by the
  // matrix right PARAMETRES:CREER on a national (ALL) scope, DGE by default;
  // no longer by the platform admin.
  private async assertReferenceManager(user: AuthUser): Promise<void> {
    const access = await this.scope.requireAccess(user);
    if (access.scopeKind !== AccessScopeKind.ALL) {
      throw new ForbiddenException(
        'Le référentiel des races est national : un périmètre « tout le programme » est requis.',
      );
    }
  }

  @Post('reference')
  @Domain('PARAMETRES')
  @Action('CREER')
  @Roles(UserRole.INSTITUTION)
  @ApiOperation({ summary: 'Ajouter une race au référentiel commun (profil habilité)' })
  async createReference(@CurrentUser() user: AuthUser, @Body() dto: CreateBreedDto) {
    await this.assertReferenceManager(user);
    return this.breedsService.createCustom(null, dto.name, dto.type, dto.species, dto.refCode);
  }

  @Patch('reference/:id')
  @Domain('PARAMETRES')
  @Action('CREER')
  @Roles(UserRole.INSTITUTION)
  @ApiOperation({ summary: 'Modifier une race du référentiel commun (profil habilité)' })
  async updateReference(
    @CurrentUser() user: AuthUser,
    @Param('id') id: string,
    @Body() dto: UpdateReferenceBreedDto,
  ) {
    await this.assertReferenceManager(user);
    return this.breedsService.updateShared(id, dto);
  }

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
