import {
  Body,
  Controller,
  Get,
  Param,
  ParseUUIDPipe,
  Patch,
  Post,
  Put,
  Query,
  UploadedFile,
  UseInterceptors,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { ApiBody, ApiConsumes, ApiOperation, ApiTags } from '@nestjs/swagger';
import {
  CurrentUser,
  type AuthUser,
} from '../../../common/decorators/current-user.decorator.js';
import { Roles } from '../../../common/decorators/roles.decorator.js';
import { UserRole } from '../../../common/enums/role.enum.js';
import {
  ActivateOwnerDto,
  CreateProgrammeFarmDto,
  EnrolFarmDto,
  ImportFarmsDto,
  ListProgrammeFarmsQueryDto,
  SetFarmGpsDto,
  SetFarmInfrastructuresDto,
  SetFarmStatusDto,
  UpdateProgrammeFarmDto,
} from '../dto/programme-farm.dto.js';
import {
  FarmImportService,
  type UploadedCsvFile,
} from './farm-import.service.js';
import { ProgrammeFarmsService } from './programme-farms.service.js';

const uuid = new ParseUUIDPipe({ version: '4' });

/**
 * Farm registry of the programme (POUFA §5.1). Every route answers 404
 * « Aucun programme configuré » when `PROGRAM_CODE` is unset.
 *
 * TODO(access lot): PLATFORM_ADMIN only for now; the access module will open
 * the registry to the institutional profiles (DGE, agents techniques…) with
 * their province / farm scopes. The owner of a programme farm can already
 * read his own sheet.
 */
@ApiTags('Programme (POUFA) — registre des fermes')
@Controller('programme/farms')
export class ProgrammeFarmsController {
  constructor(
    private readonly registry: ProgrammeFarmsService,
    private readonly importer: FarmImportService,
  ) {}

  @Get()
  @Roles(UserRole.PLATFORM_ADMIN)
  @ApiOperation({
    summary:
      'Fermes du programme, filtrées (province, localité, cohorte, statut, recherche) et paginées',
  })
  list(@Query() query: ListProgrammeFarmsQueryDto) {
    return this.registry.list(query);
  }

  @Post()
  @Roles(UserRole.PLATFORM_ADMIN)
  @ApiOperation({
    summary:
      'Enregistrer une ferme du programme (code attribué automatiquement ; 409 en cas de doublon probable sauf confirmDuplicate)',
  })
  create(@CurrentUser() user: AuthUser, @Body() dto: CreateProgrammeFarmDto) {
    return this.registry.create(user, dto);
  }

  @Post('import')
  @Roles(UserRole.PLATFORM_ADMIN)
  @UseInterceptors(
    FileInterceptor('file', {
      limits: { fileSize: 5 * 1024 * 1024, files: 1 },
    }),
  )
  @ApiConsumes('multipart/form-data', 'application/json')
  @ApiBody({
    schema: {
      type: 'object',
      properties: {
        file: { type: 'string', format: 'binary' },
        dryRun: { type: 'boolean', default: true },
        confirmDuplicate: { type: 'boolean', default: false },
        rows: { type: 'array', items: { type: 'object' } },
      },
    },
  })
  @ApiOperation({
    summary:
      'Importer la liste des fermes (CSV « file » ou lignes JSON « rows » ; essai à blanc par défaut). Formats : liste POUFA (numero,nom,province — le numéro est ignoré) ou complet (nom, province, localite, exploitant, telephone, amiRef, cohorte, capacite, latitude, longitude, statut).',
  })
  import(
    @CurrentUser() user: AuthUser,
    @Body() dto: ImportFarmsDto,
    @UploadedFile() file: UploadedCsvFile | undefined,
  ) {
    return this.importer.import(user, {
      file,
      rows: dto.rows,
      dryRun: dto.dryRun,
      confirmDuplicate: dto.confirmDuplicate,
    });
  }

  @Get(':farmId')
  @Roles(UserRole.PLATFORM_ADMIN, UserRole.PROPRIETAIRE)
  @ApiOperation({
    summary:
      "Fiche d'une ferme du programme (administrateur, ou propriétaire de la ferme)",
  })
  sheet(@CurrentUser() user: AuthUser, @Param('farmId', uuid) farmId: string) {
    return this.registry.sheet(user, farmId);
  }

  @Patch(':farmId')
  @Roles(UserRole.PLATFORM_ADMIN)
  @ApiOperation({
    summary:
      'Modifier la fiche (le code et le programme ne changent jamais ; GPS et statut ont leurs propres routes)',
  })
  update(
    @CurrentUser() user: AuthUser,
    @Param('farmId', uuid) farmId: string,
    @Body() dto: UpdateProgrammeFarmDto,
  ) {
    return this.registry.update(user, farmId, dto);
  }

  @Post(':farmId/status')
  @Roles(UserRole.PLATFORM_ADMIN)
  @ApiOperation({
    summary:
      'Changer le statut (historisé ; la famille SUSPENDUE désactive la ferme)',
  })
  setStatus(
    @CurrentUser() user: AuthUser,
    @Param('farmId', uuid) farmId: string,
    @Body() dto: SetFarmStatusDto,
  ) {
    return this.registry.setStatus(user, farmId, dto);
  }

  @Get(':farmId/status-history')
  @Roles(UserRole.PLATFORM_ADMIN)
  @ApiOperation({
    summary: 'Historique des statuts, le plus récent en premier',
  })
  statusHistory(@Param('farmId', uuid) farmId: string) {
    return this.registry.statusHistory(farmId);
  }

  @Put(':farmId/infrastructures')
  @Roles(UserRole.PLATFORM_ADMIN)
  @ApiOperation({
    summary:
      'Remplacer les infrastructures de la ferme (liste INFRASTRUCTURE : nombre, surface)',
  })
  setInfrastructures(
    @Param('farmId', uuid) farmId: string,
    @Body() dto: SetFarmInfrastructuresDto,
  ) {
    return this.registry.setInfrastructures(farmId, dto.items);
  }

  @Put(':farmId/gps')
  @Roles(UserRole.PLATFORM_ADMIN)
  @ApiOperation({
    summary:
      'Relevé ou correction GPS (le point précédent reste dans l’historique ; contrôle de la province en avertissement)',
  })
  setGps(
    @CurrentUser() user: AuthUser,
    @Param('farmId', uuid) farmId: string,
    @Body() dto: SetFarmGpsDto,
  ) {
    return this.registry.setGps(user, farmId, dto);
  }

  @Get(':farmId/gps-history')
  @Roles(UserRole.PLATFORM_ADMIN)
  @ApiOperation({ summary: 'Historique des relevés GPS' })
  gpsHistory(@Param('farmId', uuid) farmId: string) {
    return this.registry.gpsHistory(farmId);
  }

  @Post(':farmId/activate-owner')
  @Roles(UserRole.PLATFORM_ADMIN)
  @ApiOperation({
    summary:
      "Créer le compte Propriétaire de l'exploitant (code de connexion renvoyé une seule fois), ou rattacher la ferme à son compte existant (linkExistingUser)",
  })
  activateOwner(
    @Param('farmId', uuid) farmId: string,
    @Body() dto: ActivateOwnerDto,
  ) {
    return this.registry.activateOwner(farmId, dto);
  }

  @Post(':farmId/enrol')
  @Roles(UserRole.PLATFORM_ADMIN)
  @ApiOperation({
    summary:
      'Inscrire au programme une ferme Fermia existante (elle garde son propriétaire et ses données)',
  })
  enrol(
    @CurrentUser() user: AuthUser,
    @Param('farmId', uuid) farmId: string,
    @Body() dto: EnrolFarmDto,
  ) {
    return this.registry.enrol(user, farmId, dto);
  }
}
