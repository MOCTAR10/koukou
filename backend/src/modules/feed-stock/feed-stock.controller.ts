import { Body, Controller, Get, Param, Post } from '@nestjs/common';
import { ApiOperation, ApiParam, ApiTags } from '@nestjs/swagger';
import { CurrentUser } from '../../common/decorators/current-user.decorator.js';
import type { AuthUser } from '../../common/decorators/current-user.decorator.js';
import { Roles } from '../../common/decorators/roles.decorator.js';
import { Permissions } from '../../common/decorators/permissions.decorator.js';
import { UserRole } from '../../common/enums/role.enum.js';
import { FeedStockService } from './feed-stock.service.js';
import { CreateLossDto } from './dto/create-loss.dto.js';

@ApiTags('Stock & Inventaire provende (Module 3)')
@Controller('farms/:farmId/feed-stock')
export class FeedStockController {
  constructor(private readonly feedStockService: FeedStockService) {}

  @Get()
  @Roles(UserRole.PROPRIETAIRE, UserRole.ELEVEUR)
  @ApiOperation({
    summary:
      'Inventaire provende par type avec autonomie (jours) + détail par lot physique + pertes',
  })
  @ApiParam({ name: 'farmId' })
  summary(@CurrentUser() user: AuthUser, @Param('farmId') farmId: string) {
    return this.feedStockService.getStockSummary(user, farmId);
  }

  @Post('losses')
  @Roles(UserRole.PROPRIETAIRE, UserRole.ELEVEUR)
  @Permissions('stock:gerer')
  @ApiOperation({ summary: 'Déclarer des sacs gâtés (perte de provende)' })
  @ApiParam({ name: 'farmId' })
  createLoss(
    @CurrentUser() user: AuthUser,
    @Param('farmId') farmId: string,
    @Body() dto: CreateLossDto,
  ) {
    return this.feedStockService.recordLoss(user, farmId, dto);
  }

  @Get('losses')
  @Roles(UserRole.PROPRIETAIRE, UserRole.ELEVEUR)
  @ApiOperation({ summary: 'Lister les pertes de provende' })
  @ApiParam({ name: 'farmId' })
  listLosses(@CurrentUser() user: AuthUser, @Param('farmId') farmId: string) {
    return this.feedStockService.listLosses(user, farmId);
  }

  @Get('movements')
  @Roles(UserRole.PROPRIETAIRE, UserRole.ELEVEUR)
  @ApiOperation({
    summary: 'Journal des mouvements (consommations liées + pertes)',
  })
  @ApiParam({ name: 'farmId' })
  movements(@CurrentUser() user: AuthUser, @Param('farmId') farmId: string) {
    return this.feedStockService.listMovements(user, farmId);
  }
}
