import { Body, Controller, Get, Param, Post, Query } from '@nestjs/common';
import { ApiOperation, ApiParam, ApiQuery, ApiTags } from '@nestjs/swagger';
import { CurrentUser } from '../../common/decorators/current-user.decorator.js';
import { Action, Domain } from '../../common/decorators/domain.decorator.js';
import type { AuthUser } from '../../common/decorators/current-user.decorator.js';
import { Permissions } from '../../common/decorators/permissions.decorator.js';
import { Roles } from '../../common/decorators/roles.decorator.js';
import { UserRole } from '../../common/enums/role.enum.js';
import { BandeStatsService } from '../batches/poufa/bande-stats.service.js';
import { BandeCorrectionsService } from './bande-corrections.service.js';
import { BandeIndicatorsService } from './bande-indicators.service.js';
import { BandeSnapshotsService } from './bande-snapshots.service.js';
import { BandesService } from './bandes.service.js';
import { CorrectClosedBandeDto, CreateSortieDto } from './dto/sortie.dto.js';
import { SortiesService } from './sorties.service.js';

/**
 * POUFA bands (programme farms only; any other farm answers 404). A band is
 * an ordinary lot (`/farms/:farmId/batches`): these routes add its number,
 * sorties, official indicators, daily projection and frozen bilans.
 *
 * Domain TECHNIQUE for institutional accounts (within their scope); a VENTE
 * sortie also needs `vente:creer` (Fermia-only VENTES domain), so it stays
 * with the farm. Correcting a closed band takes TECHNIQUE + ADMINISTRER,
 * granted per profile by the programme administration (no default profile
 * has it; CDC §8 « profil habilité »).
 */
@ApiTags('Bandes POUFA')
@Domain('TECHNIQUE')
@Controller('farms/:farmId/bandes')
export class BandesController {
  constructor(
    private readonly bandes: BandesService,
    private readonly indicators: BandeIndicatorsService,
    private readonly snapshots: BandeSnapshotsService,
    private readonly sorties: SortiesService,
    private readonly corrections: BandeCorrectionsService,
    private readonly stats: BandeStatsService,
  ) {}

  @Get()
  @Roles(UserRole.PROPRIETAIRE, UserRole.ELEVEUR)
  @ApiOperation({
    summary: 'Historique des bandes de la ferme (fiche de chaque bande)',
  })
  @ApiParam({ name: 'farmId' })
  list(@CurrentUser() user: AuthUser, @Param('farmId') farmId: string) {
    return this.bandes.list(user, farmId);
  }

  @Get(':batchId')
  @Roles(UserRole.PROPRIETAIRE, UserRole.ELEVEUR)
  @ApiOperation({
    summary:
      'Fiche de la bande : numéro, âge (J+x), durée de référence, complétude, pesées',
  })
  sheet(
    @CurrentUser() user: AuthUser,
    @Param('farmId') farmId: string,
    @Param('batchId') batchId: string,
  ) {
    return this.bandes.sheet(user, farmId, batchId);
  }

  @Get(':batchId/indicators')
  @Roles(UserRole.PROPRIETAIRE, UserRole.ELEVEUR)
  @ApiOperation({
    summary:
      'Indicateurs officiels à une date (formules en vigueur à cette date, versions incluses)',
  })
  @ApiQuery({ name: 'asOf', required: false, description: 'AAAA-MM-JJ' })
  async indicatorsOf(
    @CurrentUser() user: AuthUser,
    @Param('farmId') farmId: string,
    @Param('batchId') batchId: string,
    @Query('asOf') asOf?: string,
  ) {
    const { farm, batch } = await this.bandes.load(user, farmId, batchId);
    return this.indicators.compute(farm, batch, asOf || undefined);
  }

  @Get(':batchId/snapshots')
  @Roles(UserRole.PROPRIETAIRE, UserRole.ELEVEUR)
  @ApiOperation({
    summary: 'Bilans figés de la bande (une version par correction)',
  })
  snapshotsOf(
    @CurrentUser() user: AuthUser,
    @Param('farmId') farmId: string,
    @Param('batchId') batchId: string,
  ) {
    return this.snapshots.list(user, farmId, batchId);
  }

  @Get(':batchId/daily-stats')
  @Roles(UserRole.PROPRIETAIRE, UserRole.ELEVEUR)
  @ApiOperation({
    summary:
      'Projection jour par jour : présents, morts, mortalité du jour, cumuls, aliment, poids, saisie faite',
  })
  async dailyStats(
    @CurrentUser() user: AuthUser,
    @Param('farmId') farmId: string,
    @Param('batchId') batchId: string,
  ) {
    const { batch } = await this.bandes.load(user, farmId, batchId);
    return this.stats.rows(batch.id);
  }

  @Post(':batchId/daily-stats/rebuild')
  @Roles(UserRole.PROPRIETAIRE, UserRole.ELEVEUR)
  @Permissions('production:gerer')
  @ApiOperation({ summary: 'Reconstruire la projection de la bande' })
  async rebuild(
    @CurrentUser() user: AuthUser,
    @Param('farmId') farmId: string,
    @Param('batchId') batchId: string,
  ) {
    const { batch } = await this.bandes.load(user, farmId, batchId);
    await this.stats.rebuild(batch.id);
    return this.stats.rows(batch.id);
  }

  @Get(':batchId/sorties')
  @Roles(UserRole.PROPRIETAIRE, UserRole.ELEVEUR)
  @ApiOperation({ summary: 'Sorties d’animaux de la bande' })
  sortiesOf(
    @CurrentUser() user: AuthUser,
    @Param('farmId') farmId: string,
    @Param('batchId') batchId: string,
  ) {
    return this.sorties.list(user, farmId, batchId);
  }

  @Post(':batchId/sorties')
  @Roles(UserRole.PROPRIETAIRE, UserRole.ELEVEUR)
  @Permissions('saisie:creer')
  @ApiOperation({
    summary:
      'Enregistrer une sortie (vente → vente, abattoir → ordre d’abattage, autre → retrait)',
  })
  createSortie(
    @CurrentUser() user: AuthUser,
    @Param('farmId') farmId: string,
    @Param('batchId') batchId: string,
    @Body() dto: CreateSortieDto,
  ) {
    return this.sorties.create(user, farmId, batchId, dto);
  }

  @Post(':batchId/corrections')
  // Platform admin, or an institutional profile granted TECHNIQUE +
  // ADMINISTRER from the administration (ProgramAccessGuard, within scope).
  @Action('ADMINISTRER')
  @Roles(UserRole.PLATFORM_ADMIN)
  @ApiOperation({
    summary:
      'Corriger une saisie d’une bande clôturée (profil habilité, motif obligatoire, nouveau bilan)',
  })
  correct(
    @CurrentUser() user: AuthUser,
    @Param('farmId') farmId: string,
    @Param('batchId') batchId: string,
    @Body() dto: CorrectClosedBandeDto,
  ) {
    return this.corrections.correctDailyEntry(user, farmId, batchId, dto);
  }
}
