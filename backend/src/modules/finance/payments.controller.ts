import { pageOptions } from '../../common/utils/pagination.js';
import { Controller, Get, Param, Query } from '@nestjs/common';
import { ApiOperation, ApiParam, ApiQuery, ApiTags } from '@nestjs/swagger';
import { CurrentUser } from '../../common/decorators/current-user.decorator.js';
import type { AuthUser } from '../../common/decorators/current-user.decorator.js';
import { Roles } from '../../common/decorators/roles.decorator.js';
import { UserRole } from '../../common/enums/role.enum.js';
import { FarmsService } from '../farms/farms.service.js';
import { PaymentsService } from './payments.service.js';
import { Domain } from '../../common/decorators/domain.decorator.js';
import { AuditThirdPartyRead } from '../../common/decorators/audit.decorator.js';

@ApiTags('Finance — Paiements')
@Domain('VENTES')
@Controller('farms/:farmId/payments')
export class PaymentsController {
  constructor(private readonly paymentsService: PaymentsService) {}

  @Get()
  @AuditThirdPartyRead('Encaissements d’une ferme')
  @Roles(UserRole.PROPRIETAIRE, UserRole.ELEVEUR)
  @ApiOperation({
    summary: 'Historique des paiements (statut CONFIRMED = encaissé)',
  })
  @ApiParam({ name: 'farmId' })
  @ApiQuery({ name: 'from', required: false, example: '2026-08-01' })
  @ApiQuery({ name: 'to', required: false, example: '2026-08-31' })
  list(
    @CurrentUser() user: AuthUser,
    @Param('farmId') farmId: string,
    @Query('from') from?: string,
    @Query('to') to?: string,
    @Query('saleId') saleId?: string,
    @Query('limit') limit?: string,
    @Query('offset') offset?: string,
  ) {
    return this.paymentsService.listPayments(
      user,
      farmId,
      from,
      to,
      saleId,
      pageOptions(limit, offset),
    );
  }
}

@ApiTags('Finance — Méthodes de paiement')
@Domain('VENTES')
@Controller('farms/:farmId/payment-methods')
export class PaymentMethodsController {
  constructor(
    private readonly paymentsService: PaymentsService,
    private readonly farmsService: FarmsService,
  ) {}

  @Get()
  @Roles(UserRole.PROPRIETAIRE, UserRole.ELEVEUR)
  @ApiOperation({
    summary:
      'Méthodes de paiement du POS (CASH activé ; Mobile Money / QR « Bientôt disponible »)',
  })
  @ApiParam({ name: 'farmId' })
  async methods(
    @CurrentUser() user: AuthUser,
    @Param('farmId') farmId: string,
  ) {
    await this.farmsService.assertAccessible(user, farmId);
    return this.paymentsService.listPaymentMethods();
  }
}
