import { Body, Controller, Get, Param, Patch, Post, Query } from '@nestjs/common';
import { ApiOperation, ApiParam, ApiQuery, ApiTags } from '@nestjs/swagger';
import { CurrentUser } from '../../common/decorators/current-user.decorator.js';
import type { AuthUser } from '../../common/decorators/current-user.decorator.js';
import { Roles } from '../../common/decorators/roles.decorator.js';
import { Permissions } from '../../common/decorators/permissions.decorator.js';
import { UserRole } from '../../common/enums/role.enum.js';
import { CustomerType } from '../../common/enums/customer-type.enum.js';
import type { CustomerSegment } from './customers.service.js';
import { CustomersService } from './customers.service.js';
import {
  CreateCustomerDto,
  CustomerPaymentDto,
  UpdateCustomerDto,
} from './dto/customer.dto.js';

@ApiTags('Finance — Clients (POS)')
@Controller('farms/:farmId/customers')
export class CustomersController {
  constructor(private readonly customersService: CustomersService) {}

  @Get()
  @Roles(UserRole.PROPRIETAIRE, UserRole.ELEVEUR)
  @ApiOperation({
    summary: 'Liste des clients avec solde à recouvrer',
  })
  @ApiParam({ name: 'farmId' })
  @ApiQuery({ name: 'search', required: false, description: 'Filtrer par nom ou téléphone' })
  @ApiQuery({ name: 'type', required: false, enum: CustomerType })
  @ApiQuery({ name: 'segment', required: false, enum: ['NOUVEAU', 'REGULIER', 'TOP'] })
  list(
    @CurrentUser() user: AuthUser,
    @Param('farmId') farmId: string,
    @Query('search') search?: string,
    @Query('type') type?: CustomerType,
    @Query('segment') segment?: CustomerSegment,
  ) {
    return this.customersService.listWithBalances(user, farmId, {
      search: search?.trim() || undefined,
      type: type && Object.values(CustomerType).includes(type) ? type : undefined,
      segment: segment && ['NOUVEAU', 'REGULIER', 'TOP'].includes(segment) ? segment : undefined,
    });
  }

  @Get('summary')
  @Roles(UserRole.PROPRIETAIRE, UserRole.ELEVEUR)
  @ApiOperation({ summary: 'Résumé clients : compteurs par type et segment' })
  @ApiParam({ name: 'farmId' })
  summary(@CurrentUser() user: AuthUser, @Param('farmId') farmId: string) {
    return this.customersService.summary(user, farmId);
  }

  @Post()
  @Roles(UserRole.PROPRIETAIRE, UserRole.ELEVEUR)
  @Permissions('compta:client')
  @ApiOperation({ summary: 'Créer un client (comptoir ou crédit)' })
  @ApiParam({ name: 'farmId' })
  create(
    @CurrentUser() user: AuthUser,
    @Param('farmId') farmId: string,
    @Body() dto: CreateCustomerDto,
  ) {
    return this.customersService.create(user, farmId, dto);
  }

  @Patch(':customerId')
  @Roles(UserRole.PROPRIETAIRE, UserRole.ELEVEUR)
  @Permissions('compta:client')
  @ApiOperation({ summary: 'Modifier un client' })
  @ApiParam({ name: 'farmId' })
  update(
    @CurrentUser() user: AuthUser,
    @Param('farmId') farmId: string,
    @Param('customerId') customerId: string,
    @Body() dto: UpdateCustomerDto,
  ) {
    return this.customersService.update(user, farmId, customerId, dto);
  }

  @Get(':customerId')
  @Roles(UserRole.PROPRIETAIRE, UserRole.ELEVEUR)
  @ApiOperation({
    summary: 'Profil d\'un client (coordonnées + solde + segment)',
  })
  @ApiParam({ name: 'farmId' })
  getOne(
    @CurrentUser() user: AuthUser,
    @Param('farmId') farmId: string,
    @Param('customerId') customerId: string,
  ) {
    return this.customersService.getOne(user, farmId, customerId);
  }

  @Get(':customerId/history')
  @Roles(UserRole.PROPRIETAIRE, UserRole.ELEVEUR)
  @ApiOperation({
    summary: 'Historique d\'achats d\'un client (articles + paiements)',
  })
  @ApiParam({ name: 'farmId' })
  history(
    @CurrentUser() user: AuthUser,
    @Param('farmId') farmId: string,
    @Param('customerId') customerId: string,
  ) {
    return this.customersService.history(user, farmId, customerId);
  }

  @Get(':customerId/stats')
  @Roles(UserRole.PROPRIETAIRE, UserRole.ELEVEUR)
  @ApiOperation({
    summary: 'Statistiques d\'un client (visites, dépenses, favoris, segment)',
  })
  @ApiParam({ name: 'farmId' })
  stats(
    @CurrentUser() user: AuthUser,
    @Param('farmId') farmId: string,
    @Param('customerId') customerId: string,
  ) {
    return this.customersService.stats(user, farmId, customerId);
  }

  @Get(':customerId/balance')
  @Roles(UserRole.PROPRIETAIRE, UserRole.ELEVEUR)
  @ApiOperation({
    summary: 'Solde à recouvrer d\'un client (crédit octroyé)',
  })
  @ApiParam({ name: 'farmId' })
  balance(
    @CurrentUser() user: AuthUser,
    @Param('farmId') farmId: string,
    @Param('customerId') customerId: string,
  ) {
    return this.customersService.getBalance(user, farmId, customerId);
  }

  @Post(':customerId/payments')
  @Roles(UserRole.PROPRIETAIRE, UserRole.ELEVEUR)
  @Permissions('compta:client')
  @ApiOperation({
    summary: 'Encaisser depuis la fiche client (répartit sur les ventes impayées)',
  })
  @ApiParam({ name: 'farmId' })
  recordPayment(
    @CurrentUser() user: AuthUser,
    @Param('farmId') farmId: string,
    @Param('customerId') customerId: string,
    @Body() dto: CustomerPaymentDto,
  ) {
    return this.customersService.recordCustomerPayment(
      user,
      farmId,
      customerId,
      dto.amountFcfa,
      dto.idempotencyKey,
    );
  }
}