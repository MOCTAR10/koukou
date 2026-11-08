import { Body, Controller, Get, Param, Post, Query } from '@nestjs/common';
import { ApiOperation, ApiParam, ApiTags } from '@nestjs/swagger';
import { CurrentUser } from '../../common/decorators/current-user.decorator.js';
import type { AuthUser } from '../../common/decorators/current-user.decorator.js';
import { Roles } from '../../common/decorators/roles.decorator.js';
import { Permissions } from '../../common/decorators/permissions.decorator.js';
import { UserRole } from '../../common/enums/role.enum.js';
import { pageOptions } from '../../common/utils/pagination.js';
import { FeedStockService } from './feed-stock.service.js';
import { CreateLossDto } from './dto/create-loss.dto.js';
import { Domain, InstitutionReadOnly } from '../../common/decorators/domain.decorator.js';
import { AuditThirdPartyRead } from '../../common/decorators/audit.decorator.js';

@ApiTags('Stock & Inventaire provende (Module 3)')
@Domain('INTRANTS')
@InstitutionReadOnly('Stock d’aliment (FEFO)')
@Controller('farms/:farmId/feed-stock')
export class FeedStockController {
  constructor(private readonly feedStockService: FeedStockService) {}

  @Get()
  @AuditThirdPartyRead('Stock d’aliment (FEFO) d’une ferme')
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
  @AuditThirdPartyRead('Pertes de stock d’une ferme')
  @Roles(UserRole.PROPRIETAIRE, UserRole.ELEVEUR)
  @ApiOperation({ summary: 'Lister les pertes de provende' })
  @ApiParam({ name: 'farmId' })
  listLosses(
    @CurrentUser() user: AuthUser,
    @Param('farmId') farmId: string,
    @Query('limit') limit?: string,
    @Query('offset') offset?: string,
  ) {
    return this.feedStockService.listLosses(
      user,
      farmId,
      pageOptions(limit, offset),
    );
  }

  @Get('movements')
  @AuditThirdPartyRead('Mouvements de stock d’une ferme')
  @Roles(UserRole.PROPRIETAIRE, UserRole.ELEVEUR)
  @ApiOperation({
    summary: 'Journal des mouvements (consommations liées + pertes)',
  })
  @ApiParam({ name: 'farmId' })
  movements(@CurrentUser() user: AuthUser, @Param('farmId') farmId: string) {
    return this.feedStockService.listMovements(user, farmId);
  }
}
