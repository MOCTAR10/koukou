import {
  Body,
  Controller,
  Get,
  HttpCode,
  Post,
  Query,
  Res,
  StreamableFile,
} from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import type { Response } from 'express';
import {
  AuditExport,
  AuditRead,
} from '../../common/decorators/audit.decorator.js';
import { Roles } from '../../common/decorators/roles.decorator.js';
import { UserRole } from '../../common/enums/role.enum.js';
import { CsvService } from '../../common/services/csv.service.js';
import { AuditQueryService } from './audit-query.service.js';
import { AuditSealService } from './audit-seal.service.js';
import {
  AuditEventsQueryDto,
  AuditRowChangesQueryDto,
  AuditSealsQueryDto,
  VerifySealsDto,
} from './dto/audit-query.dto.js';
import { Action, Domain } from '../../common/decorators/domain.decorator.js';

/**
 * Consultation of the audit journal. Every route here is itself journaled.
 * Platform admin and the ANINF audit profile (AUDIT domain; an AUDIT scope
 * reaches nothing else), enforced by ProgramAccessGuard.
 */
@ApiTags('Journal d’audit')
@ApiBearerAuth()
@Domain('AUDIT')
@Controller('audit')
@Roles(UserRole.PLATFORM_ADMIN)
export class AuditController {
  constructor(
    private readonly query: AuditQueryService,
    private readonly seals: AuditSealService,
    private readonly csv: CsvService,
  ) {}

  @Get('events')
  @AuditRead('Consultation du journal d’audit')
  @ApiOperation({
    summary:
      'Journal des actions (écritures, consultations sensibles, exports, connexions), du plus récent au plus ancien.',
  })
  events(@Query() query: AuditEventsQueryDto) {
    return this.query.listEvents(query);
  }

  @Get('events/export')
  @AuditExport('Export CSV du journal d’audit')
  @ApiOperation({
    summary: 'Export CSV du journal des actions (mêmes filtres).',
  })
  async exportEvents(
    @Query() query: AuditEventsQueryDto,
    @Res({ passthrough: true }) res: Response,
  ) {
    const { items, truncated } = await this.query.exportEvents(query);
    const rows = items.map((e) => ({
      id: e.id,
      occurredAt: e.occurredAt.toISOString(),
      requestId: e.requestId,
      action: e.action,
      actorUserId: e.actorUserId,
      actorName: e.actorName,
      actorRole: e.actorRole,
      farmId: e.farmId,
      method: e.method,
      route: e.route,
      params: e.params ? JSON.stringify(e.params) : null,
      statusCode: e.statusCode,
      ip: e.ip,
      userAgent: e.userAgent,
      offlineOpId: e.offlineOpId,
      summary: e.summary == null ? null : JSON.stringify(e.summary),
      errorMessage: e.errorMessage,
    }));
    const buffer = this.csv.toCsvObject(
      [
        ['id', 'N°'],
        ['occurredAt', 'Date (UTC)'],
        ['requestId', 'Requête'],
        ['action', 'Action'],
        ['actorUserId', 'Utilisateur'],
        ['actorName', 'Nom'],
        ['actorRole', 'Rôle'],
        ['farmId', 'Ferme'],
        ['method', 'Méthode'],
        ['route', 'Route'],
        ['params', 'Paramètres'],
        ['statusCode', 'Statut'],
        ['ip', 'Adresse IP'],
        ['userAgent', 'Appareil'],
        ['offlineOpId', 'Opération hors ligne'],
        ['summary', 'Résumé'],
        ['errorMessage', 'Erreur'],
      ],
      rows,
    );
    res.set({
      'Content-Type': 'text/csv; charset=utf-8',
      'Content-Disposition': `attachment; filename="journal-audit-${query.from ?? 'debut'}-${query.to ?? 'maintenant'}.csv"`,
      'X-Audit-Truncated': truncated ? 'true' : 'false',
    });
    return new StreamableFile(buffer);
  }

  @Get('row-changes')
  @AuditRead('Consultation de l’historique des données')
  @ApiOperation({
    summary: 'Historique des données (ligne avant / après) des tables clés.',
  })
  rowChanges(@Query() query: AuditRowChangesQueryDto) {
    return this.query.listRowChanges(query);
  }

  @Get('seals')
  @AuditRead('Consultation des sceaux du journal')
  @ApiOperation({ summary: 'Sceaux quotidiens du journal (du plus récent).' })
  listSeals(@Query() query: AuditSealsQueryDto) {
    return this.seals.listSeals(query.from, query.to);
  }

  @Post('seals/verify')
  @Action('CONSULTER')
  @HttpCode(200)
  @AuditRead('Vérification des sceaux du journal')
  @ApiOperation({
    summary:
      'Recalcule les sceaux (tous, ou la période donnée) et signale la première incohérence.',
  })
  verify(@Body() dto: VerifySealsDto) {
    return this.seals.verify(dto.from, dto.to);
  }
}
