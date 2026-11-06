import { Body, Controller, Get, Param, Patch, Post, Query } from '@nestjs/common';
import { ApiOperation, ApiTags } from '@nestjs/swagger';
import {
  CurrentUser,
  type AuthUser,
} from '../../common/decorators/current-user.decorator.js';
import { Domain } from '../../common/decorators/domain.decorator.js';
import { Roles } from '../../common/decorators/roles.decorator.js';
import { UserRole } from '../../common/enums/role.enum.js';
import {
  CreateOperatorDto,
  ListOperatorsQueryDto,
  UpdateOperatorDto,
} from './dto/operator.dto.js';
import { OperatorsService } from './operators.service.js';

/**
 * Operators registry (CDC « Registre des opérateurs », common to the
 * programme). Same access design as the configurable lists: reading active
 * operators is reference data (REFERENCE: every programme account, and the
 * farms, which pick the operator of a cession); writes are ADMINISTRATION
 * (CREER / MODIFIER), national scope only (`OperatorsService`). Inactive
 * operators (`?all=true`) stay with the administration and traceability
 * profiles.
 */
@ApiTags('Traçabilité')
@Domain('ADMINISTRATION')
@Controller('trace/operators')
export class OperatorsController {
  constructor(private readonly operators: OperatorsService) {}

  @Get()
  @Domain('REFERENCE')
  @Roles(UserRole.PLATFORM_ADMIN, UserRole.PROPRIETAIRE, UserRole.ELEVEUR)
  @ApiOperation({
    summary:
      'Opérateurs du programme (actifs ; ?all=true : désactivés inclus, administration)',
  })
  list(@CurrentUser() user: AuthUser, @Query() query: ListOperatorsQueryDto) {
    return this.operators.list(user, query);
  }

  @Get(':id')
  @Domain('REFERENCE')
  @Roles(UserRole.PLATFORM_ADMIN, UserRole.PROPRIETAIRE, UserRole.ELEVEUR)
  @ApiOperation({ summary: "Fiche d'un opérateur" })
  get(@CurrentUser() user: AuthUser, @Param('id') id: string) {
    return this.operators.get(user, id);
  }

  @Post()
  @Roles(UserRole.PLATFORM_ADMIN)
  @ApiOperation({
    summary: 'Ajouter un opérateur (code OP-0001 attribué, jamais réutilisé)',
  })
  create(@CurrentUser() user: AuthUser, @Body() dto: CreateOperatorDto) {
    return this.operators.create(user, dto);
  }

  @Patch(':id')
  @Roles(UserRole.PLATFORM_ADMIN)
  @ApiOperation({
    summary:
      'Modifier un opérateur (type, nom, localité, contact, convention, activation ; le code ne change jamais)',
  })
  update(
    @CurrentUser() user: AuthUser,
    @Param('id') id: string,
    @Body() dto: UpdateOperatorDto,
  ) {
    return this.operators.update(user, id, dto);
  }
}
