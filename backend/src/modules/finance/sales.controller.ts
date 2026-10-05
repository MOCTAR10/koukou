import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  Post,
  Query,
  Res,
} from '@nestjs/common';
import { ApiOperation, ApiParam, ApiQuery, ApiTags } from '@nestjs/swagger';
import type { Response } from 'express';
import { CurrentUser } from '../../common/decorators/current-user.decorator.js';
import type { AuthUser } from '../../common/decorators/current-user.decorator.js';
import { Roles } from '../../common/decorators/roles.decorator.js';
import { Permissions } from '../../common/decorators/permissions.decorator.js';
import { UserRole } from '../../common/enums/role.enum.js';
import { SaleStatus } from '../../common/enums/sale-status.enum.js';
import { SalesService } from './sales.service.js';
import { CreateSaleDto } from './dto/sale.dto.js';
import { CreatePaymentDto } from './dto/payment.dto.js';

@ApiTags('Finance — Ventes (POS)')
@Controller('farms/:farmId/sales')
export class SalesController {
  constructor(private readonly salesService: SalesService) {}

  @Get()
  @Roles(UserRole.PROPRIETAIRE, UserRole.ELEVEUR)
  @ApiOperation({
    summary: 'Liste des ventes (filtre par période / statut)',
  })
  @ApiParam({ name: 'farmId' })
  @ApiQuery({ name: 'from', required: false, example: '2026-08-01' })
  @ApiQuery({ name: 'to', required: false, example: '2026-08-31' })
  @ApiQuery({ name: 'status', required: false, enum: SaleStatus })
  list(
    @CurrentUser() user: AuthUser,
    @Param('farmId') farmId: string,
    @Query('from') from?: string,
    @Query('to') to?: string,
    @Query('status') status?: SaleStatus,
  ) {
    return this.salesService.list(user, farmId, from, to, status);
  }

  @Post()
  @Roles(UserRole.PROPRIETAIRE, UserRole.ELEVEUR)
  @Permissions('vente:creer')
  @ApiOperation({
    summary:
      'Créer une vente au comptoir : décrémente le cheptel/l’inventaire, enregistre l’encaissement espèces et retourne les warnings advisory (non bloquants).',
  })
  @ApiParam({ name: 'farmId' })
  create(
    @CurrentUser() user: AuthUser,
    @Param('farmId') farmId: string,
    @Body() dto: CreateSaleDto,
  ) {
    return this.salesService.create(user, farmId, dto);
  }

  @Get(':saleId')
  @Roles(UserRole.PROPRIETAIRE, UserRole.ELEVEUR)
  @ApiOperation({ summary: 'Détail d’une vente (articles + paiements)' })
  @ApiParam({ name: 'farmId' })
  getOne(
    @CurrentUser() user: AuthUser,
    @Param('farmId') farmId: string,
    @Param('saleId') saleId: string,
  ) {
    return this.salesService.getOne(user, farmId, saleId);
  }

  @Post(':saleId/payments')
  @Roles(UserRole.PROPRIETAIRE, UserRole.ELEVEUR)
  @Permissions('vente:creer')
  @ApiOperation({
    summary: 'Encaisser un acompte / solde sur une vente (crédit client)',
  })
  @ApiParam({ name: 'farmId' })
  addPayment(
    @CurrentUser() user: AuthUser,
    @Param('farmId') farmId: string,
    @Param('saleId') saleId: string,
    @Body() dto: CreatePaymentDto,
  ) {
    return this.salesService.addPayment(user, farmId, saleId, dto);
  }

  @Get(':saleId/receipt')
  @Roles(UserRole.PROPRIETAIRE, UserRole.ELEVEUR)
  @ApiOperation({
    summary: 'Reçu de vente PDF avec code QR de vérification',
  })
  @ApiParam({ name: 'farmId' })
  async receipt(
    @CurrentUser() user: AuthUser,
    @Param('farmId') farmId: string,
    @Param('saleId') saleId: string,
    @Res() res: Response,
  ) {
    const pdf = await this.salesService.generateReceipt(user, farmId, saleId);
    res.set({
      'Content-Type': 'application/pdf',
      'Content-Disposition': `inline; filename="recu-${saleId}.pdf"`,
    });
    res.send(pdf);
  }

  @Delete(':saleId')
  @Roles(UserRole.PROPRIETAIRE, UserRole.ELEVEUR)
  @Permissions('vente:annuler')
  @ApiOperation({
    summary:
      'Annuler une vente : réintègre le stock, rembourse les encaissements.',
  })
  @ApiParam({ name: 'farmId' })
  cancel(
    @CurrentUser() user: AuthUser,
    @Param('farmId') farmId: string,
    @Param('saleId') saleId: string,
    @Query('reason') reason?: string,
  ) {
    return this.salesService.cancel(user, farmId, saleId, reason);
  }
}
