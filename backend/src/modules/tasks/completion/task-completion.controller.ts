import { Body, Controller, Param, Post } from '@nestjs/common';
import { ApiOperation, ApiParam, ApiTags } from '@nestjs/swagger';
import { CurrentUser } from '../../../common/decorators/current-user.decorator.js';
import type { AuthUser } from '../../../common/decorators/current-user.decorator.js';
import { Roles } from '../../../common/decorators/roles.decorator.js';
import { Permissions } from '../../../common/decorators/permissions.decorator.js';
import { UserRole } from '../../../common/enums/role.enum.js';
import {
  Domain,
  InstitutionReadOnly,
} from '../../../common/decorators/domain.decorator.js';
import { CompleteTaskDto } from './complete-task.dto.js';
import { TaskCompletionService } from './task-completion.service.js';

@ApiTags('Tâches & équipe')
@Domain('TECHNIQUE')
@InstitutionReadOnly('Tâches de l’équipe')
@Controller('farms/:farmId/tasks')
export class TaskCompletionController {
  constructor(private readonly completion: TaskCompletionService) {}

  @Post(':taskId/complete')
  @Roles(UserRole.PROPRIETAIRE, UserRole.ELEVEUR)
  // The precise right depends on the task (vaccination: sanitaire, weighing:
  // saisie); it is checked in the service once the task is known.
  @Permissions(
    'sanitaire:gerer',
    'sanitaire:signaler',
    'saisie:creer',
    'equipe:taches',
  )
  @ApiOperation({
    summary:
      'Terminer une tâche : une tâche de vaccination/soin enregistre le soin (comme la route de réalisation), une tâche de pesée enregistre la pesée du lot ; idempotent (idempotencyKey)',
  })
  @ApiParam({ name: 'farmId' })
  @ApiParam({ name: 'taskId' })
  complete(
    @CurrentUser() user: AuthUser,
    @Param('farmId') farmId: string,
    @Param('taskId') taskId: string,
    @Body() dto: CompleteTaskDto,
  ) {
    return this.completion.complete(user, farmId, taskId, dto);
  }
}
