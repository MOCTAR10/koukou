import { Injectable, Logger, OnModuleDestroy } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { In, Repository } from 'typeorm';
import { BatchStatus, BatchType } from '../../common/enums/batch-type.enum.js';
import { ReferenceKey } from '../../common/enums/reference-key.enum.js';
import { TaskSource } from '../../common/enums/task-source.enum.js';
import { TaskStatus } from '../../common/enums/task-status.enum.js';
import { todayLocal } from '../../common/utils/date.utils.js';
import { KOUKOU_EVENTS, koukouBus } from '../../common/utils/event-bus.js';
import { ProductionBatch } from '../batches/entities/production-batch.entity.js';
import { ageZeroDay } from '../batches/poufa/bande-rules.js';
import { DailyEntry } from '../daily-entries/entities/daily-entry.entity.js';
import { Farm } from '../farms/entities/farm.entity.js';
import { ParametersService } from '../programme/parameters.service.js';
import { ReferenceConstantsService } from '../reference-constants/reference-constants.service.js';
import { ProphylaxisEvent } from '../sanitary/entities/prophylaxis-event.entity.js';
import { FarmTask } from './entities/farm-task.entity.js';
import {
  VIDE_SANITAIRE_TASK_TITLE,
  careDesiredState,
  careTaskTitle,
  coveredWeighingSteps,
  reconcile,
  videSanitaireDueDate,
  weighingPlan,
  weighingTaskTitle,
  type DesiredTask,
} from './task-generation.js';

const OPEN = [TaskStatus.A_FAIRE, TaskStatus.EN_COURS];

/**
 * Keeps the generated tasks of a lot in step with its programmes. The single
 * entry point is `syncBatch`, idempotent and cheap enough to call after every
 * change (lot opened, care planned / done / moved / cancelled, weighing
 * recorded, lot closed). Sources of truth stay where they were: the care
 * calendar (`ProphylaxisEvent`, PROPHYLAXIE alerts) and the weighings
 * (`daily_entries`, WEIGHING_LATE); a task is a team-facing view of them.
 * It never throws: a failure here must not undo the caller's write.
 */
@Injectable()
export class TaskSyncService implements OnModuleDestroy {
  private readonly logger = new Logger(TaskSyncService.name);

  constructor(
    @InjectRepository(FarmTask)
    private readonly taskRepo: Repository<FarmTask>,
    @InjectRepository(ProductionBatch)
    private readonly batchRepo: Repository<ProductionBatch>,
    @InjectRepository(ProphylaxisEvent)
    private readonly eventRepo: Repository<ProphylaxisEvent>,
    @InjectRepository(DailyEntry)
    private readonly entryRepo: Repository<DailyEntry>,
    @InjectRepository(Farm)
    private readonly farmRepo: Repository<Farm>,
    private readonly parameters: ParametersService,
    private readonly constants: ReferenceConstantsService,
  ) {
    // Closures not made through BatchesService.close (headcount at 0, recovery).
    koukouBus.on(KOUKOU_EVENTS.BATCH_CLOSED, this.onClosed);
  }

  private readonly onClosed = (e: { batchId: string }) => {
    void this.syncBatch(e.batchId);
  };

  onModuleDestroy() {
    koukouBus.off(KOUKOU_EVENTS.BATCH_CLOSED, this.onClosed);
  }

  async syncBatch(batchId: string): Promise<void> {
    try {
      await this.doSync(batchId);
    } catch (err) {
      this.logger.error(
        `Tâches générées du lot ${batchId} : ${(err as Error).message}`,
      );
    }
  }

