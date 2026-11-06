import {
  Inject,
  Injectable,
  Logger,
  NotFoundException,
  OnModuleDestroy,
  OnModuleInit,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { InjectDataSource } from '@nestjs/typeorm';
import { createHash } from 'node:crypto';
import { DataSource, In, IsNull, Not } from 'typeorm';
import { AlertLevel } from '../../common/enums/alert-level.enum.js';
import { FarmStaffRole } from '../../common/enums/farm-staff-role.enum.js';
import {
  NotificationAudience,
  NotificationChannel,
  NotificationEvent,
  NotificationStatus,
} from '../../common/enums/notification.enum.js';
import { UserRole } from '../../common/enums/role.enum.js';
import {
  KOUKOU_EVENTS,
  koukouBus,
  type AlertRaisedEvent,
  type DeclarationReceivedEvent,
  type DeclarationReviewedEvent,
  type ReportReadyEvent,
  type SanitaryAlertEvent,
  type SyncConflictEvent,
  type WeighingLateEvent,
} from '../../common/utils/event-bus.js';
import {
  includesFarm,
  isMembershipEffective,
  type InstitutionAccess,
} from '../access/access-rules.js';
import { ProgramMembership } from '../access/entities/program-membership.entity.js';
import { mayHandleSanitaryDeclarations } from '../access/sanitary-declaration.policy.js';
import { SMS_SENDER, type SmsSender } from '../auth/sms/sms-sender.js';
import { FarmEmployee } from '../farms/entities/farm-employee.entity.js';
import { Farm } from '../farms/entities/farm.entity.js';
import { ParametersService } from '../programme/parameters.service.js';
import { PushService } from '../push/push.service.js';
import { User } from '../users/entities/user.entity.js';
import { Notification } from './entities/notification.entity.js';
import type { NotificationRule } from './entities/notification-rule.entity.js';
import { NotificationRulesService } from './notification-rules.service.js';
import {
  CHANNEL_ORDER,
  SMS_MAX_ATTEMPTS,
  isConfidential,
  severityPasses,
  smsRetryDelayMin,
  smsText,
  utcDayStart,
} from './notify-rules.js';

const SWEEP_INTERVAL_MS = 60 * 1000;
/** A claimed SMS is not picked again before this (crash while sending). */
const SMS_LEASE_MS = 10 * 60 * 1000;
const SWEEP_BATCH = 100;
export const SMS_CAP_KEY = 'NOTIF_SMS_PLAFOND_JOUR';

/** One occurrence of an event to report. */
export interface NotifyInput {
  event: NotificationEvent;
  farmId: string;
  subjectId: string | null;
  /** Same occurrence = same key (one SMS per alert, not per re-evaluation). */
  dedupKey: string;
  severity: AlertLevel;
  title: string;
  body: string;
  route: string;
  /** Farm or band code put in the SMS. */
  smsCode: string | null;
}

/** An inbox item as the apps get it. */
export interface InboxItem {
  id: string;
  event: NotificationEvent;
  severity: AlertLevel;
  title: string;
  body: string;
  farmId: string | null;
  subjectId: string | null;
  route: string;
  status: NotificationStatus;
  createdAt: Date;
  readAt: Date | null;
}

const KIND_LABELS: Record<string, string> = {
  MALADIE: 'Maladie',
  MORTALITE: 'Mortalité',
  REFORME: 'Réforme sanitaire',
  SYMPTOME: 'Symptôme',
  VISITE_VETO: 'Visite vétérinaire',
  AUTRE: 'Autre événement',
};

function frDate(iso: string): string {
  const [y, m, d] = iso.slice(0, 10).split('-');
  return `${d}/${m}/${y}`;
}

/**
 * Notifications (architecture §12): the in-app inbox, push through
 * `PushService`, SMS through the active `SmsSender`, and the escalation.
 *
 * - Bus events (`koukouBus`) become occurrences; the programme's active
 *   rules for the event (severity filter) give the recipients and channels.
 *   Unpublished sanitary events only reach the farm side and the profiles
 *   allowed by `mayHandleSanitaryDeclarations`, whatever the rules say.
 * - One row per user × occurrence × channel (`dedupKey`, unique): a replay
 *   or a re-evaluation never notifies twice. IN_APP is always there: reading
 *   it (`POST /notifications/:id/read`) reads the whole occurrence and stops
 *   the escalation.
 * - Escalation: a rule's `escalateAfterMin` puts `escalateAt` on the lead row;
 *   still unread then (or at once, if the push found no registered phone), an
 *   SMS row is added (`escalatedFromId`).
 * - SMS rows are sent by the sweep: daily cap per user (`NOTIF_SMS_PLAFOND_JOUR`),
 *   minimal text, retries with a growing delay, ECHEC after
 *   {@link SMS_MAX_ATTEMPTS}.
 * - Sweep at boot and every minute; `NOTIFY_SWEEP_DISABLED=true` turns the
 *   timer off (e2e calls `sweep()`).
 *
 * Plugging an SMS provider (Airtel, Moov): implement `SmsSender` in
 * `auth/sms/` (its `send` rejects on a refusal, which this module retries)
 * and return it from `createSmsSender` for `SMS_PROVIDER=airtel|moov`. The
 * institutional login code (OTP) and the notifications then use it alike;
 * nothing changes here. Then an administrator adds SMS or `escalateAfterMin`
 * to the rules that need it.
 */
@Injectable()
export class NotifyService implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(NotifyService.name);
  private readonly pending = new Set<Promise<void>>();
  private timer: NodeJS.Timeout | null = null;
  private readonly programCode: string;

  private readonly listeners: Array<[string, (e: never) => void]> = [
    [
      KOUKOU_EVENTS.ALERT_RAISED,
      (e: AlertRaisedEvent) => this.track(this.onAlertRaised(e)),
    ],
    [
      KOUKOU_EVENTS.SANITARY_ALERT_CREATED,
      (e: SanitaryAlertEvent) =>
        this.track(this.onSanitaryAlert(NotificationEvent.SANITARY_ALERT_CREATED, e)),
    ],
    [
      KOUKOU_EVENTS.SANITARY_ALERT_STATUS_CHANGED,
      (e: SanitaryAlertEvent) =>
        this.track(
          this.onSanitaryAlert(NotificationEvent.SANITARY_ALERT_STATUS_CHANGED, e),
        ),
    ],
    [
      KOUKOU_EVENTS.SANITARY_ALERT_PUBLISHED,
      (e: SanitaryAlertEvent) =>
        this.track(
          this.onSanitaryAlert(NotificationEvent.SANITARY_ALERT_PUBLISHED, e),
        ),
    ],
    [
      KOUKOU_EVENTS.DECLARATION_RECEIVED,
      (e: DeclarationReceivedEvent) => this.track(this.onDeclaration(e)),
    ],
    [
      KOUKOU_EVENTS.WEIGHING_LATE,
      (e: WeighingLateEvent) => this.track(this.onWeighingLate(e)),
    ],
    [
      KOUKOU_EVENTS.SYNC_CONFLICT,
      (e: SyncConflictEvent) => this.track(this.onSyncConflict(e)),
    ],
    // POUFA lot A pilot: « rapport disponible ».
    [
      KOUKOU_EVENTS.REPORT_READY,
      (e: ReportReadyEvent) => this.track(this.onReportReady(e)),
    ],
    // POUFA lot A2 vet: the vets' decision on a declaration (CDC n° 26).
    [
      KOUKOU_EVENTS.DECLARATION_REVIEWED,
      (e: DeclarationReviewedEvent) => this.track(this.onDeclarationReviewed(e)),
    ],
  ];

  constructor(
    @InjectDataSource() private readonly dataSource: DataSource,
    private readonly rules: NotificationRulesService,
    private readonly push: PushService,
    private readonly parameters: ParametersService,
    @Inject(SMS_SENDER) private readonly sms: SmsSender,
    config: ConfigService,
  ) {
    this.programCode = String(config.get('PROGRAM_CODE', 'POUFA')).trim() || 'POUFA';
  }

  onModuleInit(): void {
    for (const [name, fn] of this.listeners) {
      koukouBus.on(name, fn as (...args: unknown[]) => void);
    }
    if (process.env.NOTIFY_SWEEP_DISABLED === 'true') return;
    const run = () =>
      this.sweep().catch((err: unknown) =>
        this.logger.error(`Balayage des notifications : ${String(err)}`),
      );
    void run();
    this.timer = setInterval(run, SWEEP_INTERVAL_MS);
    this.timer.unref();
  }

  async onModuleDestroy(): Promise<void> {
    for (const [name, fn] of this.listeners) {
      koukouBus.off(name, fn as (...args: unknown[]) => void);
    }
    if (this.timer) clearInterval(this.timer);
    await this.flush();
  }

  /** Waits for the notifications in flight (tests, shutdown). */
  async flush(): Promise<void> {
    while (this.pending.size > 0) {
      await Promise.allSettled(this.pending);
    }
  }

  // ---------- Bus events → occurrences ----------

  private async farmOf(farmId: string): Promise<Farm | null> {
    return this.dataSource.getRepository(Farm).findOne({ where: { id: farmId } });
  }

  private async bandCode(batchId: string | null): Promise<string | null> {
    if (!batchId) return null;
    const rows: { code: string | null }[] = await this.dataSource.query(
      `SELECT code FROM production_batches WHERE id = $1`,
      [batchId],
    );
    return rows[0]?.code ?? null;
  }

  private async onAlertRaised(e: AlertRaisedEvent): Promise<void> {
    const farm = await this.farmOf(e.farmId);
    if (!farm) return;
    await this.notify({
      event: NotificationEvent.ALERT_RAISED,
      farmId: farm.id,
      subjectId: e.alertId,
      dedupKey: `${NotificationEvent.ALERT_RAISED}:${e.alertId}`,
      severity: AlertLevel.ROUGE,
      title: `Alerte — ${farm.name}`,
      body: e.message,
      route: '/alerts',
      smsCode: farm.code,
    });
  }

  private async onSanitaryAlert(
    event: NotificationEvent,
    e: SanitaryAlertEvent,
  ): Promise<void> {
    const farm = await this.farmOf(e.farmId);
    if (!farm) return;
    const band = await this.bandCode(e.batchId);
    const where = [farm.code, band ? `bande ${band}` : null]
      .filter(Boolean)
      .join(', ');
    const origin =
      e.origin === 'MORTALITE'
        ? 'mortalité au-dessus du seuil vétérinaire'
        : 'suspicion déclarée';
    const texts: Record<string, { title: string; body: string }> = {
      [NotificationEvent.SANITARY_ALERT_CREATED]: {
        title: `Nouvelle alerte sanitaire ${e.code}`,
        body: `${where} : ${origin}.`,
      },
      [NotificationEvent.SANITARY_ALERT_STATUS_CHANGED]: {
        title: `Alerte sanitaire ${e.code} : ${e.statusCode}`,
        body: `${where} : nouveau statut ${e.statusCode}.`,
      },
      [NotificationEvent.SANITARY_ALERT_PUBLISHED]: {
        title: `Alerte sanitaire publiée ${e.code}`,
        body: `${where} : alerte confirmée et publiée par les services vétérinaires.`,
      },
    };
    const severity = (Object.values(AlertLevel) as string[]).includes(e.severity)
      ? (e.severity as AlertLevel)
      : AlertLevel.ROUGE;
    await this.notify({
      event,
      farmId: farm.id,
      subjectId: e.alertId,
      dedupKey:
        event === NotificationEvent.SANITARY_ALERT_STATUS_CHANGED
          ? `${event}:${e.alertId}:${e.transitionId ?? e.statusCode}`
          : `${event}:${e.alertId}`,
      severity,
      ...texts[event],
      route: `/sanitary-alerts/${e.alertId}`,
      smsCode: farm.code,
    });
  }

  private async onDeclaration(e: DeclarationReceivedEvent): Promise<void> {
    const farm = await this.farmOf(e.farmId);
    if (!farm) return;
    const band = await this.bandCode(e.batchId);
    const severity = (Object.values(AlertLevel) as string[]).includes(e.severity)
      ? (e.severity as AlertLevel)
      : AlertLevel.JAUNE;
    await this.notify({
      event: NotificationEvent.DECLARATION_RECEIVED,
      farmId: farm.id,
      subjectId: e.healthEventId,
      dedupKey: `${NotificationEvent.DECLARATION_RECEIVED}:${e.healthEventId}`,
      severity,
      title: `Déclaration sanitaire — ${farm.code ?? farm.name}`,
      body:
        `${KIND_LABELS[e.kind] ?? e.kind}${e.suspicion ? ' (suspicion)' : ''}` +
        (band ? ` sur la bande ${band}.` : '.'),
      route: `/farms/${farm.id}/batches/${e.batchId}/health-events`,
      smsCode: farm.code,
    });
  }

  // POUFA lot A2 vet (begin)
  private async onDeclarationReviewed(
    e: DeclarationReviewedEvent,
  ): Promise<void> {
    const farm = await this.farmOf(e.farmId);
    if (!farm) return;
    const band = await this.bandCode(e.batchId);
    const outcome: Record<string, string> = {
      VALIDEE: 'validée',
      INFIRMEE: 'infirmée',
      ALERTE: e.alertCode
        ? `convertie en alerte sanitaire ${e.alertCode}`
        : 'convertie en alerte sanitaire',
    };
    await this.notify({
      event: NotificationEvent.DECLARATION_REVIEWED,
      farmId: farm.id,
      subjectId: e.healthEventId,
      dedupKey: `${NotificationEvent.DECLARATION_REVIEWED}:${e.healthEventId}`,
      severity: e.status === 'ALERTE' ? AlertLevel.ROUGE : AlertLevel.JAUNE,
      title: 'Déclaration examinée par les services vétérinaires',
      body:
        `« ${e.title} » du ${frDate(e.occurredAt)}` +
        (band ? ` (bande ${band})` : '') +
        ` : ${outcome[e.status] ?? e.status}.`,
      route: e.alertId
        ? `/sanitary-alerts/${e.alertId}`
        : `/farms/${farm.id}/batches/${e.batchId}/health-events`,
      smsCode: farm.code,
    });
  }
  // POUFA lot A2 vet (end)

  private async onWeighingLate(e: WeighingLateEvent): Promise<void> {
    await this.notify({
      event: NotificationEvent.WEIGHING_LATE,
      farmId: e.farmId,
      subjectId: e.batchId,
      dedupKey: `${NotificationEvent.WEIGHING_LATE}:${e.batchId}:${e.dueDate}`,
      severity: AlertLevel.JAUNE,
      title: 'Pesée en retard',
      body:
        `Bande ${e.code ?? ''} : pesée attendue le ${frDate(e.dueDate)} ` +
        `(${e.daysLate} j de retard).`,
      route: `/batches/${e.batchId}`,
      smsCode: e.code,
    });
  }

  private async onSyncConflict(e: SyncConflictEvent): Promise<void> {
    const farm = await this.farmOf(e.farmId);
    if (!farm || e.conflictIds.length === 0) return;
    const key = createHash('sha1')
      .update([...e.conflictIds].sort().join(','))
      .digest('hex');
    const n = e.conflictIds.length;
    await this.notify({
      event: NotificationEvent.SYNC_CONFLICT,
      farmId: farm.id,
      subjectId: e.batchId,
      dedupKey: `${NotificationEvent.SYNC_CONFLICT}:${key}`,
      severity: AlertLevel.JAUNE,
      title: 'Conflit de saisie',
      body: `${n} saisie${n > 1 ? 's' : ''} modifiée${n > 1 ? 's' : ''} sur un autre appareil : vérifiez la version retenue.`,
      route: e.batchId ? `/batches/${e.batchId}` : '/sync',
      smsCode: farm.code,
    });
  }

  /**
   * POUFA lot A: a report run was produced. Its recipients come from the
   * template's audience (`report_runs.recipients`); the REPORT_READY rules
   * say who of them hears it and through which channels:
   * REPORT_RECIPIENTS = all of them, PROFILE = those of that profile,
   * FARM_MANAGERS / FARM_TEAM = the farm's people for an end-of-band run
   * (they read their farm's end-of-band reports).
   */
  private async onReportReady(e: ReportReadyEvent): Promise<void> {
    if (!e.programId) return;
    const band = e.level === 'BANDE' && e.batchId != null;
    const route = band ? `/batches/${e.batchId}` : `/reports/${e.runId}`;
    await this.notifyUsers(
      e.programId,
      {
        event: NotificationEvent.REPORT_READY,
        farmId: e.farmId,
        subjectId: e.runId,
        dedupKey: `${NotificationEvent.REPORT_READY}:${e.runId}`,
        severity: AlertLevel.VERT,
        title: 'Rapport disponible',
        body: `${e.title} (du ${frDate(e.periodStart)} au ${frDate(e.periodEnd)}).`,
        route,
        smsCode: null,
      },
      async (rule) => {
        const recipients = e.recipients ?? [];
        switch (rule.audience) {
          case NotificationAudience.REPORT_RECIPIENTS:
            return recipients.map((r) => r.userId);
          case NotificationAudience.PROFILE:
            return recipients
              .filter(
                (r) => r.kind === 'MEMBER' && r.profileCode === rule.profileCode,
              )
              .map((r) => r.userId);
          case NotificationAudience.FARM_MANAGERS:
          case NotificationAudience.FARM_TEAM: {
            if (!band || !e.farmId) return [];
            const farm = await this.farmOf(e.farmId);
            return farm ? this.recipients(rule, farm, false) : [];
          }
          default:
            return [];
        }
      },
    );
  }

  // ---------- Dispatch ----------

  /**
   * Creates the occurrence's rows for every recipient of the active rules
   * and sends the pushes. Returns the number of rows created.
   */
  async notify(input: NotifyInput, now: Date = new Date()): Promise<number> {
    const farm = await this.farmOf(input.farmId);
    if (!farm) return 0;
    const confidential = isConfidential(input.event);
    return this.notifyUsers(
      farm.programId,
      input,
      (rule) => this.recipients(rule, farm, confidential),
      now,
    );
  }

  /**
   * The programme's active rules for the event (severity filter), each one
   * giving its users through `recipientsOf`; then one row per user and
   * channel, and the pushes. `input.farmId` may be null (a national report).
   */
  private async notifyUsers(
    programId: string,
    input: Omit<NotifyInput, 'farmId'> & { farmId: string | null },
    recipientsOf: (rule: NotificationRule) => Promise<string[]>,
    now: Date = new Date(),
  ): Promise<number> {
    const rules = (await this.rules.activeFor(programId, input.event)).filter(
      (r) => severityPasses(input.severity, r.severityMin),
    );
    if (rules.length === 0) return 0;
    const plan = new Map<
      string,
      { channels: Set<NotificationChannel>; escalate: number | null; ruleId: string }
    >();
    for (const rule of rules) {
      for (const userId of await recipientsOf(rule)) {
        const entry = plan.get(userId) ?? {
          channels: new Set<NotificationChannel>(),
          escalate: null,
          ruleId: rule.id,
        };
        rule.channels.forEach((c) => entry.channels.add(c));
        if (rule.escalateAfterMin !== null) {
          entry.escalate =
            entry.escalate === null
              ? rule.escalateAfterMin
              : Math.min(entry.escalate, rule.escalateAfterMin);
        }
        plan.set(userId, entry);
      }
    }
    if (plan.size === 0) return 0;
    const active = new Set(
      (
        await this.dataSource.getRepository(User).find({
          where: { id: In([...plan.keys()]), active: true },
          select: { id: true },
        })
      ).map((u) => u.id),
    );
    const payload = {
      route: input.route,
      sms: smsText(this.programCode, input.event, input.smsCode),
    };
    const rows: Partial<Notification>[] = [];
    for (const [userId, entry] of plan) {
      if (!active.has(userId)) continue;
      const channels = CHANNEL_ORDER.filter((c) => entry.channels.has(c));
      const escalateAt =
        entry.escalate !== null && !entry.channels.has(NotificationChannel.SMS)
          ? new Date(now.getTime() + entry.escalate * 60_000)
          : null;
      channels.forEach((channel, i) =>
        rows.push({
          userId,
          farmId: input.farmId,
          ruleId: entry.ruleId,
          event: input.event,
          subjectId: input.subjectId,
          dedupKey: input.dedupKey.slice(0, 200),
          severity: input.severity,
          title: input.title.slice(0, 200),
          body: input.body,
          payload,
          channel,
          status:
            channel === NotificationChannel.IN_APP
              ? NotificationStatus.ENVOYEE
              : NotificationStatus.EN_ATTENTE,
          sentAt: channel === NotificationChannel.IN_APP ? now : null,
          nextAttemptAt: channel === NotificationChannel.SMS ? now : null,
          // The first channel leads the occurrence.
          escalateAt: i === 0 ? escalateAt : null,
        }),
      );
    }
    if (rows.length === 0) return 0;
    const result = await this.dataSource
      .createQueryBuilder()
      .insert()
      .into(Notification)
      .values(rows)
      .orIgnore()
      .returning(['id'])
      .execute();
    const ids = (result.raw as { id: string }[]).map((r) => r.id);
    if (ids.length === 0) return 0;
    const created = await this.dataSource
      .getRepository(Notification)
      .find({ where: { id: In(ids) } });
    for (const row of created) {
      if (row.channel === NotificationChannel.PUSH) await this.sendPush(row, created);
    }
    if (created.some((r) => r.channel === NotificationChannel.SMS)) {
      await this.sendDueSms(now);
    }
    return created.length;
  }

  /**
   * Users addressed by a rule for this farm. PROFILE: effective members of
   * that profile whose scope holds the farm (and, for unpublished sanitary
   * data, only profiles allowed by the declarations rule).
   */
  private async recipients(
    rule: NotificationRule,
    farm: Farm,
    confidential: boolean,
  ): Promise<string[]> {
    switch (rule.audience) {
      case NotificationAudience.FARM_MANAGERS:
      case NotificationAudience.FARM_TEAM: {
        const links = await this.dataSource.getRepository(FarmEmployee).find({
          where: {
            farmId: farm.id,
            active: true,
            ...(rule.audience === NotificationAudience.FARM_MANAGERS
              ? { role: FarmStaffRole.ADMIN }
              : {}),
          },
        });
        return [
          ...(farm.ownerId ? [farm.ownerId] : []),
          ...links.map((l) => l.userId),
        ];
      }
      case NotificationAudience.PROFILE: {
        if (!rule.profileCode) return [];
        const members = await this.dataSource
          .getRepository(ProgramMembership)
          .find({
            where: {
              profile: { code: rule.profileCode, programId: farm.programId },
            },
            relations: { profile: true },
          });
        return members
          .filter((m) => isMembershipEffective(m) && m.profile)
          // Unpublished sanitary data: the profiles holding the veterinary
          // authority in their matrix only (POUFA lot A2 vet).
          .filter(
            (m) =>
              !confidential ||
              mayHandleSanitaryDeclarations(
                { role: UserRole.INSTITUTION },
                { matrix: m.profile!.matrix },
              ),
          )
          .filter((m) =>
            includesFarm(
              {
                programId: m.profile!.programId,
                scopeKind: m.profile!.scopeKind,
                provinceIds: m.provinceIds ?? [],
                farmIds: m.farmIds ?? [],
              } as unknown as InstitutionAccess,
              farm,
            ),
          )
          .map((m) => m.userId);
      }
      default:
        return [];
    }
  }

  private async sendPush(row: Notification, siblings: Notification[]): Promise<void> {
    const repo = this.dataSource.getRepository(Notification);
    const inApp = siblings.find(
      (s) =>
        s.userId === row.userId &&
        s.dedupKey === row.dedupKey &&
        s.channel === NotificationChannel.IN_APP,
    );
    let devices = 0;
    let error: string | null = null;
    try {
      devices = await this.push.sendToUsers(row.farmId ?? '', [row.userId], {
        title: row.title,
        body: row.body,
        // Opening it reads the in-app notification (stops the escalation).
        route: `/notifications/${inApp?.id ?? row.id}`,
      });
      if (devices === 0) error = 'Aucun appareil enregistré pour ce compte.';
    } catch (err) {
      error = err instanceof Error ? err.message : String(err);
    }
    await repo.update(row.id, {
      status: error ? NotificationStatus.ECHEC : NotificationStatus.ENVOYEE,
      sentAt: error ? null : new Date(),
      attempts: 1,
      lastError: error,
    });
    if (error) {
      // No phone to push to: an escalating occurrence goes to SMS at once.
      await repo.update(
        {
          userId: row.userId,
          dedupKey: row.dedupKey,
          escalateAt: Not(IsNull()),
          escalatedAt: IsNull(),
        },
        { escalateAt: new Date() },
      );
      await this.escalateDue();
      await this.sendDueSms();
    }
  }

  // ---------- Sweep: escalation and SMS ----------

  /** Escalates the unread occurrences that are due, then sends due SMS. */
  async sweep(now: Date = new Date()): Promise<{ escalated: number; sms: number }> {
    const escalated = await this.escalateDue(now);
    const sms = await this.sendDueSms(now);
    return { escalated, sms };
  }

  private async escalateDue(now: Date = new Date()): Promise<number> {
    const due: { id: string }[] = await this.dataSource.query(
      `SELECT n.id FROM notifications n
        WHERE n.escalate_at <= $1 AND n.escalated_at IS NULL
          AND NOT EXISTS (
            SELECT 1 FROM notifications s
             WHERE s.user_id = n.user_id AND s.dedup_key = n.dedup_key
               AND s.read_at IS NOT NULL)
        ORDER BY n.escalate_at
        LIMIT ${SWEEP_BATCH}`,
      [now],
    );
    let count = 0;
    const repo = this.dataSource.getRepository(Notification);
    for (const { id } of due) {
      // A raw UPDATE answers [rows, count] on postgres: read it through a CTE.
      const claimed: unknown[] = await this.dataSource.query(
        `WITH c AS (
           UPDATE notifications SET escalated_at = $2
            WHERE id = $1 AND escalated_at IS NULL RETURNING id)
         SELECT id FROM c`,
        [id, now],
      );
      if (claimed.length === 0) continue;
      const lead = await repo.findOneByOrFail({ id });
      const result = await this.dataSource
        .createQueryBuilder()
        .insert()
        .into(Notification)
        .values({
          userId: lead.userId,
          farmId: lead.farmId,
          ruleId: lead.ruleId,
          event: lead.event,
          subjectId: lead.subjectId,
          dedupKey: lead.dedupKey,
          severity: lead.severity,
          title: lead.title,
          body: lead.body,
          payload: lead.payload,
          channel: NotificationChannel.SMS,
          status: NotificationStatus.EN_ATTENTE,
          nextAttemptAt: now,
          escalatedFromId: lead.id,
        })
        .orIgnore()
        .returning(['id'])
        .execute();
      count += (result.raw as unknown[]).length;
    }
    return count;
  }

  /** Sends the SMS rows due now (claimed with a lease). Returns the number sent. */
  async sendDueSms(now: Date = new Date()): Promise<number> {
    const claimed: { id: string }[] = await this.dataSource.query(
      `WITH c AS (
         UPDATE notifications SET next_attempt_at = $2
          WHERE id IN (
            SELECT id FROM notifications
             WHERE channel = $3 AND status = $4 AND next_attempt_at <= $1
             ORDER BY next_attempt_at
             LIMIT ${SWEEP_BATCH}
             FOR UPDATE SKIP LOCKED)
          RETURNING id)
       SELECT id FROM c`,
      [
        now,
        new Date(now.getTime() + SMS_LEASE_MS),
        NotificationChannel.SMS,
        NotificationStatus.EN_ATTENTE,
      ],
    );
    let sent = 0;
    for (const { id } of claimed) {
      if (await this.sendOneSms(id, now)) sent += 1;
    }
    return sent;
  }

  private async sendOneSms(id: string, now: Date): Promise<boolean> {
    const repo = this.dataSource.getRepository(Notification);
    const row = await repo.findOneBy({ id });
    if (!row) return false;
    const read = await repo.findOne({
      where: { userId: row.userId, dedupKey: row.dedupKey, readAt: Not(IsNull()) },
    });
    if (read) {
      // Read before the SMS left: no SMS.
      await repo.update(id, {
        status: NotificationStatus.LUE,
        readAt: read.readAt,
        nextAttemptAt: null,
      });
      return false;
    }
    const fail = (lastError: string) =>
      repo.update(id, {
        status: NotificationStatus.ECHEC,
        lastError,
        nextAttemptAt: null,
      });
    const user = await this.dataSource
      .getRepository(User)
      .findOne({ where: { id: row.userId }, select: { id: true, phone: true, active: true } });
    if (!user?.active || !user.phone) {
      await fail('Aucun numéro de téléphone actif pour ce compte.');
      return false;
    }
    const farm = row.farmId ? await this.farmOf(row.farmId) : null;
    const cap = farm
      ? Number(
          (await this.parameters.resolver(farm.programId)).value<number>(
            SMS_CAP_KEY,
            now,
          ),
        )
      : 0;
    const [{ n: sentToday }]: { n: number }[] = await this.dataSource.query(
      `SELECT COUNT(*)::int AS n FROM notifications
        WHERE user_id = $1 AND channel = $2 AND sent_at >= $3`,
      [row.userId, NotificationChannel.SMS, utcDayStart(now)],
    );
    if (sentToday >= cap) {
      await fail(`Plafond quotidien de SMS atteint (${cap}).`);
      return false;
    }
    const attempts = row.attempts + 1;
    try {
      await this.sms.send(user.phone, row.payload.sms);
      await repo.update(id, {
        status: NotificationStatus.ENVOYEE,
        sentAt: new Date(),
        attempts,
        lastError: null,
        nextAttemptAt: null,
      });
      return true;
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      if (attempts >= SMS_MAX_ATTEMPTS) {
        await repo.update(id, {
          status: NotificationStatus.ECHEC,
          attempts,
          lastError: message,
          nextAttemptAt: null,
        });
      } else {
        await repo.update(id, {
          attempts,
          lastError: message,
          nextAttemptAt: new Date(
            now.getTime() + smsRetryDelayMin(attempts) * 60_000,
          ),
        });
      }
      return false;
    }
  }

  // ---------- Inbox ----------

  async inbox(
    userId: string,
    query: { unread?: boolean; before?: string; limit?: number },
  ): Promise<{ items: InboxItem[]; unread: number }> {
    const qb = this.dataSource
      .getRepository(Notification)
      .createQueryBuilder('n')
      .where('n.user_id = :userId AND n.channel = :channel', {
        userId,
        channel: NotificationChannel.IN_APP,
      });
    if (query.unread) qb.andWhere('n.read_at IS NULL');
    if (query.before) {
      qb.andWhere('n.created_at < :before', { before: new Date(query.before) });
    }
    const rows = await qb
      .orderBy('n.created_at', 'DESC')
      .addOrderBy('n.id', 'DESC')
      .limit(query.limit ?? 50)
      .getMany();
    return { items: rows.map(toInbox), unread: await this.unreadCount(userId) };
  }

  async unreadCount(userId: string): Promise<number> {
    return this.dataSource.getRepository(Notification).count({
      where: {
        userId,
        channel: NotificationChannel.IN_APP,
        readAt: IsNull(),
      },
    });
  }

  /** Reads the whole occurrence (every channel); stops its escalation. */
  async markRead(userId: string, id: string): Promise<InboxItem> {
    const repo = this.dataSource.getRepository(Notification);
    const row = await repo.findOne({ where: { id, userId } });
    if (!row) throw new NotFoundException('Notification introuvable.');
    await this.readOccurrences(userId, [row.dedupKey]);
    const inApp =
      (await repo.findOne({
        where: {
          userId,
          dedupKey: row.dedupKey,
          channel: NotificationChannel.IN_APP,
        },
      })) ?? (await repo.findOneByOrFail({ id }));
    return toInbox(inApp);
  }

  async markAllRead(userId: string): Promise<{ updated: number }> {
    const keys: { key: string }[] = await this.dataSource.query(
      `SELECT DISTINCT dedup_key AS key FROM notifications
        WHERE user_id = $1 AND channel = $2 AND read_at IS NULL`,
      [userId, NotificationChannel.IN_APP],
    );
    if (keys.length === 0) return { updated: 0 };
    await this.readOccurrences(
      userId,
      keys.map((k) => k.key),
    );
    return { updated: keys.length };
  }

  /** The app confirms it received these notifications (ENVOYEE → DISTRIBUEE). */
  async markDelivered(userId: string, ids: string[]): Promise<{ updated: number }> {
    if (ids.length === 0) return { updated: 0 };
    const result = await this.dataSource
      .getRepository(Notification)
      .update(
        { userId, id: In(ids), status: NotificationStatus.ENVOYEE },
        { status: NotificationStatus.DISTRIBUEE, deliveredAt: new Date() },
      );
    return { updated: result.affected ?? 0 };
  }

  private async readOccurrences(userId: string, keys: string[]): Promise<void> {
    await this.dataSource.query(
      `UPDATE notifications
          SET read_at = COALESCE(read_at, now()),
              status = CASE WHEN status IN ($3, $4) THEN $5::notifications_status_enum
                            ELSE status END,
              escalate_at = NULL
        WHERE user_id = $1 AND dedup_key = ANY($2::varchar[])`,
      [
        userId,
        keys,
        NotificationStatus.ENVOYEE,
        NotificationStatus.DISTRIBUEE,
        NotificationStatus.LUE,
      ],
    );
  }

  private track(work: Promise<unknown>): void {
    const p = work.then(
      () => undefined,
      (err: unknown) =>
        this.logger.warn(
          `Notification non créée : ${err instanceof Error ? err.message : String(err)}`,
        ),
    );
    this.pending.add(p);
    void p.finally(() => this.pending.delete(p));
  }
}

function toInbox(n: Notification): InboxItem {
  return {
    id: n.id,
    event: n.event,
    severity: n.severity,
    title: n.title,
    body: n.body,
    farmId: n.farmId,
    subjectId: n.subjectId,
    route: n.payload?.route ?? '',
    status: n.status,
    createdAt: n.createdAt,
    readAt: n.readAt,
  };
}
