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
import { PromotionsService } from './promotions.service.js';
import { CreatePromotionDto, UpdatePromotionDto } from './dto/promotion.dto.js';

@ApiTags('Finance — Promotions (coupons réduction)')
@Controller('farms/:farmId/promotions')
export class PromotionsController {
  constructor(private readonly promotionsService: PromotionsService) {}

  @Post()
  @Roles(UserRole.PROPRIETAIRE, UserRole.ELEVEUR)
  @Permissions('vente:promotion')
  @ApiOperation({ summary: 'Créer une promotion (coupon réduction)' })
  @ApiParam({ name: 'farmId' })
  create(
    @CurrentUser() user: AuthUser,
    @Param('farmId') farmId: string,
    @Body() dto: CreatePromotionDto,
  ) {
    return this.promotionsService.create(user, farmId, dto);
  }

  @Get()
  @Roles(UserRole.PROPRIETAIRE, UserRole.ELEVEUR)
  @ApiOperation({ summary: 'Liste des promotions de la ferme' })
  @ApiParam({ name: 'farmId' })
  findAll(@CurrentUser() user: AuthUser, @Param('farmId') farmId: string) {
    return this.promotionsService.findAll(user, farmId);
  }

  @Patch(':promotionId')
  @Roles(UserRole.PROPRIETAIRE, UserRole.ELEVEUR)
  @Permissions('vente:promotion')
  @ApiOperation({ summary: 'Modifier une promotion' })
  @ApiParam({ name: 'farmId' })
  update(
    @CurrentUser() user: AuthUser,
    @Param('farmId') farmId: string,
    @Param('promotionId') promotionId: string,
    @Body() dto: UpdatePromotionDto,
  ) {
    return this.promotionsService.update(user, farmId, promotionId, dto);
  }

  @Delete(':promotionId')
  @Roles(UserRole.PROPRIETAIRE, UserRole.ELEVEUR)
  @Permissions('vente:promotion')
  @ApiOperation({ summary: 'Supprimer une promotion' })
  @ApiParam({ name: 'farmId' })
  remove(
    @CurrentUser() user: AuthUser,
    @Param('farmId') farmId: string,
    @Param('promotionId') promotionId: string,
  ) {
    return this.promotionsService.remove(user, farmId, promotionId);
  }
}
