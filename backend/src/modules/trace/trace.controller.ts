import {
  Controller,
  Get,
  Param,
  Post,
  Query,
  Res,
  StreamableFile,
} from '@nestjs/common';
import { ApiOperation, ApiParam, ApiQuery, ApiTags } from '@nestjs/swagger';
import type { Response } from 'express';
import { PdfService } from '../../common/services/pdf.service.js';
import { AuditExport } from '../../common/decorators/audit.decorator.js';
import {
  CurrentUser,
  type AuthUser,
} from '../../common/decorators/current-user.decorator.js';
import { Action, Domain } from '../../common/decorators/domain.decorator.js';
import { Roles } from '../../common/decorators/roles.decorator.js';
import { UserRole } from '../../common/enums/role.enum.js';
import { TraceHistoryService } from './trace-history.service.js';
import { traceLabelDocument } from './trace-label.js';

/**
 * Traceability lots of a farm (CDC §6.1 T1-T5): the band's root lot and the
 * sub-lots ceded to operators, their history and printable QR label. For the
 * farm (owner, members) and the institutions granted TRACABILITE within
 * their scope (the guard checks `:farmId`).
 */
@ApiTags('Traçabilité')
@Domain('TRACABILITE')
@Controller('farms/:farmId/trace/lots')
export class FarmTraceController {
  constructor(
    private readonly history: TraceHistoryService,
    private readonly pdf: PdfService,
  ) {}

  @Get()
  @Roles(UserRole.PROPRIETAIRE, UserRole.ELEVEUR)
  @ApiOperation({
    summary:
      'Lots de traçabilité de la ferme (lot de chaque bande et sous-lots cédés), avec l’adresse de leur QR code',
  })
  @ApiParam({ name: 'farmId' })
  @ApiQuery({ name: 'batchId', required: false, description: 'Une bande' })
  list(
    @CurrentUser() user: AuthUser,
    @Param('farmId') farmId: string,
    @Query('batchId') batchId?: string,
  ) {
    return this.history.list(user, farmId, batchId || undefined);
  }

  @Get(':lotId')
  @Roles(UserRole.PROPRIETAIRE, UserRole.ELEVEUR)
  @ApiOperation({
    summary:
      "Historique d'un lot : lot, sous-lots, événements (cessions), chronologie d'élevage de la bande, scans du QR code",
  })
  get(
    @CurrentUser() user: AuthUser,
    @Param('farmId') farmId: string,
    @Param('lotId') lotId: string,
  ) {
    return this.history.history(user, farmId, lotId);
  }

  @Post(':lotId/validate')
  @Action('VALIDER')
  @Roles(UserRole.PLATFORM_ADMIN, UserRole.PROPRIETAIRE, UserRole.ELEVEUR)
  @ApiOperation({
    summary:
      'Valider un lot (TRACABILITE:VALIDER dans la matrice ; refusé aux comptes de la ferme)',
  })
  validate(
    @CurrentUser() user: AuthUser,
    @Param('farmId') farmId: string,
    @Param('lotId') lotId: string,
  ) {
    return this.history.validate(user, farmId, lotId);
  }

  @Get(':lotId/label')
  @AuditExport('Étiquette QR d’un lot (PDF)')
  @Roles(UserRole.PROPRIETAIRE, UserRole.ELEVEUR)
  @ApiOperation({ summary: 'Étiquette imprimable du lot (PDF A6 avec QR code)' })
  async label(
    @CurrentUser() user: AuthUser,
    @Param('farmId') farmId: string,
    @Param('lotId') lotId: string,
    @Res({ passthrough: true }) res: Response,
  ) {
    const lot = await this.history.history(user, farmId, lotId);
    const pdf = await this.pdf.render(traceLabelDocument(lot));
    res.set({
      'Content-Type': 'application/pdf',
      'Content-Disposition': `inline; filename="lot-${lot.lot.code}.pdf"`,
    });
    return new StreamableFile(pdf);
  }
}

/**
 * Programme-wide lookup of a lot by its code (the code read on a label),
 * for the institutions within their scope, the platform admin and the farm.
 */
@ApiTags('Traçabilité')
@Domain('TRACABILITE')
@Controller('trace/lots')
export class TraceLotsController {
  constructor(private readonly history: TraceHistoryService) {}

  @Get('by-code/:code')
  @Roles(UserRole.PLATFORM_ADMIN, UserRole.PROPRIETAIRE, UserRole.ELEVEUR)
  @ApiOperation({ summary: "Historique d'un lot à partir de son code" })
  byCode(@CurrentUser() user: AuthUser, @Param('code') code: string) {
    return this.history.historyByCode(user, code);
  }
}
