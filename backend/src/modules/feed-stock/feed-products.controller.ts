import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  Patch,
  Post,
} from '@nestjs/common';
import { ApiOperation, ApiParam, ApiTags } from '@nestjs/swagger';
import { CurrentUser } from '../../common/decorators/current-user.decorator.js';
import type { AuthUser } from '../../common/decorators/current-user.decorator.js';
import { Roles } from '../../common/decorators/roles.decorator.js';
import { Permissions } from '../../common/decorators/permissions.decorator.js';
import { UserRole } from '../../common/enums/role.enum.js';
import { FeedProductsService } from './feed-products.service.js';
import { CreateFeedProductDto } from './dto/create-feed-product.dto.js';
import { UpdateFeedProductDto } from './dto/update-feed-product.dto.js';

@ApiTags('Catalogue provende (Stock & Inventaire — Module 3)')
@Controller('farms/:farmId/feed-products')
export class FeedProductsController {
  constructor(private readonly productsService: FeedProductsService) {}

  @Post()
  @Roles(UserRole.PROPRIETAIRE, UserRole.ELEVEUR)
  @Permissions('stock:gerer')
  @ApiOperation({
    summary:
      'Ajouter un produit au catalogue provende de la ferme (nom unique par ferme)',
  })
  @ApiParam({ name: 'farmId' })
  create(
    @CurrentUser() user: AuthUser,
    @Param('farmId') farmId: string,
    @Body() dto: CreateFeedProductDto,
  ) {
    return this.productsService.create(user, farmId, dto);
  }

  @Get()
  @Roles(UserRole.PROPRIETAIRE, UserRole.ELEVEUR)
  @ApiOperation({ summary: 'Lister le catalogue provende de la ferme' })
  @ApiParam({ name: 'farmId' })
  list(@CurrentUser() user: AuthUser, @Param('farmId') farmId: string) {
    return this.productsService.list(user, farmId);
  }

  @Patch(':productId')
  @Roles(UserRole.PROPRIETAIRE, UserRole.ELEVEUR)
  @Permissions('stock:gerer')
  @ApiOperation({
    summary:
      'Modifier un produit du catalogue (prix, fournisseur, sac, phase, actif)',
  })
  @ApiParam({ name: 'farmId' })
  update(
    @CurrentUser() user: AuthUser,
    @Param('farmId') farmId: string,
    @Param('productId') productId: string,
    @Body() dto: UpdateFeedProductDto,
  ) {
    return this.productsService.update(user, farmId, productId, dto);
  }

  @Delete(':productId')
  @Roles(UserRole.PROPRIETAIRE, UserRole.ELEVEUR)
  @Permissions('stock:gerer')
  @ApiOperation({
    summary:
      'Supprimer un produit du catalogue (refusé s’il est rattaché à une entrée d’aliment)',
  })
  @ApiParam({ name: 'farmId' })
  remove(
    @CurrentUser() user: AuthUser,
    @Param('farmId') farmId: string,
    @Param('productId') productId: string,
  ) {
    return this.productsService.remove(user, farmId, productId);
  }
}