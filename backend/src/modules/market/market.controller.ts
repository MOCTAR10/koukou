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
  ReadyDateSuggestionQueryDto,
  UpdateMarketListingDto,
} from './dto/market-listing.dto.js';
import { MarketListingsService } from './market-listings.service.js';

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
  constructor(private readonly listings: MarketListingsService) {}

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
