import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { In, LessThan, Not, Repository } from 'typeorm';
import { AuthUser } from '../../common/decorators/current-user.decorator.js';
import { AlertKind, AlertLevel } from '../../common/enums/alert-level.enum.js';
import { TaskStatus } from '../../common/enums/task-status.enum.js';
import { FarmStaffRole } from '../../common/enums/farm-staff-role.enum.js';
import { AlertsService } from '../alerts/alerts.service.js';
import { ProductionBatch } from '../batches/entities/production-batch.entity.js';
import { FarmEmployee } from '../farms/entities/farm-employee.entity.js';
import { FarmsService } from '../farms/farms.service.js';
import { FarmTask } from './entities/farm-task.entity.js';
import { CreateTaskDto } from './dto/create-task.dto.js';
import { UpdateTaskDto } from './dto/update-task.dto.js';

@Injectable()
export class TasksService {
  constructor(
    @InjectRepository(FarmTask)
    private readonly taskRepo: Repository<FarmTask>,
    @InjectRepository(FarmEmployee)
    private readonly employeeRepo: Repository<FarmEmployee>,
    @InjectRepository(ProductionBatch)
    private readonly batchRepo: Repository<ProductionBatch>,
    private readonly farmsService: FarmsService,
    private readonly alertsService: AlertsService,
  ) {}

  async create(user: AuthUser, farmId: string, dto: CreateTaskDto) {
    await this.farmsService.assertAccessible(user, farmId);
    await this.assertAssignable(farmId, dto.assigneeId ?? null);
    await this.assertBatchInFarm(farmId, dto.batchId ?? null);

    const task = this.taskRepo.create({
      farmId,
      title: dto.title,
      notes: dto.notes ?? null,
      dueDate: dto.dueDate,
      assigneeId: dto.assigneeId ?? null,
      batchId: dto.batchId ?? null,
      status: TaskStatus.A_FAIRE,
      createdById: user.id,
    });
    await this.taskRepo.save(task);
    await this.refreshOverdueAlerts(farmId);
    return task;
  }

  async list(user: AuthUser, farmId: string): Promise<FarmTask[]> {
    await this.farmsService.assertAccessible(user, farmId);
    const resolution = await this.farmsService.resolveEffectivePermissions(
      user,
      farmId,
    );
    // Éleveur Koukou : uniquement ses propres tâches ; Propriétaire /
    // Administrateur : toutes les tâches de l'équipe.
    const onlyMine =
      resolution !== 'ALL' && resolution?.role === FarmStaffRole.ELEVEUR;
    const where = {
      farmId,
      ...(onlyMine ? { assigneeId: user.id } : {}),
    };
    return this.taskRepo.find({
      where,
      order: { dueDate: 'ASC', createdAt: 'DESC' },
    });
  }

  async getOne(
    user: AuthUser,
    farmId: string,
    taskId: string,
  ): Promise<FarmTask> {
    const task = await this.getScoped(user, farmId, taskId);
    return task;
  }

  async update(
    user: AuthUser,
    farmId: string,
    taskId: string,
    dto: UpdateTaskDto,
  ): Promise<FarmTask> {
    const task = await this.getScoped(user, farmId, taskId);
    const resolution = await this.farmsService.resolveEffectivePermissions(
      user,
      farmId,
    );
    const isManager =
      resolution === 'ALL' ||
      (resolution !== null &&
        resolution.role === FarmStaffRole.ADMIN &&
        resolution.permissions.has('equipe:taches'));

    if (!isManager) {
      const editableFields = ['status'] as const;
      const requested = Object.keys(dto).filter(
        (k) => (dto as Record<string, unknown>)[k] !== undefined,
      );
      const forbidden = requested.filter(
        (k) => !editableFields.includes(k as (typeof editableFields)[number]),
      );
      if (forbidden.length > 0) {
        throw new ForbiddenException(
          'Un membre terraine ne peut modifier que le statut de ses propres tâches.',
        );
      }
      if (task.assigneeId !== user.id) {
        throw new ForbiddenException(
          'Accès refusé : vous ne pouvez modifier que les tâches qui vous sont assignées.',
        );
      }
    }

    if (dto.title !== undefined) task.title = dto.title;
    if (dto.dueDate !== undefined) task.dueDate = dto.dueDate;
    if (dto.notes !== undefined) task.notes = dto.notes ?? null;
    if (dto.status !== undefined) task.status = dto.status;

    if (isManager) {
      if (dto.assigneeId !== undefined) {
        await this.assertAssignable(farmId, dto.assigneeId ?? null);
        task.assigneeId = dto.assigneeId ?? null;
      }
      if (dto.batchId !== undefined) {
        await this.assertBatchInFarm(farmId, dto.batchId ?? null);
        task.batchId = dto.batchId ?? null;
      }
    }

    if (task.status === TaskStatus.FAIT) {
      task.completedAt = task.completedAt ?? new Date();
    } else {
      task.completedAt = null;
    }

    await this.taskRepo.save(task);
    await this.refreshOverdueAlerts(farmId);
    return task;
  }

