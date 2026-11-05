import { Controller, Get, Param, Query } from '@nestjs/common';
import { ApiOperation, ApiParam, ApiQuery, ApiTags } from '@nestjs/swagger';
import { CurrentUser } from '../../common/decorators/current-user.decorator.js';
import { Domain } from '../../common/decorators/domain.decorator.js';
import type { AuthUser } from '../../common/decorators/current-user.decorator.js';
import { Roles } from '../../common/decorators/roles.decorator.js';
import { UserRole } from '../../common/enums/role.enum.js';
import { SyncService } from './sync.service.js';

@ApiTags('Synchronisation hors ligne (POUFA)')
@Domain('TECHNIQUE')
@Controller('farms/:farmId/sync-conflicts')
export class SyncController {
  constructor(private readonly sync: SyncService) {}

  @Get()
  @Roles(UserRole.PROPRIETAIRE, UserRole.ELEVEUR)
  @ApiOperation({
    summary:
      'Conflits de synchronisation de la ferme (valeur perdante conservée, la saisie la plus récente gagne)',
  })
  @ApiParam({ name: 'farmId' })
  @ApiQuery({ name: 'batchId', required: false })
  list(
    @CurrentUser() user: AuthUser,
    @Param('farmId') farmId: string,
    @Query('batchId') batchId?: string,
  ) {
    return this.sync.list(user, farmId, batchId);
  }
}
