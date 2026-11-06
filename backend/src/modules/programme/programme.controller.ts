import {
  BadRequestException,
  Body,
  Controller,
  ForbiddenException,
  Get,
  Param,
  ParseEnumPipe,
  ParseUUIDPipe,
  Patch,
  Post,
  Put,
  Query,
} from '@nestjs/common';
import { ApiOperation, ApiParam, ApiQuery, ApiTags } from '@nestjs/swagger';
import {
  CurrentUser,
  type AuthUser,
} from '../../common/decorators/current-user.decorator.js';
import { Roles } from '../../common/decorators/roles.decorator.js';
import { ProgramListType } from '../../common/enums/program-list-type.enum.js';
import { UserRole } from '../../common/enums/role.enum.js';
import { GeoCheckDto, SetProvinceGeometryDto } from './dto/geo.dto.js';
import { CreateLocaliteDto, UpdateLocaliteDto } from './dto/localite.dto.js';
import { ParametersAtQueryDto, SetParameterDto } from './dto/parameter.dto.js';
import { CreateRefItemDto, UpdateRefItemDto } from './dto/ref-item.dto.js';
import { GeoService } from './geo.service.js';
import { ParametersService } from './parameters.service.js';
import { ProgrammeService } from './programme.service.js';
import { RefListsService } from './ref-lists.service.js';
import { TerritoryService } from './territory.service.js';
import { Action, Domain } from '../../common/decorators/domain.decorator.js';

const listTypePipe = new ParseEnumPipe(ProgramListType, {
  exceptionFactory: () =>
    new BadRequestException(
      `Type de liste inconnu (${Object.values(ProgramListType).join(', ')}).`,
    ),
});

/**
 * Programme layer (registry, territories, lists, versioned parameters) of
 * the programme named by `PROGRAM_CODE`.
 *
 * Platform admin, or an institutional account whose profile grants the
 * route's domain (PARAMETRES; lists, localités and boundaries:
 * ADMINISTRATION; GPS check: REGISTRE). A parameter is changed by its owner
 * profile only (`ParametersService.set`).
 */
@ApiTags('Programme (POUFA)')
@Domain('PARAMETRES')
@Controller('programme')
export class ProgrammeController {
  constructor(
    private readonly programme: ProgrammeService,
    private readonly territory: TerritoryService,
    private readonly lists: RefListsService,
    private readonly parameters: ParametersService,
    private readonly geo: GeoService,
  ) {}

  // ----- Reads -----

  @Get()
  @Roles(UserRole.PLATFORM_ADMIN, UserRole.PROPRIETAIRE, UserRole.ELEVEUR)
  @ApiOperation({ summary: 'Programme configuré sur cette instance' })
  async current() {
    const p = await this.programme.current();
    return {
      id: p.id,
      code: p.code,
      name: p.name,
      startDate: p.startDate,
      endDate: p.endDate,
      settings: p.settings,
    };
  }

  @Get('provinces')
  @Roles(UserRole.PLATFORM_ADMIN, UserRole.PROPRIETAIRE, UserRole.ELEVEUR)
  @ApiOperation({
    summary:
      'Provinces et localités du programme (sans les contours ; ?all=true : localités désactivées incluses, administrateur)',
  })
  @ApiQuery({ name: 'all', required: false, type: Boolean })
  provinces(@CurrentUser() user: AuthUser, @Query('all') all?: string) {
    return this.territory.listProvinces(this.includeInactive(user, all));
  }

  @Get('lists/:listType')
  @Roles(UserRole.PLATFORM_ADMIN, UserRole.PROPRIETAIRE, UserRole.ELEVEUR)
  @ApiOperation({
    summary:
      "Éléments actifs d'une liste paramétrable (?all=true : éléments désactivés inclus, administrateur)",
  })
  @ApiParam({ name: 'listType', enum: ProgramListType })
  @ApiQuery({ name: 'all', required: false, type: Boolean })
  list(
    @CurrentUser() user: AuthUser,
    @Param('listType', listTypePipe) listType: ProgramListType,
    @Query('all') all?: string,
  ) {
    return this.lists.list(listType, this.includeInactive(user, all));
  }

  @Get('parameters')
  @Roles(UserRole.PLATFORM_ADMIN, UserRole.PROPRIETAIRE, UserRole.ELEVEUR)
  @ApiOperation({
    summary:
      'Paramètres du programme en vigueur (maintenant, ou à la date ?at=)',
  })
  parametersInForce(@Query() query: ParametersAtQueryDto) {
    return this.parameters.getAll(query.at ? new Date(query.at) : undefined);
  }

