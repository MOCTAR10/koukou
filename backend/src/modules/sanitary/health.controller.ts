import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  ParseUUIDPipe,
  Patch,
  Post,
  Res,
  StreamableFile,
  UploadedFile,
  UseInterceptors,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import {
  ApiBody,
  ApiConsumes,
  ApiOperation,
  ApiParam,
  ApiTags,
} from '@nestjs/swagger';
import type { Response } from 'express';
import { AuditExport, AuditThirdPartyRead } from '../../common/decorators/audit.decorator.js';
import type { UploadedImageFile } from '../farms/farms.service.js';
import { DECLARATION_PHOTO_MAX_BYTES } from './health.service.js';
import { CurrentUser } from '../../common/decorators/current-user.decorator.js';
import type { AuthUser } from '../../common/decorators/current-user.decorator.js';
import { Roles } from '../../common/decorators/roles.decorator.js';
import { Permissions } from '../../common/decorators/permissions.decorator.js';
import { UserRole } from '../../common/enums/role.enum.js';
import { HealthService } from './health.service.js';
import { CreateHealthEventDto } from './dto/create-health-event.dto.js';
import { AlsoGrantedBy, Domain } from '../../common/decorators/domain.decorator.js';

@ApiTags('Sanitaire & Prophylaxie')
@Roles(UserRole.PROPRIETAIRE, UserRole.ELEVEUR)
@Domain('SANITAIRE')
@Controller('farms/:farmId/batches/:batchId')
export class HealthController {
  constructor(private readonly healthService: HealthService) {}

  @Get('health')
  @AuditThirdPartyRead('Santé d’un lot (déclarations sanitaires)')
  @ApiOperation({
    summary:
      'Agrégat santé du lot : métriques (FCR, alvéoles/trays, aliment g/oiseau, mortalité, ponte), score santé 0-100, conseils et tendances hebdomadaires',
  })
  @ApiParam({ name: 'farmId' })
  @ApiParam({ name: 'batchId' })
  getHealth(
    @CurrentUser() user: AuthUser,
    @Param('farmId') farmId: string,
    @Param('batchId') batchId: string,
  ) {
    return this.healthService.getHealth(user, farmId, batchId);
  }

  @Get('health-events')
  @AlsoGrantedBy(['DECLARATIONS', 'CONSULTER'])
  @AuditThirdPartyRead('Déclarations sanitaires d’un lot')
  @ApiOperation({ summary: 'Chronologie des événements sanitaires du lot' })
  @ApiParam({ name: 'farmId' })
  @ApiParam({ name: 'batchId' })
  listEvents(
    @CurrentUser() user: AuthUser,
    @Param('farmId') farmId: string,
    @Param('batchId') batchId: string,
  ) {
    return this.healthService.listEvents(user, farmId, batchId);
  }

  @Post('health-events')
  // Field staff report what they see; editing and deleting stay with managers.
  @Permissions('sanitaire:gerer', 'sanitaire:signaler')
  @ApiOperation({
    summary:
      "Enregistrer un événement sanitaire (maladie, mortalité, réforme/culling, symptôme, visite vétérinaire) ; une réforme décrémente l'effectif vivant",
  })
  @ApiParam({ name: 'farmId' })
  @ApiParam({ name: 'batchId' })
  createEvent(
    @CurrentUser() user: AuthUser,
    @Param('farmId') farmId: string,
    @Param('batchId') batchId: string,
    @Body() dto: CreateHealthEventDto,
  ) {
    return this.healthService.createEvent(user, farmId, batchId, dto);
  }

  @Patch('health-events/:eventId/resolve')
  @Permissions('sanitaire:gerer')
  @ApiOperation({ summary: "Marquer un événement sanitaire comme résolu" })
  @ApiParam({ name: 'farmId' })
  @ApiParam({ name: 'batchId' })
  @ApiParam({ name: 'eventId' })
  resolveEvent(
    @CurrentUser() user: AuthUser,
    @Param('farmId') farmId: string,
    @Param('batchId') batchId: string,
    @Param('eventId') eventId: string,
  ) {
    return this.healthService.resolveEvent(user, farmId, batchId, eventId);
  }

