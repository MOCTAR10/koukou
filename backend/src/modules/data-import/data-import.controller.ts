import {
  Body,
  Controller,
  Get,
  Param,
  ParseIntPipe,
  ParseUUIDPipe,
  Patch,
  Post,
  Put,
  Query,
  Res,
  StreamableFile,
  UploadedFile,
  UseInterceptors,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { ApiBody, ApiConsumes, ApiOperation, ApiTags } from '@nestjs/swagger';
import type { Response } from 'express';
import { AuditExport } from '../../common/decorators/audit.decorator.js';
import {
  CurrentUser,
  type AuthUser,
} from '../../common/decorators/current-user.decorator.js';
import { Action, Domain } from '../../common/decorators/domain.decorator.js';
import { Roles } from '../../common/decorators/roles.decorator.js';
import { ImportJobType } from '../../common/enums/import-job.enum.js';
import { UserRole } from '../../common/enums/role.enum.js';
import type { UploadedCsvFile } from '../programme/farms/farm-import.service.js';
import {
  CorrectImportRowDto,
  DepositImportDto,
  ImportRowsQueryDto,
  ImportSettingsDto,
  ListImportsQueryDto,
  RejectImportDto,
  ValidateImportDto,
} from './dto/import-job.dto.js';
import { ImportJobsService } from './import-jobs.service.js';

const uuid = new ParseUUIDPipe({ version: '4' });

/**
 * Data recovery (« reprise des données », CDC §9 deliverable 3, feature 31):
 * AMI sheets and historical bands, deposited as CSV, controlled in staging,
 * dry run, validated, then integrated; recovery report in PDF for the DGE.
 *
 * Domain REGISTRE (the programme's records): deposit, mapping, corrections,
 * dry run and integration need CREER/MODIFIER, the validation VALIDER (the
 * DGE profile by default). Institutional accounts: national scope only.
 */
@ApiTags('Programme (POUFA) — reprise des données')
@Domain('REGISTRE')
@Controller('programme/imports')
export class DataImportController {
  constructor(private readonly jobs: ImportJobsService) {}

  @Get('templates')
  @Roles(UserRole.PLATFORM_ADMIN)
  @ApiOperation({
    summary: 'Types de reprise, champs attendus et modèles CSV disponibles',
  })
  templates() {
    return this.jobs.templates();
  }

  @Get('templates/:type')
  @Roles(UserRole.PLATFORM_ADMIN)
  @AuditExport('Modèle CSV de reprise des données')
  @ApiOperation({
    summary: 'Télécharger le modèle CSV (en-têtes + une ligne d’exemple)',
  })
  template(
    @Param('type') type: string,
    @Res({ passthrough: true }) res: Response,
  ) {
    const { fileName, buffer } = this.jobs.template(type);
    res.set({
      'Content-Type': 'text/csv; charset=utf-8',
      'Content-Disposition': `attachment; filename="${fileName}"`,
    });
    return new StreamableFile(buffer);
  }

  @Post()
  @Roles(UserRole.PLATFORM_ADMIN)
  @UseInterceptors(
    FileInterceptor('file', {
      limits: { fileSize: 5 * 1024 * 1024, files: 1 },
    }),
  )
  @ApiConsumes('multipart/form-data')
  @ApiBody({
    schema: {
      type: 'object',
      required: ['file', 'type'],
      properties: {
        file: { type: 'string', format: 'binary' },
        type: { type: 'string', enum: Object.values(ImportJobType) },
        note: { type: 'string' },
        confirmDuplicate: { type: 'boolean', default: false },
        mapping: {
          type: 'string',
          description: 'JSON : en-tête → champ (null = ignorée)',
        },
      },
    },
  })
  @ApiOperation({
    summary:
      'Déposer un fichier CSV (, ou ; ; UTF-8 ou Latin-1) : analyse en zone de transit puis contrôles ligne à ligne',
  })
  deposit(
    @CurrentUser() user: AuthUser,
    @Body() dto: DepositImportDto,
    @UploadedFile() file: UploadedCsvFile | undefined,
  ) {
    return this.jobs.deposit(user, file, dto);
  }

  @Get()
  @Roles(UserRole.PLATFORM_ADMIN)
  @ApiOperation({
    summary: 'Imports de reprise, du plus récent au plus ancien',
  })
  list(@CurrentUser() user: AuthUser, @Query() query: ListImportsQueryDto) {
    return this.jobs.list(user, query);
  }

  @Get(':id')
  @Roles(UserRole.PLATFORM_ADMIN)
  @ApiOperation({
    summary:
      'Un import : statut, correspondance des colonnes, compteurs, étapes possibles',
  })
  get(@CurrentUser() user: AuthUser, @Param('id', uuid) id: string) {
    return this.jobs.get(user, id);
  }

  @Get(':id/rows')
  @Roles(UserRole.PLATFORM_ADMIN)
  @ApiOperation({
    summary:
      'Lignes en zone de transit (brut, valeurs, erreurs, résultat), paginées',
  })
  rows(
    @CurrentUser() user: AuthUser,
    @Param('id', uuid) id: string,
    @Query() query: ImportRowsQueryDto,
  ) {
    return this.jobs.rows(user, id, query);
  }

  @Put(':id/settings')
  @Roles(UserRole.PLATFORM_ADMIN)
  @ApiOperation({
    summary:
      'Corriger la correspondance des colonnes ou l’option des doublons : nouvelle analyse et nouveaux contrôles',
  })
  settings(
    @CurrentUser() user: AuthUser,
    @Param('id', uuid) id: string,
    @Body() dto: ImportSettingsDto,
  ) {
    return this.jobs.settings(user, id, dto);
  }

  @Patch(':id/rows/:line')
  @Roles(UserRole.PLATFORM_ADMIN)
  @ApiOperation({
    summary:
      'Correction manuelle d’une ligne (valeurs, exclusion ou rétablissement ; motif obligatoire) puis nouveaux contrôles',
  })
  correct(
    @CurrentUser() user: AuthUser,
    @Param('id', uuid) id: string,
    @Param('line', ParseIntPipe) line: number,
    @Body() dto: CorrectImportRowDto,
  ) {
    return this.jobs.correctRow(user, id, line, dto);
  }

  @Post(':id/dry-run')
  @Roles(UserRole.PLATFORM_ADMIN)
  @ApiOperation({
    summary:
      'Essai à blanc : contrôles à jour puis intégration complète annulée à la fin (rapport de ce que ferait l’intégration)',
  })
  dryRun(@CurrentUser() user: AuthUser, @Param('id', uuid) id: string) {
    return this.jobs.dryRun(user, id);
  }

  @Post(':id/validate')
  @Roles(UserRole.PLATFORM_ADMIN)
  @Action('VALIDER')
  @ApiOperation({
    summary: 'Valider l’essai à blanc (profil habilité : REGISTRE / VALIDER)',
  })
  validate(
    @CurrentUser() user: AuthUser,
    @Param('id', uuid) id: string,
    @Body() dto: ValidateImportDto,
  ) {
    return this.jobs.validate(user, id, dto);
  }

  @Post(':id/integrate')
  @Roles(UserRole.PLATFORM_ADMIN)
  @ApiOperation({
    summary:
      'Intégrer un import validé, en une transaction (lignes refusées signalées avec leur motif)',
  })
  integrate(@CurrentUser() user: AuthUser, @Param('id', uuid) id: string) {
    return this.jobs.integrate(user, id);
  }

  @Post(':id/reject')
  @Roles(UserRole.PLATFORM_ADMIN)
  @Action('MODIFIER')
  @ApiOperation({
    summary: 'Rejeter un import non intégré (motif obligatoire)',
  })
  reject(
    @CurrentUser() user: AuthUser,
    @Param('id', uuid) id: string,
    @Body() dto: RejectImportDto,
  ) {
    return this.jobs.reject(user, id, dto);
  }

  @Get(':id/report')
  @Roles(UserRole.PLATFORM_ADMIN)
  @ApiOperation({
    summary:
      'Rapport de reprise (JSON) : lignes lues, intégrées, rejetées avec motif, corrections, empreinte',
  })
  report(@CurrentUser() user: AuthUser, @Param('id', uuid) id: string) {
    return this.jobs.report(user, id);
  }

  @Get(':id/report/pdf')
  @Roles(UserRole.PLATFORM_ADMIN)
  @AuditExport('Rapport de reprise des données (PDF)')
  @ApiOperation({
    summary: 'Rapport de reprise en PDF, avec le visa de la DGE',
  })
  async reportPdf(
    @CurrentUser() user: AuthUser,
    @Param('id', uuid) id: string,
    @Res({ passthrough: true }) res: Response,
  ) {
    const { report, buffer } = await this.jobs.reportPdf(user, id);
    res.set({
      'Content-Type': 'application/pdf',
      'Content-Disposition': `inline; filename="rapport-reprise-${id.slice(0, 8)}.pdf"`,
      'X-Report-Fingerprint': report.fingerprint,
    });
    return new StreamableFile(buffer);
  }

  @Get(':id/report/csv')
  @Roles(UserRole.PLATFORM_ADMIN)
  @AuditExport('Rapport de reprise des données (CSV ligne à ligne)')
  @ApiOperation({ summary: 'Rapport de reprise ligne à ligne (CSV)' })
  async reportCsv(
    @CurrentUser() user: AuthUser,
    @Param('id', uuid) id: string,
    @Res({ passthrough: true }) res: Response,
  ) {
    const { report, buffer } = await this.jobs.reportCsv(user, id);
    res.set({
      'Content-Type': 'text/csv; charset=utf-8',
      'Content-Disposition': `attachment; filename="rapport-reprise-${id.slice(0, 8)}.csv"`,
      'X-Report-Fingerprint': report.fingerprint,
    });
    return new StreamableFile(buffer);
  }
}
