import {
  Injectable,
  Logger,
  OnModuleDestroy,
  OnModuleInit,
} from '@nestjs/common';
import { InjectDataSource } from '@nestjs/typeorm';
import { DataSource } from 'typeorm';
import {
  KOUKOU_EVENTS,
  koukouBus,
  type VisitReminderEvent,
} from '../../common/utils/event-bus.js';
import { utcDay } from '../batches/poufa/bande-rules.js';
import {
  ParametersService,
  type ParameterResolver,
} from '../programme/parameters.service.js';
import { dueReminders, type FarmLatestVisit } from './visit-reminders.js';

const SWEEP_INTERVAL_MS = 60 * 60 * 1000;

interface LatestVisitRow extends FarmLatestVisit {
  programId: string;
}

/**
 * Reminders of the next planned visit. Only the latest visit of each farm
 * counts, so a newer visit closes the pending reminder by itself. The sweep
 * (boot, then hourly; `VISIT_REMINDER_SWEEP_DISABLED=true` turns the timer
 * off, e2e calls `sweep`) emits `VISIT_REMINDER` on the bus for every plan
 * that is near (`VISITE_RAPPEL_J` days before), due today or overdue. It
 * keeps no state of its own: the notify module stores one notification per
 * agent, channel and `VISIT:<visit>:<stage>` key, so repeating the sweep
 * never duplicates a reminder, and an event lost by a crash comes back at the
 * next sweep. Recipients and channels are the notification rules'.
 */
@Injectable()
export class VisitRemindersService implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(VisitRemindersService.name);
  private timer: NodeJS.Timeout | null = null;

  constructor(
    private readonly parameters: ParametersService,
    @InjectDataSource() private readonly dataSource: DataSource,
  ) {}

  onModuleInit(): void {
    if (process.env.VISIT_REMINDER_SWEEP_DISABLED === 'true') return;
    const run = () =>
      this.sweep().catch((err: unknown) =>
        this.logger.error(`Balayage des rappels de visite : ${String(err)}`),
      );
    void run();
    this.timer = setInterval(run, SWEEP_INTERVAL_MS);
    this.timer.unref();
  }

  onModuleDestroy(): void {
    if (this.timer) clearInterval(this.timer);
  }

  /** Emits the reminders due at `now`; returns them. */
  async sweep(now: Date = new Date()): Promise<VisitReminderEvent[]> {
    const latest: LatestVisitRow[] = await this.dataSource.query(
      `SELECT DISTINCT ON (v.farm_id)
              v.id, v.farm_id AS "farmId", v.agent_user_id AS "agentUserId",
              TO_CHAR(v.next_visit_date, 'YYYY-MM-DD') AS "nextVisitDate",
              f.program_id AS "programId"
         FROM farm_visits v JOIN farms f ON f.id = v.farm_id
        ORDER BY v.farm_id, v.visit_date DESC, v.created_at DESC`,
    );
    const resolvers = new Map<string, ParameterResolver>();
    for (const programId of new Set(latest.map((v) => v.programId))) {
      resolvers.set(programId, await this.parameters.resolver(programId));
    }
    const due = dueReminders(latest, utcDay(now), (v) =>
      resolvers.get(v.programId)?.value<number>('VISITE_RAPPEL_J', now) ?? 2,
    );
    const events: VisitReminderEvent[] = due.map((d) => ({
      visitId: d.id,
      farmId: d.farmId,
      agentUserId: d.agentUserId,
      nextVisitDate: d.nextVisitDate,
      stage: d.stage,
      days: d.days,
    }));
    for (const e of events) koukouBus.emit(KOUKOU_EVENTS.VISIT_REMINDER, e);
    return events;
  }
}
