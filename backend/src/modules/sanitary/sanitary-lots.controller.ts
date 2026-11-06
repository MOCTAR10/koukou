import { Controller, Get, Param, Query } from '@nestjs/common';
import { ApiOperation, ApiParam, ApiQuery, ApiTags } from '@nestjs/swagger';
import {
  CurrentUser,
  type AuthUser,
} from '../../common/decorators/current-user.decorator.js';
import { Domain } from '../../common/decorators/domain.decorator.js';
import { Permissions } from '../../common/decorators/permissions.decorator.js';
import { Roles } from '../../common/decorators/roles.decorator.js';
import { UserRole } from '../../common/enums/role.enum.js';
import { SanitaryLotsService } from './sanitary-lots.service.js';

/**
 * The farm's bands for the sanitary screens (domain SANITAIRE): what the
 * veterinary services need to pick a band without TECHNIQUE rights.
 */
@ApiTags('Sanitaire & Prophylaxie')
@Domain('SANITAIRE')
@Roles(UserRole.PROPRIETAIRE, UserRole.ELEVEUR)
@Permissions('sanitaire:lecture', 'sanitaire:gerer', 'sanitaire:signaler')
@Controller('farms/:farmId/sanitary/lots')
export class SanitaryLotsController {
  constructor(private readonly lots: SanitaryLotsService) {}

  @Get()
  @ApiOperation({
    summary:
      'Bandes de la ferme pour le volet sanitaire (code, âge, effectif, bâtiment ; ?open=true : bandes non clôturées)',
  })
  @ApiParam({ name: 'farmId' })
  @ApiQuery({ name: 'open', required: false, type: Boolean })
  list(
    @CurrentUser() user: AuthUser,
    @Param('farmId') farmId: string,
    @Query('open') open?: string,
  ) {
    return this.lots.list(user, farmId, open === 'true');
  }
}
