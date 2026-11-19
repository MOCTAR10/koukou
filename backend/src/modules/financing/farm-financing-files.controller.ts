import {
  Body,
  Controller,
  Get,
  Param,
  Post,
  Res,
  StreamableFile,
  UploadedFile,
  UseInterceptors,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { ApiConsumes, ApiOperation, ApiTags } from '@nestjs/swagger';
import type { Response } from 'express';
import { AuditExport } from '../../common/decorators/audit.decorator.js';
import {
  CurrentUser,
  type AuthUser,
} from '../../common/decorators/current-user.decorator.js';
import { Domain } from '../../common/decorators/domain.decorator.js';
import { Permissions } from '../../common/decorators/permissions.decorator.js';
import { Roles } from '../../common/decorators/roles.decorator.js';
import { UserRole } from '../../common/enums/role.enum.js';
import type { UploadedImageFile } from '../farms/farms.service.js';
import { ConsentService } from './consent.service.js';
import { UploadDocumentDto } from './dto/financing.dto.js';
import { FINANCING_FILE_MAX_BYTES } from './financing-storage.js';

function send(res: Response, file: { buffer: Buffer; mime: string; fileName: string }): StreamableFile {
  res.set({
    'Content-Type': file.mime,
    'Content-Disposition': `inline; filename*=UTF-8''${encodeURIComponent(file.fileName)}`,
    'Cache-Control': 'private, no-store',
  });
  return new StreamableFile(file.buffer);
}

/**
 * Farm-side view of the financing and the documents the farm supplies. Domain
 * TECHNIQUE on purpose: the farm's owner and managers pass as farm accounts,
 * and a technical agent acting for the farmer (delegated-entry right,
 * TECHNIQUE:CREER, `saisie:creer`) passes through its matrix and scope; the
 * service decides who may read or file (`ConsentService.farmerSide`), so the
 * bank's own profile (TECHNIQUE:CONSULTER) is refused there.
 */
@ApiTags('Financement (côté exploitant)')
@Roles(UserRole.PROPRIETAIRE, UserRole.ELEVEUR)
@Domain('TECHNIQUE')
@Controller('farms/:farmId/financing')
export class FarmFinancingFilesController {
  constructor(private readonly consents: ConsentService) {}

  @Get()
  @ApiOperation({ summary: 'Mes dossiers de financement, ma liste de pièces et mon consentement' })
  view(@CurrentUser() user: AuthUser, @Param('farmId') farmId: string) {
    return this.consents.farmerView(user, farmId);
  }

  @Get('consent-template/file')
  @AuditExport('Modèle de consentement (exploitant)')
  @ApiOperation({ summary: 'Lire le modèle de consentement actif' })
  async templateFile(
    @CurrentUser() user: AuthUser,
    @Param('farmId') farmId: string,
    @Res({ passthrough: true }) res: Response,
  ): Promise<StreamableFile> {
    return send(res, await this.consents.farmerTemplateFile(user, farmId));
  }

  @Post('files/:id/documents')
  @Permissions('saisie:creer')
  @UseInterceptors(FileInterceptor('file', { limits: { fileSize: FINANCING_FILE_MAX_BYTES, files: 1 } }))
  @ApiConsumes('multipart/form-data')
  @ApiOperation({ summary: 'Déposer une pièce demandée par la banque ; multipart « file », requirementId, issuedOn' })
  fileDocument(
    @CurrentUser() user: AuthUser,
    @Param('farmId') farmId: string,
    @Param('id') id: string,
    @Body() dto: UploadDocumentDto,
    @UploadedFile() file: UploadedImageFile | undefined,
  ) {
    return this.consents.farmerFileDocument(user, farmId, id, dto, file);
  }

  @Get('files/:id/documents/:docId/file')
  @AuditExport('Pièce d’un dossier de financement (exploitant)')
  @ApiOperation({ summary: 'Télécharger une pièce déposée du côté de la ferme' })
  async documentFile(
    @CurrentUser() user: AuthUser,
    @Param('farmId') farmId: string,
    @Param('id') id: string,
    @Param('docId') docId: string,
    @Res({ passthrough: true }) res: Response,
  ): Promise<StreamableFile> {
    return send(res, await this.consents.farmerDocumentFile(user, farmId, id, docId));
  }

  @Get('requirements/:rid/template')
  @AuditExport('Formulaire vierge d’une pièce (exploitant)')
  @ApiOperation({ summary: 'Télécharger le formulaire vierge d’une pièce à fournir' })
  async requirementTemplate(
    @CurrentUser() user: AuthUser,
    @Param('farmId') farmId: string,
    @Param('rid') rid: string,
    @Res({ passthrough: true }) res: Response,
  ): Promise<StreamableFile> {
    return send(res, await this.consents.farmerRequirementTemplate(user, farmId, rid));
  }
}
