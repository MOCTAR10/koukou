import { Controller, Get, Param, Query, Res } from '@nestjs/common';
import { ApiOperation, ApiParam, ApiQuery, ApiTags } from '@nestjs/swagger';
import type { Response } from 'express';
import { CurrentUser } from '../../common/decorators/current-user.decorator.js';
import type { AuthUser } from '../../common/decorators/current-user.decorator.js';
import { Permissions } from '../../common/decorators/permissions.decorator.js';
import { Roles } from '../../common/decorators/roles.decorator.js';
import { UserRole } from '../../common/enums/role.enum.js';
import { RentabiliteService } from './rentabilite.service.js';

@ApiTags('Finance — Rentabilité & Compte de résultat')
@Controller('farms/:farmId/rentabilite')
export class RentabiliteController {
  constructor(private readonly rentabiliteService: RentabiliteService) {}

  @Get('overview')
  @Roles(UserRole.PROPRIETAIRE, UserRole.ELEVEUR)
  @Permissions('compta:rapports')
  @ApiOperation({
    summary:
      'Vue financière de la période : ventes, recouvrements, créances, dépenses par catégorie, résultat net.',
  })
  @ApiParam({ name: 'farmId' })
  @ApiQuery({ name: 'from', required: false, example: '2026-08-01' })
  @ApiQuery({ name: 'to', required: false, example: '2026-08-31' })
  overview(
    @CurrentUser() user: AuthUser,
    @Param('farmId') farmId: string,
    @Query('from') from?: string,
    @Query('to') to?: string,
  ) {
    return this.rentabiliteService.getOverview(user, farmId, from, to);
  }

  @Get('overview/export')
  @Roles(UserRole.PROPRIETAIRE, UserRole.ELEVEUR)
  @Permissions('compta:rapports')
  @ApiOperation({
    summary:
      'Export PDF du rapport de période (toute période souhaitée, par exemple journalière/mensuelle).',
  })
  @ApiParam({ name: 'farmId' })
  @ApiQuery({ name: 'from', required: false, example: '2026-08-01' })
  @ApiQuery({ name: 'to', required: false, example: '2026-08-31' })
  async export(
    @CurrentUser() user: AuthUser,
    @Param('farmId') farmId: string,
    @Query() query: { from?: string; to?: string },
    @Res() res: Response,
  ) {
    const pdf = await this.rentabiliteService.exportOverviewPdf(
      user,
      farmId,
      query.from,
      query.to,
    );
    res.set({
      'Content-Type': 'application/pdf',
      'Content-Disposition': `inline; filename="rapport-${query.from ?? 'all'}-${query.to ?? 'now'}.pdf"`,
    });
    res.send(pdf);
  }

  @Get('batches/:batchId')
  @Roles(UserRole.PROPRIETAIRE, UserRole.ELEVEUR)
  @Permissions('compta:rapports')
  @ApiOperation({
    summary:
      'Compte de résultat du lot : revenus par produit, dépenses, coût au kilo, marge.',
  })
  @ApiParam({ name: 'farmId' })
  batchPnl(
    @CurrentUser() user: AuthUser,
    @Param('farmId') farmId: string,
    @Param('batchId') batchId: string,
  ) {
    return this.rentabiliteService.getBatchPnl(user, farmId, batchId);
  }

  @Get('batches/:batchId/export')
  @Roles(UserRole.PROPRIETAIRE, UserRole.ELEVEUR)
  @Permissions('compta:rapports')
  @ApiOperation({
    summary: 'Export PDF du compte de résultat du lot.',
  })
  @ApiParam({ name: 'farmId' })
  async exportBatchPnl(
    @CurrentUser() user: AuthUser,
    @Param('farmId') farmId: string,
    @Param('batchId') batchId: string,
    @Res() res: Response,
  ) {
    const pdf = await this.rentabiliteService.exportBatchPnlPdf(
      user,
      farmId,
      batchId,
    );
    res.set({
      'Content-Type': 'application/pdf',
      'Content-Disposition': `inline; filename="resultat-lot-${batchId.slice(0, 8)}.pdf"`,
    });
    res.send(pdf);
  }
}
