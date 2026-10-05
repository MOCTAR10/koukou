import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  Patch,
  Post,
} from '@nestjs/common';
import { ApiOperation, ApiParam, ApiTags } from '@nestjs/swagger';
import { CurrentUser } from '../../common/decorators/current-user.decorator.js';
import type { AuthUser } from '../../common/decorators/current-user.decorator.js';
import { Roles } from '../../common/decorators/roles.decorator.js';
import { Permissions } from '../../common/decorators/permissions.decorator.js';
import { UserRole } from '../../common/enums/role.enum.js';
import { CreateTaskDto } from './dto/create-task.dto.js';
import { UpdateTaskDto } from './dto/update-task.dto.js';
import { TasksService } from './tasks.service.js';

@ApiTags('Tâches & équipe')
@Controller('farms/:farmId/tasks')
export class TasksController {
  constructor(private readonly tasksService: TasksService) {}

  @Post()
  @Roles(UserRole.PROPRIETAIRE, UserRole.ELEVEUR)
  @Permissions('equipe:taches')
  @ApiOperation({
    summary:
      'Créer une tâche pour l’équipe (assignée à un membre, liée optionnellement à un lot).',
  })
  @ApiParam({ name: 'farmId' })
  create(
    @CurrentUser() user: AuthUser,
    @Param('farmId') farmId: string,
    @Body() dto: CreateTaskDto,
  ) {
    return this.tasksService.create(user, farmId, dto);
  }

  @Get()
  @Roles(UserRole.PROPRIETAIRE, UserRole.ELEVEUR)
  @ApiOperation({
    summary:
      'Lister les tâches (Propriétaire / Administrateur : toutes ; Éleveur : les siennes).',
  })
  @ApiParam({ name: 'farmId' })
  list(@CurrentUser() user: AuthUser, @Param('farmId') farmId: string) {
    return this.tasksService.list(user, farmId);
  }

  @Get(':taskId')
  @Roles(UserRole.PROPRIETAIRE, UserRole.ELEVEUR)
  @ApiOperation({ summary: 'Détail d’une tâche' })
  @ApiParam({ name: 'farmId' })
  getOne(
    @CurrentUser() user: AuthUser,
    @Param('farmId') farmId: string,
    @Param('taskId') taskId: string,
  ) {
    return this.tasksService.getOne(user, farmId, taskId);
  }

  @Patch(':taskId')
  @Roles(UserRole.PROPRIETAIRE, UserRole.ELEVEUR)
  @ApiOperation({
    summary:
      'Mettre à jour (Propriétaire / Administrateur habilité : tout ; Éleveur : statut de ses tâches uniquement).',
  })
  @ApiParam({ name: 'farmId' })
  update(
    @CurrentUser() user: AuthUser,
    @Param('farmId') farmId: string,
    @Param('taskId') taskId: string,
    @Body() dto: UpdateTaskDto,
  ) {
    return this.tasksService.update(user, farmId, taskId, dto);
  }

  @Delete(':taskId')
  @Roles(UserRole.PROPRIETAIRE, UserRole.ELEVEUR)
  @Permissions('equipe:taches')
  @ApiOperation({ summary: 'Supprimer une tâche' })
  @ApiParam({ name: 'farmId' })
  remove(
    @CurrentUser() user: AuthUser,
    @Param('farmId') farmId: string,
    @Param('taskId') taskId: string,
  ) {
    return this.tasksService.remove(user, farmId, taskId);
  }
}
