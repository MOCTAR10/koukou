import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  Logger,
  NotFoundException,
  OnApplicationBootstrap,
  OnModuleDestroy,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { In, LessThan, Not, Repository } from 'typeorm';
import { AuthUser } from '../../common/decorators/current-user.decorator.js';
import {
  AlertKind,
  AlertLevel,
  AlertStatus,
} from '../../common/enums/alert-level.enum.js';
import { TaskStatus } from '../../common/enums/task-status.enum.js';
import {
  KOUKOU_EVENTS,
  koukouBus,
  TaskAssignedEvent,
  TasksOverdueEvent,
} from '../../common/utils/event-bus.js';
import { FarmStaffRole } from '../../common/enums/farm-staff-role.enum.js';
import { AlertsService } from '../alerts/alerts.service.js';
import { ProductionBatch } from '../batches/entities/production-batch.entity.js';
import { FarmEmployee } from '../farms/entities/farm-employee.entity.js';
import { FarmsService } from '../farms/farms.service.js';
import { FarmTask } from './entities/farm-task.entity.js';
import { CreateTaskDto } from './dto/create-task.dto.js';
import { UpdateTaskDto } from './dto/update-task.dto.js';

const SWEEP_INTERVAL_MS = 60 * 60 * 1000;
/** Tasks overdue for longer than this are marked notified without a push. */
const OVERDUE_PUSH_MAX_DAYS = 7;

/** Due dates are compared in UTC, like every other date in the backend. */
function todayUtc(): string {
  return new Date().toISOString().slice(0, 10);
}

