import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  Logger,
  NotFoundException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { In, Repository } from 'typeorm';
import { AuthUser } from '../../../common/decorators/current-user.decorator.js';
import type { PermissionCode } from '../../../common/permissions/permission-catalog.js';
import { TaskSource } from '../../../common/enums/task-source.enum.js';
import { TaskStatus } from '../../../common/enums/task-status.enum.js';
import { todayLocal } from '../../../common/utils/date.utils.js';
import { BatchesService } from '../../batches/batches.service.js';
import { DailyEntriesService } from '../../daily-entries/daily-entries.service.js';
import { FarmsService } from '../../farms/farms.service.js';
import { ProphylaxisEvent } from '../../sanitary/entities/prophylaxis-event.entity.js';
import { SanitaryService } from '../../sanitary/sanitary.service.js';
import { FarmTask } from '../entities/farm-task.entity.js';
import { TasksService } from '../tasks.service.js';
import { CompleteTaskDto } from './complete-task.dto.js';

/** Rights asked to record the data a task stands for (any one of them). */
const RIGHTS: Partial<Record<TaskSource, PermissionCode[]>> = {
  [TaskSource.PROGRAMME_VACCIN]: ['sanitaire:gerer', 'sanitaire:signaler'],
  [TaskSource.PESEE]: ['saisie:creer'],
};

/**
 * « Terminer » on a generated task: the data is recorded by the services that
 * own it (care completion, daily entry), with their validation, then the task
 * closes by the same sync that closes it when the data is recorded directly.
 */
@Injectable()
export class TaskCompletionService {
  private readonly logger = new Logger(TaskCompletionService.name);

  constructor(
    @InjectRepository(FarmTask)
    private readonly taskRepo: Repository<FarmTask>,
    @InjectRepository(ProphylaxisEvent)
    private readonly eventRepo: Repository<ProphylaxisEvent>,
    private readonly farmsService: FarmsService,
    private readonly tasksService: TasksService,
    private readonly sanitary: SanitaryService,
    private readonly entries: DailyEntriesService,
    private readonly batches: BatchesService,
  ) {}

  async complete(
    user: AuthUser,
    farmId: string,
    taskId: string,
    dto: CompleteTaskDto,
  ): Promise<FarmTask> {
    // Same scoping as every task read (404 / 403).
    const task = await this.tasksService.getOne(user, farmId, taskId);
    const key = dto.idempotencyKey?.trim() || null;

    if (task.status === TaskStatus.ANNULEE) {
      throw new BadRequestException('Cette tâche est annulée.');
    }
    if (task.status === TaskStatus.FAIT) {
      // Offline replay: the data was recorded the first time.
      if (key) return task;
      throw new BadRequestException('Cette tâche est déjà terminée.');
    }

    const rights = RIGHTS[task.source];
    if (!rights) {
      // Manual task or cleaning: nothing to record on the lot.
      return this.tasksService.update(user, farmId, taskId, {
        status: TaskStatus.FAIT,
      });
    }
    await this.assertRights(user, farmId, rights);
    if (!task.batchId || !task.stepId) {
      throw new BadRequestException('Tâche sans lot : rien à enregistrer.');
    }

    if (task.source === TaskSource.PROGRAMME_VACCIN) {
      const event = await this.eventRepo.findOne({
        where: { id: task.stepId, batchId: task.batchId, farmId },
      });
      if (!event) {
        throw new NotFoundException('Le soin de cette tâche n’existe plus.');
      }
      // Same service and validation as the manual endpoint (headcount ≤ live…).
      await this.sanitary.completeEvent(
        user,
        farmId,
        task.batchId,
        event.id,
        dto,
      );
    } else {
      if (dto.avgWeightKg == null) {
        throw new BadRequestException(
          'Pesée : indiquez le poids moyen du lot (kg).',
        );
      }
      await this.entries.create(user, farmId, task.batchId, {
        entryDate: dto.entryDate ?? todayLocal(),
        avgWeightKg: dto.avgWeightKg,
        sampleSize: dto.sampleSize,
      });
      try {
        await this.batches.runAdvisoryForBatch(task.batchId);
      } catch (err) {
        this.logger.error(
          `Pesée enregistrée, conseils en échec : ${(err as Error).message}`,
        );
      }
    }

    // The data hooks already closed the task (sync); an early weighing outside
    // the tolerance still closes the task it was entered for.
    await this.taskRepo.update(
      { id: task.id, status: In([TaskStatus.A_FAIRE, TaskStatus.EN_COURS]) },
      { status: TaskStatus.FAIT, completedAt: new Date() },
    );
    return this.tasksService.getOne(user, farmId, taskId);
  }

  private async assertRights(
    user: AuthUser,
    farmId: string,
    codes: PermissionCode[],
  ): Promise<void> {
    const resolution = await this.farmsService.resolveEffectivePermissions(
      user,
      farmId,
    );
    if (resolution === 'ALL') return;
    if (resolution && codes.some((c) => resolution.permissions.has(c))) return;
    throw new ForbiddenException(
      'Vous n’avez pas le droit d’enregistrer cette opération.',
    );
  }
}