  @Post('health-events/:eventId/photos')
  @Permissions('sanitaire:gerer', 'sanitaire:signaler')
  // Refused while streaming, before multer buffers more than the cap.
  @UseInterceptors(
    FileInterceptor('file', {
      limits: { fileSize: DECLARATION_PHOTO_MAX_BYTES, files: 1 },
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
      'Ajouter une photo à une déclaration sanitaire (PNG/JPEG/WEBP, 5 Mo, 5 par déclaration). Multipart « file », après le texte.',
  })
  @ApiParam({ name: 'farmId' })
  @ApiParam({ name: 'batchId' })
  @ApiParam({ name: 'eventId' })
  addPhoto(
    @CurrentUser() user: AuthUser,
    @Param('farmId') farmId: string,
    @Param('batchId') batchId: string,
    @Param('eventId') eventId: string,
    @UploadedFile() file: UploadedImageFile | undefined,
  ) {
    return this.healthService.addPhoto(user, farmId, batchId, eventId, file);
  }

  @Get('health-events/:eventId/photos/:photoId')
  @AlsoGrantedBy(['DECLARATIONS', 'CONSULTER'])
  @AuditThirdPartyRead('Photo d’une déclaration sanitaire')
  @AuditExport('Photo de déclaration sanitaire')
  @ApiOperation({
    summary:
      'Télécharger une photo de déclaration (la ferme et les services vétérinaires seulement)',
  })
  @ApiParam({ name: 'farmId' })
  @ApiParam({ name: 'batchId' })
  @ApiParam({ name: 'eventId' })
  @ApiParam({ name: 'photoId' })
  async photo(
    @CurrentUser() user: AuthUser,
    @Param('farmId') farmId: string,
    @Param('batchId') batchId: string,
    @Param('eventId') eventId: string,
    @Param('photoId', ParseUUIDPipe) photoId: string,
    @Res({ passthrough: true }) res: Response,
  ): Promise<StreamableFile> {
    const file = await this.healthService.photoFile(
      user,
      farmId,
      batchId,
      eventId,
      photoId,
    );
    res.set({
      'Content-Type': file.mimeType,
      'Content-Disposition': `inline; filename="${file.fileName}"`,
      'Cache-Control': 'private, no-store',
    });
    return new StreamableFile(file.buffer);
  }

  @Delete('health-events/:eventId/photos/:photoId')
  @Permissions('sanitaire:gerer')
  @ApiOperation({ summary: 'Retirer une photo d’une déclaration sanitaire' })
  @ApiParam({ name: 'farmId' })
  @ApiParam({ name: 'batchId' })
  @ApiParam({ name: 'eventId' })
  @ApiParam({ name: 'photoId' })
  deletePhoto(
    @CurrentUser() user: AuthUser,
    @Param('farmId') farmId: string,
    @Param('batchId') batchId: string,
    @Param('eventId') eventId: string,
    @Param('photoId', ParseUUIDPipe) photoId: string,
  ) {
    return this.healthService.deletePhoto(
      user,
      farmId,
      batchId,
      eventId,
      photoId,
    );
  }

  @Delete('health-events/:eventId')
  @Permissions('sanitaire:gerer')
  @ApiOperation({
    summary:
      "Supprimer un événement sanitaire ; le retrait d'une réforme réintègre l'effectif",
  })
  @ApiParam({ name: 'farmId' })
  @ApiParam({ name: 'batchId' })
  @ApiParam({ name: 'eventId' })
  deleteEvent(
    @CurrentUser() user: AuthUser,
    @Param('farmId') farmId: string,
    @Param('batchId') batchId: string,
    @Param('eventId') eventId: string,
  ) {
    return this.healthService.deleteEvent(user, farmId, batchId, eventId);
  }
}
