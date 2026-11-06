import {
  Body,
  Controller,
  Get,
  Param,
  Patch,
  Post,
  Query,
  Res,
  StreamableFile,
} from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import type { Response } from 'express';
import { AuditExport } from '../../common/decorators/audit.decorator.js';
import { CurrentUser } from '../../common/decorators/current-user.decorator.js';
import type { AuthUser } from '../../common/decorators/current-user.decorator.js';
import { Action, Domain } from '../../common/decorators/domain.decorator.js';
import { Roles } from '../../common/decorators/roles.decorator.js';
import { UserRole } from '../../common/enums/role.enum.js';
import {
  GenerateReportDto,
  ReportRunsQueryDto,
  UpdateReportTemplateDto,
} from './dto/pilotage.dto.js';
import { ReportsService } from './reports.service.js';

/**
 * Scheduled PDF reports (CDC « Rapports périodiques automatiques »).
 * Templates: read with PILOTAGE:CONSULTER, tuned with PILOTAGE:ADMINISTRER
 * (or the platform admin). Runs: listed and downloaded within the reader's
 * scope (an aggregate-only account never gets a run naming farms; a farm
 * owner or member gets his bands' end-of-band reports). Every download is
 * journaled as an export.
 */
@ApiTags('Rapports du programme')
@ApiBearerAuth()
@Domain('PILOTAGE')
@Controller('pilotage/reports')
export class ReportsController {
  constructor(private readonly reports: ReportsService) {}

  @Get('templates')
  @Roles(UserRole.PLATFORM_ADMIN)
  @ApiOperation({
    summary: 'Modèles de rapports (périodicité, sections, destinataires)',
  })
  templates() {
    return this.reports.listTemplates();
  }

  @Patch('templates/:code')
  @Action('ADMINISTRER')
  @Roles(UserRole.PLATFORM_ADMIN)
  @ApiOperation({
    summary:
      'Paramétrer un modèle : libellé, périodicité, sections, destinataires, actif',
  })
  updateTemplate(
    @Param('code') code: string,
    @Body() dto: UpdateReportTemplateDto,
  ) {
    return this.reports.updateTemplate(code, dto);
  }

  @Post('templates/:code/runs')
  @Roles(UserRole.PLATFORM_ADMIN)
  @ApiOperation({
    summary:
      'Produire un rapport maintenant (période close, province ou bande) ; renvoie le rapport existant s’il a déjà été produit',
  })
  generate(
    @CurrentUser() user: AuthUser,
    @Param('code') code: string,
    @Body() dto: GenerateReportDto,
  ) {
    return this.reports.generateManual(user, code, dto);
  }

  @Get('runs')
  @Roles(UserRole.PROPRIETAIRE, UserRole.ELEVEUR, UserRole.PLATFORM_ADMIN)
  @ApiOperation({ summary: 'Rapports produits, dans le périmètre du lecteur' })
  runs(@CurrentUser() user: AuthUser, @Query() query: ReportRunsQueryDto) {
    return this.reports.listRuns(user, query);
  }

  @Get('runs/:id')
  @Roles(UserRole.PROPRIETAIRE, UserRole.ELEVEUR, UserRole.PLATFORM_ADMIN)
  @ApiOperation({
    summary: 'Un rapport (sans le PDF) : période, empreinte, destinataires',
  })
  run(@CurrentUser() user: AuthUser, @Param('id') id: string) {
    return this.reports.findRun(user, id);
  }

  @Get('runs/:id/pdf')
  @Roles(UserRole.PROPRIETAIRE, UserRole.ELEVEUR, UserRole.PLATFORM_ADMIN)
  @AuditExport('Téléchargement d’un rapport PDF du programme')
  @ApiOperation({
    summary:
      'Télécharger le PDF (empreinte SHA-256 dans l’en-tête X-Report-Sha256)',
  })
  async pdf(
    @CurrentUser() user: AuthUser,
    @Param('id') id: string,
    @Res({ passthrough: true }) res: Response,
  ) {
    const { run, pdf } = await this.reports.pdfOf(user, id);
    res.set({
      'Content-Type': 'application/pdf',
      'Content-Disposition': `attachment; filename="rapport-${run.templateCode.toLowerCase()}-${run.periodStart}.pdf"`,
      'X-Report-Sha256': run.sha256,
    });
    return new StreamableFile(pdf);
  }
}
