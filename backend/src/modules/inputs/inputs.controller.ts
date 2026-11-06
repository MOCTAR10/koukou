import { AuditThirdPartyRead } from '../../common/decorators/audit.decorator.js';
import { Body, Controller, Get, Param, Post } from '@nestjs/common';
import { ApiOperation, ApiTags } from '@nestjs/swagger';
import { CurrentUser } from '../../common/decorators/current-user.decorator.js';
import type { AuthUser } from '../../common/decorators/current-user.decorator.js';
import { Roles } from '../../common/decorators/roles.decorator.js';
import { Permissions } from '../../common/decorators/permissions.decorator.js';
import { UserRole } from '../../common/enums/role.enum.js';
import { FeedStockService } from '../feed-stock/feed-stock.service.js';
import { InputsService } from './inputs.service.js';
import { CreateInputLotDto } from './dto/create-input-lot.dto.js';
import { Domain, InstitutionReadOnly } from '../../common/decorators/domain.decorator.js';

@ApiTags('Traçabilité HACCP (Intrants)')
@Domain('INTRANTS')
@InstitutionReadOnly('Réceptions de stock')
@Controller('farms/:farmId/inputs')
export class InputsController {
  constructor(
    private readonly inputsService: InputsService,
    private readonly feedStockService: FeedStockService,
  ) {}

  @Post()
  @Roles(UserRole.PROPRIETAIRE, UserRole.ELEVEUR)
  @Permissions('stock:gerer')
  @ApiOperation({
    summary: 'Enregistrer un intrant (aliment / poussins / médicament)',
  })
  async create(
    @CurrentUser() user: AuthUser,
    @Param('farmId') farmId: string,
    @Body() dto: CreateInputLotDto,
  ) {
    const lot = await this.inputsService.create(user, {
      ...dto,
      farmId,
    });
    await this.feedStockService.evaluateStockAlerts(farmId);
    return lot;
  }

  @Get()
  @AuditThirdPartyRead('Réceptions de stock d’une ferme (prix, fournisseurs)')
  @Roles(UserRole.PROPRIETAIRE, UserRole.ELEVEUR)
  @ApiOperation({ summary: 'Lister les intrants de la ferme (traçabilité)' })
  list(@CurrentUser() user: AuthUser, @Param('farmId') farmId: string) {
    return this.inputsService.listForFarm(user, farmId);
  }
}
