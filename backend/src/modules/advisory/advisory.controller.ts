import { Controller, Get, Param } from '@nestjs/common';
import { ApiOperation, ApiParam, ApiTags } from '@nestjs/swagger';
import { CurrentUser } from '../../common/decorators/current-user.decorator.js';
import type { AuthUser } from '../../common/decorators/current-user.decorator.js';
import { Roles } from '../../common/decorators/roles.decorator.js';
import { UserRole } from '../../common/enums/role.enum.js';
import { AdvisoryService } from './advisory.service.js';
import { Domain } from '../../common/decorators/domain.decorator.js';

@ApiTags('Assistant de ferme (actions prioritaires)')
@Domain('TECHNIQUE')
@Controller('farms/:farmId/advisory')
export class AdvisoryController {
  constructor(private readonly advisoryService: AdvisoryService) {}

  @Get('next-actions')
  @Roles(UserRole.PROPRIETAIRE, UserRole.ELEVEUR)
  @ApiOperation({
    summary:
      'Actions prioritaires du jour (next-actions) : alertes actives, saisies manquantes, soins planifiés, stock de provende, lots en vente — triées ROUGE → JAUNE puis par échéance.',
  })
  @ApiParam({ name: 'farmId' })
  nextActions(
    @CurrentUser() user: AuthUser,
    @Param('farmId') farmId: string,
  ) {
    return this.advisoryService.composeNextActions(user, farmId);
  }
}