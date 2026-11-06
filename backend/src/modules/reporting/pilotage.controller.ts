import { Controller, Get, Query, Res, StreamableFile } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import type { Response } from 'express';
import { AuditExport } from '../../common/decorators/audit.decorator.js';
import { CurrentUser } from '../../common/decorators/current-user.decorator.js';
import type { AuthUser } from '../../common/decorators/current-user.decorator.js';
import { Domain } from '../../common/decorators/domain.decorator.js';
import { Roles } from '../../common/decorators/roles.decorator.js';
import { UserRole } from '../../common/enums/role.enum.js';
import { ObjectiveQueryDto, PilotageQueryDto } from './dto/pilotage.dto.js';
import { PilotageDashboardService } from './pilotage-dashboard.service.js';
import { ExportWriter, type ExportTable } from './export-table.js';
import { PilotageExportsService } from './pilotage-exports.service.js';
import { PilotageMapService } from './pilotage-map.service.js';
import { PilotageObjectiveService } from './pilotage-objective.service.js';
import { PilotageScopeService } from './pilotage-scope.service.js';

/**
 * Programme steering (POUFA plan §13, CDC 5.4): province and national
 * dashboards, map data, the 100 000 t objective and CSV exports. Platform
 * admin, or an institutional profile granted PILOTAGE:CONSULTER (DGE, MAEDR
 * by default), within its scope: PROVINCES its provinces, FARMS its farms,
 * ALL everything, AGGREGATE (MAEDR) aggregates only. Farm owners and members
 * never reach these routes (their band's anonymous comparison is under
 * `/farms/:farmId/bandes/:batchId/comparison`).
 */
@ApiTags('Pilotage du programme')
@ApiBearerAuth()
@Domain('PILOTAGE')
@Roles(UserRole.PLATFORM_ADMIN)
@Controller('pilotage')
export class PilotageController {
  constructor(
    private readonly scope: PilotageScopeService,
    private readonly dashboards: PilotageDashboardService,
    private readonly maps: PilotageMapService,
    private readonly objectives: PilotageObjectiveService,
    private readonly exportsService: PilotageExportsService,
    private readonly writer: ExportWriter,
  ) {}

  @Get('dashboard')
  @ApiOperation({
    summary:
      'Tableau de bord province / national : effectifs, mortalité, volumes produits et vendus, prix, fermes par statut et cohorte, alertes, complétude',
  })
  async dashboard(
    @CurrentUser() user: AuthUser,
    @Query() query: PilotageQueryDto,
  ) {
    return this.dashboards.dashboard(await this.scope.viewOf(user), query);
  }

  @Get('map')
  @ApiOperation({
    summary:
      'Carte : points des fermes (GPS du registre) avec couleurs (mortalité, alerte, complétude) et regroupements par province',
  })
  async map(@CurrentUser() user: AuthUser, @Query() query: PilotageQueryDto) {
    return this.maps.map(await this.scope.viewOf(user), query);
  }

  @Get('objective')
  @ApiOperation({
    summary:
      'Objectif national de 100 000 t : contribution réalisée du programme et projection 2027-2030 (méthode et paramètres fournis)',
  })
  async objective(
    @CurrentUser() user: AuthUser,
    @Query() query: ObjectiveQueryDto,
  ) {
    return this.objectives.objective(await this.scope.viewOf(user), query);
  }

  @Get('exports/provinces.csv')
  @AuditExport('Export CSV du pilotage par province')
  @ApiOperation({
    summary:
      'Export CSV par province (agrégats ; petits groupes masqués pour un profil agrégé)',
  })
  async exportProvinces(
    @CurrentUser() user: AuthUser,
    @Query() query: PilotageQueryDto,
    @Res({ passthrough: true }) res: Response,
  ) {
    const table = await this.exportsService.provinces(
      await this.scope.viewOf(user),
      query,
    );
    return this.send(res, table, 'csv');
  }

  @Get('exports/farms.csv')
  @AuditExport('Export CSV du pilotage par ferme')
  @ApiOperation({
    summary:
      'Export CSV par ferme du périmètre (refusé à un profil « données agrégées »)',
  })
  async exportFarms(
    @CurrentUser() user: AuthUser,
    @Query() query: PilotageQueryDto,
    @Res({ passthrough: true }) res: Response,
  ) {
    const table = await this.exportsService.farms(
      await this.scope.viewOf(user),
      query,
    );
    return this.send(res, table, 'csv');
  }

  @Get('exports/bandes.csv')
  @AuditExport('Export CSV du pilotage par bande')
  @ApiOperation({
    summary:
      'Export CSV des bandes suivies sur la période (refusé à un profil « données agrégées »)',
  })
  async exportBands(
    @CurrentUser() user: AuthUser,
    @Query() query: PilotageQueryDto,
    @Res({ passthrough: true }) res: Response,
  ) {
    const table = await this.exportsService.bands(
      await this.scope.viewOf(user),
      query,
    );
    return this.send(res, table, 'csv');
  }

  /** Format seam: an `xlsx` route only passes another format code. */
  private async send(
    res: Response,
    table: ExportTable,
    format: string,
  ): Promise<StreamableFile> {
    const file = await this.writer.write(table, format);
    res.set({
      'Content-Type': file.contentType,
      'Content-Disposition': `attachment; filename="${file.filename}"`,
    });
    return new StreamableFile(file.buffer);
  }
}