  private async doSync(batchId: string): Promise<void> {
    const batch = await this.batchRepo.findOne({ where: { id: batchId } });
    if (!batch) return;
    const today = todayLocal();
    const closed = batch.status === BatchStatus.CLOTURE;

    const existing = await this.taskRepo.find({
      where: { batchId, source: In(this.generatedSources) },
    });
    const desired: DesiredTask[] = [];
    // A closed lot has nothing left to vaccinate or weigh: its open tasks are
    // cancelled (empty desired list) and only the cleaning remains.
    if (!closed) {
      desired.push(...(await this.vaccineTasks(batch)));
      desired.push(...(await this.weighingTasks(batch, today)));
    } else {
      const closedDay = (batch.closedAt ?? new Date()).toISOString().slice(0, 10);
      const minDays = await this.constants.get(
        ReferenceKey.VIDE_SANITAIRE_MIN_DAYS,
        7,
      );
      desired.push({
        source: TaskSource.VIDE_SANITAIRE,
        stepId: 'VS',
        title: VIDE_SANITAIRE_TASK_TITLE,
        dueDate: videSanitaireDueDate(closedDay, minDays),
        state: 'OPEN',
        notes: batch.batchName ? `Lot ${batch.batchName}` : null,
      });
    }
    const plan = reconcile(
      desired,
      existing.map((t) => ({
        id: t.id,
        source: t.source,
        stepId: t.stepId,
        title: t.title,
        dueDate: t.dueDate,
        status: t.status,
      })),
      this.generatedSources,
    );

    if (plan.create.length > 0) {
      await this.taskRepo
        .createQueryBuilder()
        .insert()
        .into(FarmTask)
        .values(
          plan.create.map((d) => ({
            farmId: batch.farmId,
            batchId,
            source: d.source,
            stepId: d.stepId,
            title: d.title,
            notes: d.notes ?? null,
            dueDate: d.dueDate,
            status: TaskStatus.A_FAIRE,
          })),
        )
        // Two syncs racing (request + bus listener) create each task once.
        .orIgnore()
        .execute();
    }
    for (const u of plan.update) {
      // Moving the due date re-arms the overdue notification, like a manual move.
      await this.taskRepo.update(
        { id: u.id, status: In(OPEN) },
        { dueDate: u.dueDate, title: u.title, overdueNotifiedAt: null },
      );
    }
    if (plan.complete.length > 0) {
      await this.taskRepo.update(
        { id: In(plan.complete), status: In(OPEN) },
        { status: TaskStatus.FAIT, completedAt: new Date() },
      );
    }
    if (plan.cancel.length > 0) {
      await this.taskRepo.update(
        { id: In(plan.cancel), status: In(OPEN) },
        { status: TaskStatus.ANNULEE, completedAt: null },
      );
    }
  }

  private readonly generatedSources = [
    TaskSource.PROGRAMME_VACCIN,
    TaskSource.PESEE,
    TaskSource.VIDE_SANITAIRE,
  ];

  /** One task per planned care of the lot (vaccines and treatments alike). */
  private async vaccineTasks(batch: ProductionBatch): Promise<DesiredTask[]> {
    const events = await this.eventRepo.find({ where: { batchId: batch.id } });
    return events.map((e) => ({
      source: TaskSource.PROGRAMME_VACCIN,
      stepId: e.id,
      title: careTaskTitle(e.careType, e.name),
      dueDate: e.scheduledDate.slice(0, 10),
      state: careDesiredState(e.status),
      notes: [e.dosage, e.route].filter(Boolean).join(' · ') || null,
    }));
  }

  private async weighingTasks(
    batch: ProductionBatch,
    today: string,
  ): Promise<DesiredTask[]> {
    let frequencyDays: number | null = null;
    let durationDays: number | null = null;
    const farm = await this.farmRepo.findOne({ where: { id: batch.farmId } });
    if (farm?.programId) {
      const resolver = await this.parameters.resolver(farm.programId);
      const now = new Date();
      frequencyDays = resolver.value<number>('PESEE_FREQUENCE_J', now);
      durationDays = resolver.value<number>('BANDE_DUREE_REFERENCE_J', now);
    }
    const integration = batch.integrationDate.slice(0, 10);
    const steps = weighingPlan({
      ageZeroDay: ageZeroDay(integration, batch.initialAgeDays),
      integrationDate: integration,
      frequencyDays,
      durationDays,
      bounded: batch.type === BatchType.CHAIR,
      today,
    });
    const weighings: { date: string }[] = await this.entryRepo.query(
      `SELECT TO_CHAR(entry_date, 'YYYY-MM-DD') AS date FROM daily_entries
        WHERE batch_id = $1 AND avg_weight_kg > 0`,
      [batch.id],
    );
    const covered = coveredWeighingSteps(
      steps,
      weighings.map((w) => w.date),
    );
    return steps.map((s) => ({
      source: TaskSource.PESEE,
      stepId: s.stepId,
      title: weighingTaskTitle(s.ageDays),
      dueDate: s.dueDate,
      state: covered.has(s.stepId) ? ('DONE' as const) : ('OPEN' as const),
      // A lot opened late is not given weighings of the past it never had.
      noBackfillBefore: today,
    }));
  }
}
