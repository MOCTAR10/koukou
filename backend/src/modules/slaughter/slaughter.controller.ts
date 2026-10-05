import { Body, Controller, Get, Param, Patch, Post, Res } from '@nestjs/common';
import { ApiOperation, ApiParam, ApiTags } from '@nestjs/swagger';
import type { Response } from 'express';
import { CurrentUser } from '../../common/decorators/current-user.decorator.js';
import type { AuthUser } from '../../common/decorators/current-user.decorator.js';
import { Roles } from '../../common/decorators/roles.decorator.js';
import { Permissions } from '../../common/decorators/permissions.decorator.js';
import { UserRole } from '../../common/enums/role.enum.js';
import {
  CancelSlaughterOrderDto,
  CreateSlaughterOrderDto,
  ProcessSlaughterOrderDto,
  SendSlaughterOrderDto,
  UpdateSlaughterOrderDto,
} from './dto/slaughter.dto.js';
import { SlaughterService } from './slaughter.service.js';

@ApiTags('Abattage & traçabilité')
@Controller('farms/:farmId/slaughter-orders')
export class SlaughterController {
  constructor(private readonly slaughterService: SlaughterService) {}

  @Post()
  @Roles(UserRole.PROPRIETAIRE, UserRole.ELEVEUR)
  @Permissions('production:abattage')
  @ApiOperation({
    summary:
      'Créer un ordre d’abattage lié à un lot (interne = code suivi auto, externe = bordereau à envoyer à l’abattoir).',
  })
  @ApiParam({ name: 'farmId' })
  create(
    @CurrentUser() user: AuthUser,
    @Param('farmId') farmId: string,
    @Body() dto: CreateSlaughterOrderDto,
  ) {
    return this.slaughterService.create(user, farmId, dto);
  }

  @Get()
  @Roles(UserRole.PROPRIETAIRE, UserRole.ELEVEUR)
  @ApiOperation({ summary: 'Lister les ordres d’abattage de la ferme' })
  @ApiParam({ name: 'farmId' })
  list(@CurrentUser() user: AuthUser, @Param('farmId') farmId: string) {
    return this.slaughterService.list(user, farmId);
  }

  @Get(':orderId')
  @Roles(UserRole.PROPRIETAIRE, UserRole.ELEVEUR)
  @ApiOperation({ summary: 'Détail d’un ordre d’abattage (avec lot lié)' })
  @ApiParam({ name: 'farmId' })
  getOne(
    @CurrentUser() user: AuthUser,
    @Param('farmId') farmId: string,
    @Param('orderId') orderId: string,
  ) {
    return this.slaughterService.getOne(user, farmId, orderId);
  }

  @Patch(':orderId')
  @Roles(UserRole.PROPRIETAIRE, UserRole.ELEVEUR)
  @Permissions('production:abattage')
  @ApiOperation({
    summary:
      'Modifier un ordre (dates, effectif, poids, code lot abattoir manuel).',
  })
  @ApiParam({ name: 'farmId' })
  update(
    @CurrentUser() user: AuthUser,
    @Param('farmId') farmId: string,
    @Param('orderId') orderId: string,
    @Body() dto: UpdateSlaughterOrderDto,
  ) {
    return this.slaughterService.update(user, farmId, orderId, dto);
  }

  @Post(':orderId/send')
  @Roles(UserRole.PROPRIETAIRE, UserRole.ELEVEUR)
  @Permissions('production:abattage')
  @ApiOperation({
    summary:
      'Envoyer l’ordre (DRAFT → SENT) : génère le code interne si INTERNE, prépare le bordereau si EXTERNE.',
  })
  @ApiParam({ name: 'farmId' })
  send(
    @CurrentUser() user: AuthUser,
    @Param('farmId') farmId: string,
    @Param('orderId') orderId: string,
    @Body() dto: SendSlaughterOrderDto,
  ) {
    return this.slaughterService.send(user, farmId, orderId, dto);
  }

  @Post(':orderId/process')
  @Roles(UserRole.PROPRIETAIRE, UserRole.ELEVEUR)
  @Permissions('production:abattage')
  @ApiOperation({
    summary:
      'Marquer l’ordre traité (PROCESSED) — processedAt = date de mort du lot.',
  })
  @ApiParam({ name: 'farmId' })
  process(
    @CurrentUser() user: AuthUser,
    @Param('farmId') farmId: string,
    @Param('orderId') orderId: string,
    @Body() dto: ProcessSlaughterOrderDto,
  ) {
    return this.slaughterService.process(user, farmId, orderId, dto);
  }

  @Get(':orderId/bordereau')
  @Roles(UserRole.PROPRIETAIRE, UserRole.ELEVEUR)
  @ApiOperation({
    summary:
      'Bordereau d’envoi PDF avec QR (à joindre à l’envoi vers l’abattoir externe).',
  })
  @ApiParam({ name: 'farmId' })
  async bordereau(
    @CurrentUser() user: AuthUser,
    @Param('farmId') farmId: string,
    @Param('orderId') orderId: string,
    @Res() res: Response,
  ) {
    const pdf = await this.slaughterService.generateBordereau(
      user,
      farmId,
      orderId,
    );
    res.set({
      'Content-Type': 'application/pdf',
      'Content-Disposition': `inline; filename="bordereau-${orderId}.pdf"`,
    });
    res.send(pdf);
  }

  @Post(':orderId/cancel')
  @Roles(UserRole.PROPRIETAIRE, UserRole.ELEVEUR)
  @Permissions('production:abattage')
  @ApiOperation({ summary: 'Annuler un ordre d’abattage (DRAFT ou SENT).' })
  @ApiParam({ name: 'farmId' })
  cancel(
    @CurrentUser() user: AuthUser,
    @Param('farmId') farmId: string,
    @Param('orderId') orderId: string,
    @Body() dto?: CancelSlaughterOrderDto,
  ) {
    return this.slaughterService.cancel(user, farmId, orderId, dto);
  }
}

@ApiTags('Abattage & traçabilité')
@Controller('farms/:farmId/batches')
export class BatchPasseportController {
  constructor(private readonly slaughterService: SlaughterService) {}

  @Get(':batchId/passeport')
  @Roles(UserRole.PROPRIETAIRE, UserRole.ELEVEUR)
  @ApiOperation({
    summary:
      'Passeport sanitaire du lot (PDF + QR) : certifie la conformité sanitaire pour la vente directe aux abattoirs industriels et supermarchés.',
  })
  @ApiParam({ name: 'farmId' })
  async passeport(
    @CurrentUser() user: AuthUser,
    @Param('farmId') farmId: string,
    @Param('batchId') batchId: string,
    @Res() res: Response,
  ) {
    const pdf = await this.slaughterService.generatePasseport(
      user,
      farmId,
      batchId,
    );
    res.set({
      'Content-Type': 'application/pdf',
      'Content-Disposition': `inline; filename="passeport-sanitaire-${batchId}.pdf"`,
    });
    res.send(pdf);
  }
}
