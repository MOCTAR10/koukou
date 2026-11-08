import { Body, Controller, Get, Param, Patch, Post, Query } from '@nestjs/common';
import { ApiOperation, ApiParam, ApiQuery, ApiTags } from '@nestjs/swagger';
import { CurrentUser } from '../../common/decorators/current-user.decorator.js';
import type { AuthUser } from '../../common/decorators/current-user.decorator.js';
import { AuditRead, AuditThirdPartyRead } from '../../common/decorators/audit.decorator.js';
import { Roles } from '../../common/decorators/roles.decorator.js';
import { Permissions } from '../../common/decorators/permissions.decorator.js';
import { UserRole } from '../../common/enums/role.enum.js';
import { CustomerType } from '../../common/enums/customer-type.enum.js';
import type { CustomerSegment } from './customers.service.js';
import { CustomersService } from './customers.service.js';
import { CreditService } from './credit.service.js';
import {
  CreateCustomerDto,
  CustomerPaymentDto,
  UpdateCustomerDto,
} from './dto/customer.dto.js';
import { Domain } from '../../common/decorators/domain.decorator.js';

@ApiTags('Finance — Clients (POS)')
@Domain('VENTES')
@Controller('farms/:farmId/customers')
export class CustomersController {
  constructor(
    private readonly customersService: CustomersService,
    private readonly credit: CreditService,
  ) {}

  @Get()
  @AuditRead('Liste des clients (données personnelles)')
  @Roles(UserRole.PROPRIETAIRE, UserRole.ELEVEUR)
  @ApiOperation({
    summary: 'Liste des clients avec solde à recouvrer',
  })
  @ApiParam({ name: 'farmId' })
  @ApiQuery({ name: 'search', required: false, description: 'Filtrer par nom ou téléphone' })
  @ApiQuery({ name: 'type', required: false, enum: CustomerType })
  @ApiQuery({ name: 'segment', required: false, enum: ['NOUVEAU', 'REGULIER', 'TOP'] })
  async list(
    @CurrentUser() user: AuthUser,
    @Param('farmId') farmId: string,
    @Query('search') search?: string,
    @Query('type') type?: CustomerType,
    @Query('segment') segment?: CustomerSegment,
  ) {
    const opts = {
      search: search?.trim() || undefined,
      type: type && Object.values(CustomerType).includes(type) ? type : undefined,
      segment: segment && ['NOUVEAU', 'REGULIER', 'TOP'].includes(segment) ? segment : undefined,
    };
    const customers = await this.customersService.listWithBalances(user, farmId, opts);
    const views = await this.credit.viewsFor(farmId, customers);
    // An unfiltered read refreshes the farm's overdue alert (a read-only
    // institution never writes).
    if (
      user.role !== UserRole.INSTITUTION &&
      !opts.search &&
      !opts.type &&
      !opts.segment
    ) {
      await this.credit.refreshOverdueAlert(farmId);
    }
    return customers.map((c) => ({ ...c, ...views.get(c.id) }));
  }

  @Get('summary')
  @AuditThirdPartyRead('Synthèse des clients d’une ferme')
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
  @AuditRead('Fiche client (données personnelles)')
  @Roles(UserRole.PROPRIETAIRE, UserRole.ELEVEUR)
  @ApiOperation({
    summary: 'Profil d\'un client (coordonnées + solde + segment)',
  })
  @ApiParam({ name: 'farmId' })
  async getOne(
    @CurrentUser() user: AuthUser,
    @Param('farmId') farmId: string,
    @Param('customerId') customerId: string,
  ) {
    const customer = await this.customersService.getOne(user, farmId, customerId);
    const views = await this.credit.viewsFor(farmId, [customer]);
    return { ...customer, ...views.get(customer.id) };
  }

  @Get(':customerId/history')
  @AuditRead('Historique d’achats d’un client')
  @Roles(UserRole.PROPRIETAIRE, UserRole.ELEVEUR)
  @ApiOperation({
    summary: 'Historique d\'achats d\'un client (articles + paiements)',
  })
  @ApiParam({ name: 'farmId' })
  async history(
    @CurrentUser() user: AuthUser,
    @Param('farmId') farmId: string,
    @Param('customerId') customerId: string,
  ) {
    const sales = await this.customersService.history(user, farmId, customerId);
    const customer = await this.customersService.getOne(user, farmId, customerId);
    // Statement: the due date and lateness of each invoice.
    const lines = await this.credit.statementOf(farmId, customer);
    return sales.map((s) => {
      const line = lines.get(s.id);
      return {
        ...s,
        dueDate: line?.dueDate ?? null,
        remainingFcfa: line?.remainingFcfa ?? 0,
        overdue: line?.overdue ?? false,
      };
    });
  }

  @Get(':customerId/stats')
  @AuditThirdPartyRead('Statistiques d’un client')
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
  @AuditThirdPartyRead('Solde d’un client')
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
  async recordPayment(
    @CurrentUser() user: AuthUser,
    @Param('farmId') farmId: string,
    @Param('customerId') customerId: string,
    @Body() dto: CustomerPaymentDto,
  ) {
    const result = await this.customersService.recordCustomerPayment(
      user,
      farmId,
      customerId,
      dto.amountFcfa,
      dto.idempotencyKey,
    );
    await this.credit.refreshOverdueAlert(farmId);
    return result;
  }
}