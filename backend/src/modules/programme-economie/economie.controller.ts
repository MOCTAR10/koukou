import { Controller, Get, Query, Res, StreamableFile } from '@nestjs/common';
import { ApiOperation, ApiTags } from '@nestjs/swagger';
import type { Response } from 'express';
import {
  AuditExport,
  AuditThirdPartyRead,
} from '../../common/decorators/audit.decorator.js';
import {
  CurrentUser,
  type AuthUser,
} from '../../common/decorators/current-user.decorator.js';
import { Domain } from '../../common/decorators/domain.decorator.js';
import { Roles } from '../../common/decorators/roles.decorator.js';
import { UserRole } from '../../common/enums/role.enum.js';
import {
  EconomieSynthesisExportDto,
  EconomieSynthesisQueryDto,
} from './economie.dto.js';
import { EconomieService } from './economie.service.js';

/**
 * Programme-wide synthesis of the farms' Fermia economics (POUFA lot A
 * droits): the platform admin, or an institution with ECONOMIQUE:CONSULTER
 * (the DGE by default), within its scope. Journaled reads and exports.
 */
@ApiTags('Programme (POUFA) — synthèse économique')
@Domain('ECONOMIQUE')
@Controller('programme/economie')
export class EconomieController {
  constructor(private readonly economie: EconomieService) {}

  @Get('synthese')
  @AuditThirdPartyRead('Synthèse économique des fermes du programme')
  @Roles(UserRole.PLATFORM_ADMIN)
  @ApiOperation({
    summary:
      'Synthèse par ferme et par province : chiffre d’affaires, charges, marge, encaissé, masse salariale, aliment disponible (colonnes selon la matrice)',
  })
  synthesis(
    @CurrentUser() user: AuthUser,
    @Query() query: EconomieSynthesisQueryDto,
  ) {
    return this.economie.synthesis(user, query);
  }

  @Get('synthese/export')
  @AuditExport('Synthèse économique du programme (CSV ou Excel)')
  @Roles(UserRole.PLATFORM_ADMIN)
  @ApiOperation({ summary: 'Export CSV ou Excel de la synthèse économique' })
  async export(
    @CurrentUser() user: AuthUser,
    @Query() query: EconomieSynthesisExportDto,
    @Res({ passthrough: true }) res: Response,
  ): Promise<StreamableFile> {
    const file = await this.economie.export(user, query);
    res.set({
      'Content-Type': file.contentType,
      'Content-Disposition': `attachment; filename="${file.filename}"`,
    });
    return new StreamableFile(file.buffer);
  }
}