@Injectable()
export class TasksService implements OnApplicationBootstrap, OnModuleDestroy {
  private readonly logger = new Logger(TasksService.name);
  private sweepTimer: NodeJS.Timeout | null = null;
  private sweeping = false;

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
    this.emitAssigned(task, user.id);
    await this.refreshOverdueAlerts(farmId);
    return task;
  }

  async list(user: AuthUser, farmId: string): Promise<FarmTask[]> {
    await this.farmsService.assertAccessible(user, farmId);
    const resolution = await this.farmsService.resolveEffectivePermissions(
      user,
      farmId,
    );
    // Éleveur Fermia : uniquement ses propres tâches ; Propriétaire /
    // Administrateur : toutes les tâches de l'équipe.
    const onlyMine =
      resolution !== 'ALL' && resolution?.role === FarmStaffRole.ELEVEUR;
    const where = {
      farmId,
      ...(onlyMine ? { assigneeId: user.id } : {}),
    };
    // Opening the list reflects tasks that went overdue since the last sweep.
    await this.refreshOverdueAlerts(farmId);
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

    const previousAssignee = task.assigneeId;
    if (dto.title !== undefined) task.title = dto.title;
    if (dto.dueDate !== undefined && dto.dueDate !== task.dueDate) {
      task.dueDate = dto.dueDate;
      task.overdueNotifiedAt = null;
    }
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
    if (task.assigneeId !== previousAssignee) this.emitAssigned(task, user.id);
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
    if (!link.active) {
      throw new BadRequestException(
        'Ce membre est suspendu : il ne peut pas recevoir de tâche.',
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

  /**
   * Overdue sweep: a task passes its due date without any mutation, so the
   * TACHE alert can't rely on create/update/delete only. Runs at boot, then
   * hourly, over every farm with an overdue open task or an open TACHE
   * alert (to resolve it once nothing is late anymore).
   */
  async sweepOverdue(): Promise<number> {
    if (this.sweeping) return 0;
    this.sweeping = true;
    try {
      const today = todayUtc();
      const rows: Array<{ farm_id: string }> = await this.taskRepo.query(
        `SELECT DISTINCT farm_id FROM farm_tasks
          WHERE due_date < $1 AND status NOT IN ($2, $3)
         UNION
         SELECT DISTINCT farm_id FROM alerts
          WHERE kind = $4 AND status IN ($5, $6)
            AND batch_id IS NULL AND building_id IS NULL`,
        [
          today,
          TaskStatus.FAIT,
          TaskStatus.ANNULEE,
          AlertKind.TACHE,
          AlertStatus.ACTIVE,
          AlertStatus.ACQUITTEE,
        ],
      );
      for (const { farm_id } of rows) {
        try {
          await this.refreshOverdueAlerts(farm_id);
        } catch (err) {
          this.logger.error(`Tâches en retard (ferme ${farm_id})`, err);
        }
      }
      return rows.length;
    } finally {
      this.sweeping = false;
    }
  }

  onApplicationBootstrap() {
    if (process.env.TASK_SWEEP_DISABLED === 'true') return;
    const run = () =>
      void this.sweepOverdue().catch((err) =>
        this.logger.error('Balayage des tâches en retard', err),
      );
    run();
    this.sweepTimer = setInterval(run, SWEEP_INTERVAL_MS);
    // Never keep the process alive just for the sweep.
    this.sweepTimer.unref();
  }

  onModuleDestroy() {
    if (this.sweepTimer) clearInterval(this.sweepTimer);
  }

  private async refreshOverdueAlerts(farmId: string): Promise<void> {
    const overdue = await this.taskRepo.find({
      where: {
        farmId,
        dueDate: LessThan(todayUtc()),
        status: Not(In([TaskStatus.FAIT, TaskStatus.ANNULEE])),
      },
      order: { dueDate: 'ASC', createdAt: 'ASC' },
    });
    if (overdue.length === 0) {
      await this.alertsService.clearKind(farmId, null, AlertKind.TACHE);
      return;
    }
    await this.notifyNewlyOverdue(farmId, overdue);
    const listed = overdue
      .slice(0, 3)
      .map((t) => `« ${t.title} » (échéance ${t.dueDate})`)
      .join(', ');
    const more = overdue.length > 3 ? ` et ${overdue.length - 3} autre(s)` : '';
    await this.alertsService.raise(
      {
        kind: AlertKind.TACHE,
        level: AlertLevel.ROUGE,
        message: `${overdue.length} tâche(s) de l’équipe en retard : ${listed}${more}.`,
        recommendation:
          'Consulter la liste des tâches, réassigner ou reporter l’échéance, puis notifier l’éleveur concerné.',
        // Single key: jsonb reorders object keys, the sorted id list stays
        // comparable for keepAcknowledgedIfUnchanged.
        context: { taskIds: overdue.map((t) => t.id).sort() },
      },
      { farmId, batchId: null },
      { keepAcknowledgedIfUnchanged: true },
    );
  }

  /** Push trigger: an assigned task, unless people assign it to themselves. */
  private emitAssigned(task: FarmTask, assignedById: string): void {
    if (!task.assigneeId || task.assigneeId === assignedById) return;
    if (task.status === TaskStatus.FAIT || task.status === TaskStatus.ANNULEE)
      return;
    const event: TaskAssignedEvent = {
      farmId: task.farmId,
      taskId: task.id,
      assigneeId: task.assigneeId,
      assignedById,
      title: task.title,
      dueDate: task.dueDate,
    };
    koukouBus.emit(KOUKOU_EVENTS.TASK_ASSIGNED, event);
  }

  /**
   * Push trigger: report each overdue task once. Tasks already long overdue
   * (e.g. on the first run after deployment) are marked without a push.
   */
  private async notifyNewlyOverdue(
    farmId: string,
    overdue: FarmTask[],
  ): Promise<void> {
    const fresh = overdue.filter((t) => !t.overdueNotifiedAt);
    if (fresh.length === 0) return;
    const cutoff = new Date();
    cutoff.setUTCDate(cutoff.getUTCDate() - OVERDUE_PUSH_MAX_DAYS);
    const cutoffDate = cutoff.toISOString().slice(0, 10);
    // Claim atomically: the hourly sweep and a list() may run together.
    const claimed = await this.taskRepo
      .createQueryBuilder()
      .update(FarmTask)
      .set({ overdueNotifiedAt: () => 'now()' })
      .where('id IN (:...ids)', { ids: fresh.map((t) => t.id) })
      .andWhere('overdue_notified_at IS NULL')
      .returning('id')
      .execute();
    const claimedIds = new Set(
      (claimed.raw as Array<{ id: string }>).map((r) => r.id),
    );
    const recent = fresh.filter(
      (t) => claimedIds.has(t.id) && t.dueDate >= cutoffDate,
    );
    if (recent.length === 0) return;
    const event: TasksOverdueEvent = {
      farmId,
      tasks: recent.map((t) => ({
        id: t.id,
        title: t.title,
        dueDate: t.dueDate,
        assigneeId: t.assigneeId,
      })),
    };
    koukouBus.emit(KOUKOU_EVENTS.TASKS_OVERDUE, event);
  }
}
