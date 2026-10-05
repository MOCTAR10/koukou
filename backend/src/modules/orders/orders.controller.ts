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
import { OrderCanal } from '../../common/enums/order-canal.enum.js';
import { OrderStatus } from '../../common/enums/order-status.enum.js';
import { OrdersService } from './orders.service.js';
import {
  CreateOrderDto,
  FinalizeOrderDto,
  OrderDepositDto,
} from './dto/order.dto.js';

@ApiTags('Finance — Commandes / bons de commande')
@Controller('farms/:farmId/orders')
export class OrdersController {
  constructor(private readonly ordersService: OrdersService) {}

  @Get()
  @Roles(UserRole.PROPRIETAIRE, UserRole.ELEVEUR)
  @ApiOperation({
    summary:
      'Liste des commandes (canal et/ou statut) — bon de commande ou précommande.',
  })
  @ApiParam({ name: 'farmId' })
  @ApiQuery({ name: 'canal', required: false, enum: OrderCanal })
  @ApiQuery({ name: 'status', required: false, enum: OrderStatus })
  list(
    @CurrentUser() user: AuthUser,
    @Param('farmId') farmId: string,
    @Query('canal') canal?: OrderCanal,
    @Query('status') status?: OrderStatus,
  ) {
    return this.ordersService.list(user, farmId, canal, status);
  }

  @Post()
  @Roles(UserRole.PROPRIETAIRE, UserRole.ELEVEUR)
  @Permissions('vente:creer')
  @ApiOperation({
    summary:
      'Créer une commande / précommande : enveloppe la vente, fige le prix des articles, réserve le cheptel (sans le décrémenter) et encaisse éventuellement un acompte (caisse ouverte requise).',
  })
  @ApiParam({ name: 'farmId' })
  create(
    @CurrentUser() user: AuthUser,
    @Param('farmId') farmId: string,
    @Body() dto: CreateOrderDto,
  ) {
    return this.ordersService.create(user, farmId, dto);
  }

  @Get(':orderId')
  @Roles(UserRole.PROPRIETAIRE, UserRole.ELEVEUR)
  @ApiOperation({
    summary: 'Détail d’une commande (articles + vente associée + paiements)',
  })
  @ApiParam({ name: 'farmId' })
  getOne(
    @CurrentUser() user: AuthUser,
    @Param('farmId') farmId: string,
    @Param('orderId') orderId: string,
  ) {
    return this.ordersService.getOne(user, farmId, orderId);
  }

  @Post(':orderId/deposit')
  @Roles(UserRole.PROPRIETAIRE, UserRole.ELEVEUR)
  @Permissions('vente:creer')
  @ApiOperation({
    summary:
      'Encaisser un acompte / confirmer la commande (la caisse doit être ouverte)',
  })
  @ApiParam({ name: 'farmId' })
  deposit(
    @CurrentUser() user: AuthUser,
    @Param('farmId') farmId: string,
    @Param('orderId') orderId: string,
    @Body() dto: OrderDepositDto,
  ) {
    return this.ordersService.deposit(user, farmId, orderId, dto);
  }

  @Post(':orderId/livrer')
  @Roles(UserRole.PROPRIETAIRE, UserRole.ELEVEUR)
  @Permissions('vente:creer')
  @ApiOperation({
    summary:
      'Livrer / facturer : décrémente le cheptel ou vérifie le stock d’œufs, applique les quantités finales (au kilo) et encaisse le solde éventuel.',
  })
  @ApiParam({ name: 'farmId' })
  livrer(
    @CurrentUser() user: AuthUser,
    @Param('farmId') farmId: string,
    @Param('orderId') orderId: string,
    @Body() dto: FinalizeOrderDto,
  ) {
    return this.ordersService.fulfil(user, farmId, orderId, dto);
  }

  @Get(':orderId/bon-de-commande')
  @Roles(UserRole.PROPRIETAIRE, UserRole.ELEVEUR)
  @ApiOperation({
    summary: 'Bon de commande PDF avec code QR de vérification',
  })
  @ApiParam({ name: 'farmId' })
  async bonDeCommande(
    @CurrentUser() user: AuthUser,
    @Param('farmId') farmId: string,
    @Param('orderId') orderId: string,
    @Res() res: Response,
  ) {
    const pdf = await this.ordersService.generateBonDeCommande(
      user,
      farmId,
      orderId,
    );
    res.set({
      'Content-Type': 'application/pdf',
      'Content-Disposition': `inline; filename="bon-commande-${orderId}.pdf"`,
    });
    res.send(pdf);
  }

  @Get(':orderId/receipt')
  @Roles(UserRole.PROPRIETAIRE, UserRole.ELEVEUR)
  @ApiOperation({
    summary: 'Reçu PDF de la vente associée (après livraison)',
  })
  @ApiParam({ name: 'farmId' })
  async receipt(
    @CurrentUser() user: AuthUser,
    @Param('farmId') farmId: string,
    @Param('orderId') orderId: string,
    @Res() res: Response,
  ) {
    const pdf = await this.ordersService.generateReceipt(user, farmId, orderId);
    res.set({
      'Content-Type': 'application/pdf',
      'Content-Disposition': `inline; filename="recu-${orderId}.pdf"`,
    });
    res.send(pdf);
  }

  @Delete(':orderId')
  @Roles(UserRole.PROPRIETAIRE, UserRole.ELEVEUR)
  @Permissions('vente:commande')
  @ApiOperation({
    summary:
      'Annuler une commande : annule la vente enveloppée sans réintégrer le cheptel, rembourse le cas échéant les acomptes.',
  })
  @ApiParam({ name: 'farmId' })
  cancel(
    @CurrentUser() user: AuthUser,
    @Param('farmId') farmId: string,
    @Param('orderId') orderId: string,
    @Query('reason') reason?: string,
  ) {
    return this.ordersService.cancel(user, farmId, orderId, reason);
  }
}