  // ----- Administration -----

  @Post('lists/:listType')
  @Domain('ADMINISTRATION')
  @Action('ADMINISTRER')
  @Roles(UserRole.PLATFORM_ADMIN)
  @ApiOperation({ summary: 'Ajouter un élément à une liste paramétrable' })
  @ApiParam({ name: 'listType', enum: ProgramListType })
  createItem(
    @Param('listType', listTypePipe) listType: ProgramListType,
    @Body() dto: CreateRefItemDto,
  ) {
    return this.lists.create(listType, dto);
  }

  @Patch('lists/:listType/:code')
  @Domain('ADMINISTRATION')
  @Action('ADMINISTRER')
  @Roles(UserRole.PLATFORM_ADMIN)
  @ApiOperation({
    summary:
      'Renommer, réordonner, activer ou désactiver un élément de liste (le code et la famille ne changent jamais)',
  })
  @ApiParam({ name: 'listType', enum: ProgramListType })
  updateItem(
    @Param('listType', listTypePipe) listType: ProgramListType,
    @Param('code') code: string,
    @Body() dto: UpdateRefItemDto,
  ) {
    return this.lists.update(listType, code, dto);
  }

  @Post('localites')
  @Domain('ADMINISTRATION')
  @Action('ADMINISTRER')
  @Roles(UserRole.PLATFORM_ADMIN)
  @ApiOperation({ summary: 'Ajouter une localité à une province' })
  createLocalite(@Body() dto: CreateLocaliteDto) {
    return this.territory.createLocalite(dto);
  }

  @Patch('localites/:id')
  @Domain('ADMINISTRATION')
  @Action('ADMINISTRER')
  @Roles(UserRole.PLATFORM_ADMIN)
  @ApiOperation({
    summary: 'Modifier une localité (nom, type, chef-lieu, ordre, activation)',
  })
  updateLocalite(
    @Param('id', new ParseUUIDPipe({ version: '4' })) id: string,
    @Body() dto: UpdateLocaliteDto,
  ) {
    return this.territory.updateLocalite(id, dto);
  }

  @Get('parameters/:key/history')
  @Roles(UserRole.PLATFORM_ADMIN)
  @ApiOperation({ summary: "Historique des versions d'un paramètre" })
  history(@Param('key') key: string) {
    return this.parameters.history(key);
  }

  @Post('parameters/:key')
  @Action('MODIFIER')
  @Roles(UserRole.PLATFORM_ADMIN)
  @ApiOperation({
    summary:
      "Nouvelle version d'un paramètre (date d'effet maintenant ou future ; une formule est vérifiée avec tout le jeu d'indicateurs)",
  })
  setParameter(
    @CurrentUser() user: AuthUser,
    @Param('key') key: string,
    @Body() dto: SetParameterDto,
  ) {
    return this.parameters.set(
      key,
      dto.value,
      user,
      dto.reason,
      dto.validFrom ? new Date(dto.validFrom) : undefined,
    );
  }

  @Put('provinces/:code/geometry')
  @Domain('ADMINISTRATION')
  @Action('ADMINISTRER')
  @Roles(UserRole.PLATFORM_ADMIN)
  @ApiOperation({
    summary:
      "Charger le contour d'une province (GeoJSON Polygon ou MultiPolygon)",
  })
  setGeometry(
    @Param('code') code: string,
    @Body() dto: SetProvinceGeometryDto,
  ) {
    return this.geo.setGeometry(code, dto.geometry);
  }

  @Post('geo/check')
  @Domain('REGISTRE')
  @Action('CONSULTER')
  @Roles(UserRole.PLATFORM_ADMIN)
  @ApiOperation({
    summary:
      "Vérifier qu'un point GPS est dans sa province (avertissement seulement, jamais bloquant)",
  })
  geoCheck(@Body() dto: GeoCheckDto) {
    return this.geo.checkPoint(dto.latitude, dto.longitude, dto.provinceCode);
  }

  private includeInactive(user: AuthUser, all?: string): boolean {
    if (all !== 'true') return false;
    if (user.role !== UserRole.PLATFORM_ADMIN) {
      throw new ForbiddenException(
        "Les éléments désactivés sont réservés à l'administrateur.",
      );
    }
    return true;
  }
}
