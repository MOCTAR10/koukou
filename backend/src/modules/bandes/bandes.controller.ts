import {
  BadRequestException,
  Body,
  Controller,
  Get,
  Param,
  Post,
  Query,
} from '@nestjs/common';
import { ApiOperation, ApiParam, ApiQuery, ApiTags } from '@nestjs/swagger';
import { AuditThirdPartyRead } from '../../common/decorators/audit.decorator.js';
import { CurrentUser } from '../../common/decorators/current-user.decorator.js';
import { Action, Domain } from '../../common/decorators/domain.decorator.js';
import type { AuthUser } from '../../common/decorators/current-user.decorator.js';
import { Permissions } from '../../common/decorators/permissions.decorator.js';
import { Roles } from '../../common/decorators/roles.decorator.js';
import { UserRole } from '../../common/enums/role.enum.js';
import { BandeStatsService } from '../batches/poufa/bande-stats.service.js';
import { FarmsService } from '../farms/farms.service.js';
import { economicView } from '../indicators/economic-indicators.js';
import { BandeCorrectionsService } from './bande-corrections.service.js';
import { BandeIndicatorsService } from './bande-indicators.service.js';
import { BandeSnapshotsService } from './bande-snapshots.service.js';
import { parseBandStatusFilter } from './band-summary.js';
import { BandesService } from './bandes.service.js';
import { CorrectClosedBandeDto, CreateSortieDto } from './dto/sortie.dto.js';
import { SortiesService } from './sorties.service.js';

/**
 * POUFA bands (every farm is a programme farm). A band is
 * an ordinary lot (`/farms/:farmId/batches`): these routes add its number,
 * sorties, official indicators, daily projection and frozen bilans.
 *
 * Domain TECHNIQUE for institutional accounts (within their scope); a VENTE
 * sortie also needs `vente:creer` (Fermia-only VENTES domain), so it stays
 * with the farm. Correcting a closed band takes TECHNIQUE + ADMINISTRER,
 * granted per profile by the programme administration (no default profile
 * has it; CDC §8 « profil habilité »).
 *
 * POUFA lot A2 droits: the official revenue, charges, cost and margin of a
 * band go to ECONOMIQUE readers only (`economicView`, audit F6); the reads
 * carrying farm data are journaled for third parties (CDC §8).
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
    private readonly farms: FarmsService,
  ) {}

  @Get()
  @AuditThirdPartyRead('Historique des bandes (bilans officiels, données économiques)')
  @Roles(UserRole.PROPRIETAIRE, UserRole.ELEVEUR)
  @ApiOperation({
    summary:
      'Historique des bandes de la ferme : fiche de chaque bande et son résumé officiel (dernier bilan figé pour une bande clôturée, indicateurs du jour sinon)',
  })
  @ApiParam({ name: 'farmId' })
  @ApiQuery({ name: 'status', required: false, enum: ['CLOTURE', 'EN_COURS'] })
  async list(
    @CurrentUser() user: AuthUser,
    @Param('farmId') farmId: string,
    @Query('status') status?: string,
  ) {
    const filter = parseBandStatusFilter(status);
    if (filter === null) {
      throw new BadRequestException(
        'Statut de bande inconnu (CLOTURE ou EN_COURS).',
      );
    }
    const [bands, reads] = await Promise.all([
      this.snapshots.history(user, farmId, filter),
      this.farms.readsEconomics(user),
    ]);
    return bands.map((b) => ({
      ...b,
      summary: b.summary ? economicView(b.summary, reads) : null,
    }));
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
  @AuditThirdPartyRead('Indicateurs officiels d’une bande (données économiques)')
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
    return economicView(
      await this.indicators.compute(farm, batch, asOf || undefined),
      await this.farms.readsEconomics(user),
    );
  }

  @Get(':batchId/snapshots')
  @AuditThirdPartyRead('Bilans figés d’une bande (données économiques)')
  @Roles(UserRole.PROPRIETAIRE, UserRole.ELEVEUR)
  @ApiOperation({
    summary: 'Bilans figés de la bande (une version par correction)',
  })
  async snapshotsOf(
    @CurrentUser() user: AuthUser,
    @Param('farmId') farmId: string,
    @Param('batchId') batchId: string,
  ) {
    const [list, reads] = await Promise.all([
      this.snapshots.list(user, farmId, batchId),
      this.farms.readsEconomics(user),
    ]);
    return list.map((s) => economicView(s, reads));
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
  @AuditThirdPartyRead('Sorties d’une bande (prix, destinataires)')
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
  async correct(
    @CurrentUser() user: AuthUser,
    @Param('farmId') farmId: string,
    @Param('batchId') batchId: string,
    @Body() dto: CorrectClosedBandeDto,
  ) {
    const result = await this.corrections.correctDailyEntry(
      user,
      farmId,
      batchId,
      dto,
    );
    return {
      ...result,
      snapshot: economicView(
        result.snapshot,
        await this.farms.readsEconomics(user),
      ),
    };
  }
}
