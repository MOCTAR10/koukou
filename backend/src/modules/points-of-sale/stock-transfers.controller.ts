import { Body, Controller, Get, Param, Post, Query } from '@nestjs/common';
import { ApiOperation, ApiParam, ApiQuery, ApiTags } from '@nestjs/swagger';
import { CurrentUser } from '../../common/decorators/current-user.decorator.js';
import type { AuthUser } from '../../common/decorators/current-user.decorator.js';
import { Roles } from '../../common/decorators/roles.decorator.js';
import { UserRole } from '../../common/enums/role.enum.js';
import { StockTransferProductType } from '../../common/enums/stock-transfer-product-type.enum.js';
import { StockTransfersService } from './stock-transfers.service.js';
import { CreateStockTransferDto } from './dto/stock-transfer.dto.js';

@ApiTags('Stock & transferts')
@Controller('farms/:farmId/stock-transfers')
@Roles(UserRole.PROPRIETAIRE, UserRole.ELEVEUR)
export class StockTransfersController {
  constructor(private readonly transfersService: StockTransfersService) {}

  @Get()
  @ApiOperation({
    summary:
      'Liste des transferts ferme → boutique (filtrable par point de vente et type de produit).',
  })
  @ApiParam({ name: 'farmId' })
  @ApiQuery({ name: 'pointOfSaleId', required: false })
  @ApiQuery({ name: 'productType', required: false, enum: StockTransferProductType })
  list(
    @CurrentUser() user: AuthUser,
    @Param('farmId') farmId: string,
    @Query('pointOfSaleId') pointOfSaleId?: string,
    @Query('productType') productType?: StockTransferProductType,
  ) {
    return this.transfersService.list(user, farmId, pointOfSaleId, productType);
  }

  @Post()
  @ApiOperation({
    summary:
      'Déplacer du stock de la ferme vers une boutique (carcasses, œufs ou provende).',
  })
  @ApiParam({ name: 'farmId' })
  create(
    @CurrentUser() user: AuthUser,
    @Param('farmId') farmId: string,
    @Body() dto: CreateStockTransferDto,
  ) {
    return this.transfersService.create(user, farmId, dto);
  }

  @Post(':transferId/cancel')
  @ApiOperation({
    summary:
      'Annuler un transfert : les invendus reviennent au stock de la ferme (retour boutique → ferme).',
  })
  @ApiParam({ name: 'farmId' })
  @ApiParam({ name: 'transferId' })
  cancel(
    @CurrentUser() user: AuthUser,
    @Param('farmId') farmId: string,
    @Param('transferId') transferId: string,
  ) {
    return this.transfersService.cancel(user, farmId, transferId);
  }
}