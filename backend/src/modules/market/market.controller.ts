import {
  Body,
  Controller,
  Get,
  Param,
  ParseUUIDPipe,
  Patch,
  Post,
  Query,
} from '@nestjs/common';
import { ApiOperation, ApiTags } from '@nestjs/swagger';
import { CurrentUser } from '../../common/decorators/current-user.decorator.js';
import type { AuthUser } from '../../common/decorators/current-user.decorator.js';
import { Permissions } from '../../common/decorators/permissions.decorator.js';
import { Public } from '../../common/decorators/public.decorator.js';
import { Roles } from '../../common/decorators/roles.decorator.js';
import { UserRole } from '../../common/enums/role.enum.js';
import {
  CreateMarketListingDto,
  MarketCatalogueQueryDto,
  MoveReadyDateDto,
  ReadyDateSuggestionQueryDto,
  UpdateMarketListingDto,
} from './dto/market-listing.dto.js';
import {
  CreateMarketOrderDto,
  FarmMarketOrdersQueryDto,
  RejectMarketOrderDto,
} from './dto/market-order.dto.js';
import { MarketListingsService } from './market-listings.service.js';
import { MarketOrdersService } from './market-orders.service.js';

/** Read by anyone, signed in or not. */
@ApiTags('Market')
@Controller('market/listings')
export class MarketCatalogueController {
  constructor(private readonly listings: MarketListingsService) {}

  @Public()
  @Get()
  @ApiOperation({ summary: 'Catalogue public du Market' })
  catalogue(@Query() query: MarketCatalogueQueryDto) {
    return this.listings.catalogue(query);
  }

  @Public()
  @Get(':listingId')
  @ApiOperation({ summary: 'Détail public d’une annonce' })
  item(@Param('listingId', ParseUUIDPipe) listingId: string) {
    return this.listings.catalogueItem(listingId);
  }
}

/** Routes carry farmId so PermissionsGuard applies. */
@ApiTags('Market')
@Controller('farms/:farmId/market')
@Roles(UserRole.PROPRIETAIRE, UserRole.ELEVEUR)
@Permissions('market:publier')
export class FarmMarketController {
  constructor(
    private readonly listings: MarketListingsService,
    private readonly orders: MarketOrdersService,
  ) {}

  @Post('listings/:listingId/move-date')
  @ApiOperation({
    summary: 'Déplacer la date d’une précommande et de ses commandes ouvertes',
  })
  moveDate(
    @CurrentUser() user: AuthUser,
    @Param('farmId') farmId: string,
    @Param('listingId', ParseUUIDPipe) listingId: string,
    @Body() dto: MoveReadyDateDto,
  ) {
    return this.orders.moveReadyDate(user, farmId, listingId, dto.readyDate);
  }

  @Get('listings')
  @ApiOperation({ summary: 'Annonces de la ferme, avec leur visibilité' })
  list(@CurrentUser() user: AuthUser, @Param('farmId') farmId: string) {
    return this.listings.listForFarm(user, farmId);
  }

  @Post('listings')
  @ApiOperation({ summary: 'Créer un brouillon d’annonce' })
  create(
    @CurrentUser() user: AuthUser,
    @Param('farmId') farmId: string,
    @Body() dto: CreateMarketListingDto,
  ) {
    return this.listings.create(user, farmId, dto);
  }

  @Get('ready-date-suggestion')
  @ApiOperation({ summary: 'Date de disponibilité suggérée pour un lot' })
  suggestion(
    @CurrentUser() user: AuthUser,
    @Param('farmId') farmId: string,
    @Query() query: ReadyDateSuggestionQueryDto,
  ) {
    return this.listings.suggestDate(user, farmId, query);
  }

  @Get('listings/:listingId')
  @ApiOperation({ summary: 'Détail d’une annonce de la ferme' })
  get(
    @CurrentUser() user: AuthUser,
    @Param('farmId') farmId: string,
    @Param('listingId', ParseUUIDPipe) listingId: string,
  ) {
    return this.listings.getForFarm(user, farmId, listingId);
  }

  @Patch('listings/:listingId')
  @ApiOperation({ summary: 'Modifier une annonce' })
  update(
    @CurrentUser() user: AuthUser,
    @Param('farmId') farmId: string,
    @Param('listingId', ParseUUIDPipe) listingId: string,
    @Body() dto: UpdateMarketListingDto,
  ) {
    return this.listings.update(user, farmId, listingId, dto);
  }

