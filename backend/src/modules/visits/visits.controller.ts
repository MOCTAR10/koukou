import {
  Body,
  Controller,
  Get,
  Param,
  ParseUUIDPipe,
  Post,
  Query,
  Res,
  StreamableFile,
  UploadedFile,
  UseInterceptors,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { ApiBody, ApiConsumes, ApiOperation, ApiTags } from '@nestjs/swagger';
import type { Response } from 'express';
import type { UploadedImageFile } from '../farms/farms.service.js';
import { AuditThirdPartyRead } from '../../common/decorators/audit.decorator.js';
import { CurrentUser } from '../../common/decorators/current-user.decorator.js';
import type { AuthUser } from '../../common/decorators/current-user.decorator.js';
import {
  Action,
  AlsoGrantedBy,
  Domain,
} from '../../common/decorators/domain.decorator.js';
import { Roles } from '../../common/decorators/roles.decorator.js';
import { UserRole } from '../../common/enums/role.enum.js';
import {
  CreateVisitDto,
  ListProgrammeVisitsQueryDto,
} from './dto/visit.dto.js';
import { VISIT_PHOTO_MAX_BYTES, VisitsService } from './visits.service.js';

/**
 * Technical visits and biosecurity controls (CDC n° 45 and n° 27), farm side.
 * Rights come from the matrix, never from a profile code: writing is
 * TECHNIQUE:VALIDER (the agent technique by default), reading is
 * TECHNIQUE:CONSULTER or SANITAIRE:CONSULTER; the farm's own owner and members
 * read their visits. A visit is never edited nor deleted: a correction is a
 * new visit.
 */
@ApiTags('Visites techniques et biosécurité')
@Domain('TECHNIQUE')
@Controller('farms/:farmId/visits')
export class FarmVisitsController {
  constructor(private readonly visits: VisitsService) {}

  @Get('grid')
  @Roles(UserRole.PLATFORM_ADMIN, UserRole.PROPRIETAIRE, UserRole.ELEVEUR)
  @AlsoGrantedBy(['SANITAIRE', 'CONSULTER'])
  @ApiOperation({
    summary:
      'Grille de biosécurité en vigueur (critères actifs et poids) et seuils des classes A/B',
  })
  grid(@CurrentUser() user: AuthUser, @Param('farmId', ParseUUIDPipe) farmId: string) {
    return this.visits.grid(user, farmId);
  }

  @Get()
  @AuditThirdPartyRead('Visites techniques d’une ferme')
  @Roles(UserRole.PLATFORM_ADMIN, UserRole.PROPRIETAIRE, UserRole.ELEVEUR)
  @AlsoGrantedBy(['SANITAIRE', 'CONSULTER'])
  @ApiOperation({ summary: 'Visites de la ferme (les plus récentes d’abord)' })
  list(@CurrentUser() user: AuthUser, @Param('farmId', ParseUUIDPipe) farmId: string) {
    return this.visits.listForFarm(user, farmId);
  }

  @Get(':id')
  @AuditThirdPartyRead('Détail d’une visite technique')
  @Roles(UserRole.PLATFORM_ADMIN, UserRole.PROPRIETAIRE, UserRole.ELEVEUR)
  @AlsoGrantedBy(['SANITAIRE', 'CONSULTER'])
  @ApiOperation({ summary: 'Une visite avec sa grille de biosécurité' })
  get(
    @CurrentUser() user: AuthUser,
    @Param('farmId', ParseUUIDPipe) farmId: string,
    @Param('id', ParseUUIDPipe) id: string,
  ) {
    return this.visits.getForFarm(user, farmId, id);
  }

  @Post()
  // TECHNIQUE:VALIDER, not CREER: CREER maps to the farm code `saisie:creer`
  // (daily entries) and an agent must never hold it.
  @Action('VALIDER')
  @Roles(UserRole.PLATFORM_ADMIN)
  @ApiOperation({
    summary:
      'Enregistrer une visite (observations, recommandations, GPS, grille de biosécurité, visa d’une période de la bande) ; idempotencyKey pour le hors ligne',
  })
  create(
    @CurrentUser() user: AuthUser,
    @Param('farmId', ParseUUIDPipe) farmId: string,
    @Body() dto: CreateVisitDto,
  ) {
    return this.visits.create(user, farmId, dto);
  }

  @Post(':id/photos')
  @Action('VALIDER')
  @Roles(UserRole.PLATFORM_ADMIN)
  // Refused while streaming, before multer buffers more than the cap.
  @UseInterceptors(
    FileInterceptor('file', {
      limits: { fileSize: VISIT_PHOTO_MAX_BYTES, files: 1 },
    }),
  )
  @ApiConsumes('multipart/form-data')
  @ApiBody({
    schema: {
      type: 'object',
      properties: { file: { type: 'string', format: 'binary' } },
      required: ['file'],
    },
  })
  @ApiOperation({
    summary:
      'Ajouter une photo à une visite (PNG/JPEG/WEBP, 5 Mo, 8 par visite), par l’agent qui l’a enregistrée. Multipart « file », après le texte.',
  })
  addPhoto(
    @CurrentUser() user: AuthUser,
    @Param('farmId', ParseUUIDPipe) farmId: string,
    @Param('id', ParseUUIDPipe) id: string,
    @UploadedFile() file: UploadedImageFile | undefined,
  ) {
    return this.visits.addPhoto(user, farmId, id, file);
  }

  @Get(':id/photos/:photoId')
  @AuditThirdPartyRead('Photo d’une visite technique')
  @Roles(UserRole.PLATFORM_ADMIN, UserRole.PROPRIETAIRE, UserRole.ELEVEUR)
  @AlsoGrantedBy(['SANITAIRE', 'CONSULTER'])
  @ApiOperation({ summary: 'Télécharger une photo de visite' })
  async photo(
    @CurrentUser() user: AuthUser,
    @Param('farmId', ParseUUIDPipe) farmId: string,
    @Param('id', ParseUUIDPipe) id: string,
    @Param('photoId', ParseUUIDPipe) photoId: string,
    @Res({ passthrough: true }) res: Response,
  ): Promise<StreamableFile> {
    const file = await this.visits.photoFile(user, farmId, id, photoId);
    res.set({
      'Content-Type': file.mimeType,
      'Content-Disposition': `inline; filename="${file.fileName}"`,
      'Cache-Control': 'private, no-store',
    });
    return new StreamableFile(file.buffer);
  }
}

/** Programme-level view of the visits, filtered in SQL by the caller's scope. */
@ApiTags('Visites techniques et biosécurité')
@Domain('TECHNIQUE')
@Controller('programme/visits')
export class ProgrammeVisitsController {
  constructor(private readonly visits: VisitsService) {}

  @Get()
  @AuditThirdPartyRead('Visites techniques du programme (classement de biosécurité)')
  @Roles(UserRole.PLATFORM_ADMIN)
  @AlsoGrantedBy(['SANITAIRE', 'CONSULTER'])
  @ApiOperation({
    summary:
      'Visites du périmètre : par province, classe de biosécurité, type, ferme et période',
  })
  list(@CurrentUser() user: AuthUser, @Query() query: ListProgrammeVisitsQueryDto) {
    return this.visits.listProgramme(user, query);
  }
}