  async remove(user: AuthUser, farmId: string, taskId: string): Promise<void> {
    const task = await this.getScoped(user, farmId, taskId);
    const resolution = await this.farmsService.resolveEffectivePermissions(
      user,
      farmId,
    );
    const isManager =
      resolution === 'ALL' ||
      (resolution !== null &&
        resolution.role === FarmStaffRole.ADMIN &&
        resolution.permissions.has('equipe:taches'));
    if (!isManager) {
      throw new ForbiddenException(
        'Seul le Propriétaire (ou un Administrateur habilité) peut supprimer une tâche.',
      );
    }
    await this.taskRepo.remove(task);
    await this.refreshOverdueAlerts(farmId);
  }

  private async getScoped(
    user: AuthUser,
    farmId: string,
    taskId: string,
  ): Promise<FarmTask> {
    await this.farmsService.assertAccessible(user, farmId);
    const task = await this.taskRepo.findOne({ where: { id: taskId, farmId } });
    if (!task)
      throw new NotFoundException('Tâche introuvable dans cette ferme.');
    const resolution = await this.farmsService.resolveEffectivePermissions(
      user,
      farmId,
    );
    if (
      resolution !== 'ALL' &&
      (resolution === null || resolution.role === FarmStaffRole.ELEVEUR) &&
      task.assigneeId !== user.id
    ) {
      throw new ForbiddenException(
        'Accès refusé : vous ne pouvez accéder qu’aux tâches qui vous sont assignées.',
      );
    }
    return task;
  }

  private async assertAssignable(
    farmId: string,
    assigneeId: string | null,
  ): Promise<void> {
    if (!assigneeId) return;
    const link = await this.employeeRepo.findOne({
      where: { farmId, userId: assigneeId },
    });
    if (!link) {
      throw new BadRequestException(
        'Le membre assigné n’est pas rattaché à cette ferme.',
      );
    }
  }

  private async assertBatchInFarm(
    farmId: string,
    batchId: string | null,
  ): Promise<void> {
    if (!batchId) return;
    const batch = await this.batchRepo.findOne({
      where: { id: batchId, farmId },
    });
    if (!batch) {
      throw new BadRequestException('Lot introuvable dans cette ferme.');
    }
  }

  private async refreshOverdueAlerts(farmId: string): Promise<void> {
    const today = new Date().toISOString().slice(0, 10);
    const overdue = await this.taskRepo.count({
      where: {
        farmId,
        dueDate: LessThan(today),
        status: Not(In([TaskStatus.FAIT, TaskStatus.ANNULEE])),
      },
    });
    if (overdue > 0) {
      await this.alertsService.raise(
        {
          kind: AlertKind.TACHE,
          level: AlertLevel.ROUGE,
          message: `${overdue} tâche(s) de l’équipe sont en retard sur l’échéance prévue.`,
          recommendation:
            'Consulter la liste des tâches, réassigner ou reporter l’échéance, puis notifier l’éleveur concerné.',
        },
        { farmId, batchId: null },
      );
    } else {
      await this.alertsService.clearKind(farmId, null, AlertKind.TACHE);
    }
  }
}