  @Post('listings/:listingId/publish')
  @ApiOperation({ summary: 'Publier (ferme vérifiée, stock et état sanitaire contrôlés)' })
  publish(
    @CurrentUser() user: AuthUser,
    @Param('farmId') farmId: string,
    @Param('listingId', ParseUUIDPipe) listingId: string,
  ) {
    return this.listings.publish(user, farmId, listingId);
  }

  @Post('listings/:listingId/pause')
  @ApiOperation({ summary: 'Suspendre une annonce publiée' })
  pause(
    @CurrentUser() user: AuthUser,
    @Param('farmId') farmId: string,
    @Param('listingId', ParseUUIDPipe) listingId: string,
  ) {
    return this.listings.pause(user, farmId, listingId);
  }

  @Post('listings/:listingId/close')
  @ApiOperation({ summary: 'Clôturer une annonce (définitif)' })
  close(
    @CurrentUser() user: AuthUser,
    @Param('farmId') farmId: string,
    @Param('listingId', ParseUUIDPipe) listingId: string,
  ) {
    return this.listings.close(user, farmId, listingId);
  }
}

/** A buyer's own orders. Every signed-in role can buy. */
@ApiTags('Market')
@Controller('market/orders')
@Roles(UserRole.PROPRIETAIRE, UserRole.ELEVEUR, UserRole.ACHETEUR)
export class BuyerMarketOrdersController {
  constructor(private readonly orders: MarketOrdersService) {}

  @Post()
  @ApiOperation({ summary: 'Demander une commande ou une précommande' })
  request(@CurrentUser() user: AuthUser, @Body() dto: CreateMarketOrderDto) {
    return this.orders.request(user, dto);
  }

  @Get()
  @ApiOperation({ summary: 'Mes commandes Market' })
  mine(@CurrentUser() user: AuthUser) {
    return this.orders.listForBuyer(user);
  }

  @Get(':id')
  @ApiOperation({ summary: 'Détail de ma commande Market' })
  one(
    @CurrentUser() user: AuthUser,
    @Param('id', ParseUUIDPipe) id: string,
  ) {
    return this.orders.getForBuyer(user, id);
  }

  @Post(':id/cancel')
  @ApiOperation({
    summary:
      'Annuler : immédiat sans acompte, sinon demande à la ferme, qui rembourse',
  })
  cancel(
    @CurrentUser() user: AuthUser,
    @Param('id', ParseUUIDPipe) id: string,
  ) {
    return this.orders.cancel(user, id);
  }

  @Post(':id/withdraw')
  @ApiOperation({ summary: 'Retirer une demande pas encore acceptée' })
  withdraw(
    @CurrentUser() user: AuthUser,
    @Param('id', ParseUUIDPipe) id: string,
  ) {
    return this.orders.withdraw(user, id);
  }
}

/**
 * Accepting creates an order, so it takes the same right as creating one
 * through the order screens, without vente:creer (which every Éleveur has).
 */
@ApiTags('Market')
@Controller('farms/:farmId/market/orders')
@Roles(UserRole.PROPRIETAIRE, UserRole.ELEVEUR)
@Permissions('vente:commande')
export class FarmMarketOrdersController {
  constructor(private readonly orders: MarketOrdersService) {}

  @Get()
  @ApiOperation({ summary: 'Demandes et commandes Market de la ferme' })
  list(
    @CurrentUser() user: AuthUser,
    @Param('farmId') farmId: string,
    @Query() query: FarmMarketOrdersQueryDto,
  ) {
    return this.orders.listForFarm(user, farmId, query);
  }

  @Post(':id/accept')
  @ApiOperation({ summary: 'Accepter : crée la commande et réserve le stock' })
  accept(
    @CurrentUser() user: AuthUser,
    @Param('farmId') farmId: string,
    @Param('id', ParseUUIDPipe) id: string,
  ) {
    return this.orders.accept(user, farmId, id);
  }

  @Post(':id/reject')
  @ApiOperation({ summary: 'Refuser une demande' })
  reject(
    @CurrentUser() user: AuthUser,
    @Param('farmId') farmId: string,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: RejectMarketOrderDto,
  ) {
    return this.orders.reject(user, farmId, id, dto);
  }

  @Post(':id/extend-deposit')
  @ApiOperation({ summary: 'Prolonger une fois de 24 h le délai d’acompte' })
  extend(
    @CurrentUser() user: AuthUser,
    @Param('farmId') farmId: string,
    @Param('id', ParseUUIDPipe) id: string,
  ) {
    return this.orders.extendDeposit(user, farmId, id);
  }
}
