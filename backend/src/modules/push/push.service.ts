import {
  Injectable,
  Logger,
  OnModuleDestroy,
  OnModuleInit,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { In, Repository } from 'typeorm';
import { FarmStaffRole } from '../../common/enums/farm-staff-role.enum.js';
import {
  AlertRaisedEvent,
  KOUKOU_EVENTS,
  koukouBus,
  TaskAssignedEvent,
  TasksOverdueEvent,
} from '../../common/utils/event-bus.js';
import { FarmEmployee } from '../farms/entities/farm-employee.entity.js';
import { Farm } from '../farms/entities/farm.entity.js';
import { RegisterDeviceDto } from './dto/register-device.dto.js';
import { PushDevice } from './entities/push-device.entity.js';

const EXPO_PUSH_URL = 'https://exp.host/--/api/v2/push/send';
const EXPO_BATCH = 100;
/** Android channel created by the app (see mobile src/notifications). */
export const PUSH_CHANNEL_ID = 'alertes';

export interface PushPayload {
  title: string;
  body: string;
  /** In-app route opened when the notification is tapped. */
  route: string;
}

export interface PushMessage {
  to: string;
  title: string;
  body: string;
  data: { route: string; farmId: string };
  sound: 'default';
  priority: 'high';
  channelId: string;
}

type ExpoTicket =
  | { status: 'ok'; id: string }
  | { status: 'error'; message: string; details?: { error?: string } };

function clip(text: string, max = 180): string {
  return text.length <= max ? text : `${text.slice(0, max - 1)}…`;
}

function frDate(iso: string): string {
  const [y, m, d] = iso.split('-');
  return `${d}/${m}/${y}`;
}

/**
 * Server push through the Expo Push service (FCM / APNs behind it).
 * Sends are fire-and-forget: a push failure never fails the request that
 * triggered it. PUSH_DISABLED=true skips the network call.
 */
@Injectable()
export class PushService implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(PushService.name);
  private readonly pending = new Set<Promise<void>>();

  /** Transport, replaceable in tests. */
  deliver: (messages: PushMessage[]) => Promise<void> = (messages) =>
    this.postToExpo(messages);

  private readonly onAlert = (e: AlertRaisedEvent) =>
    this.track(this.handleAlert(e));
  private readonly onAssigned = (e: TaskAssignedEvent) =>
    this.track(this.handleAssigned(e));
  private readonly onOverdue = (e: TasksOverdueEvent) =>
    this.track(this.handleOverdue(e));

  constructor(
    @InjectRepository(PushDevice)
    private readonly deviceRepo: Repository<PushDevice>,
    @InjectRepository(Farm)
    private readonly farmRepo: Repository<Farm>,
    @InjectRepository(FarmEmployee)
    private readonly employeeRepo: Repository<FarmEmployee>,
  ) {}

  onModuleInit() {
    koukouBus.on(KOUKOU_EVENTS.ALERT_RAISED, this.onAlert);
    koukouBus.on(KOUKOU_EVENTS.TASK_ASSIGNED, this.onAssigned);
    koukouBus.on(KOUKOU_EVENTS.TASKS_OVERDUE, this.onOverdue);
  }

  async onModuleDestroy() {
    koukouBus.off(KOUKOU_EVENTS.ALERT_RAISED, this.onAlert);
    koukouBus.off(KOUKOU_EVENTS.TASK_ASSIGNED, this.onAssigned);
    koukouBus.off(KOUKOU_EVENTS.TASKS_OVERDUE, this.onOverdue);
    await this.flush();
  }

  async register(userId: string, dto: RegisterDeviceDto): Promise<void> {
    // A token follows the account signed in on the phone.
    await this.deviceRepo.upsert(
      { userId, token: dto.token, platform: dto.platform ?? null },
      ['token'],
    );
  }

  async unregister(userId: string, token: string): Promise<void> {
    await this.deviceRepo.delete({ userId, token });
  }

  /** Waits for in-flight sends (tests, shutdown). */
  async flush(): Promise<void> {
    while (this.pending.size > 0) {
      await Promise.allSettled(this.pending);
    }
  }

  async sendToUsers(
    farmId: string,
    userIds: string[],
    payload: PushPayload,
  ): Promise<void> {
    const ids = [...new Set(userIds)];
    if (ids.length === 0) return;
    const devices = await this.deviceRepo.find({
      where: { userId: In(ids) },
    });
    if (devices.length === 0) return;
    const messages: PushMessage[] = devices.map((d) => ({
      to: d.token,
      title: payload.title,
      body: clip(payload.body),
      data: { route: payload.route, farmId },
      sound: 'default',
      priority: 'high',
      channelId: PUSH_CHANNEL_ID,
    }));
    await this.deliver(messages);
  }

  /** Owner and active Administrateurs: the people who manage the farm. */
  private async farmManagers(farm: Farm): Promise<string[]> {
    const admins = await this.employeeRepo.find({
      where: { farmId: farm.id, role: FarmStaffRole.ADMIN, active: true },
    });
    return [farm.ownerId, ...admins.map((a) => a.userId)];
  }

  private async handleAlert(e: AlertRaisedEvent): Promise<void> {
    const farm = await this.farmRepo.findOne({ where: { id: e.farmId } });
    if (!farm) return;
    await this.sendToUsers(farm.id, await this.farmManagers(farm), {
      title: `Alerte — ${farm.name}`,
      body: e.message,
      route: '/(tabs)/alerts',
    });
  }

  /** Users among `ids` still active on the farm (owner or active link). */
  private async activeMembers(farmId: string, ids: string[]): Promise<Set<string>> {
    if (ids.length === 0) return new Set();
    const [farm, links] = await Promise.all([
      this.farmRepo.findOne({ where: { id: farmId } }),
      this.employeeRepo.find({
        where: { farmId, userId: In(ids), active: true },
      }),
    ]);
    const active = new Set(links.map((l) => l.userId));
    if (farm && ids.includes(farm.ownerId)) active.add(farm.ownerId);
    return active;
  }

  private async handleAssigned(e: TaskAssignedEvent): Promise<void> {
    // A deactivated member no longer receives the farm's notifications.
    if (!(await this.activeMembers(e.farmId, [e.assigneeId])).has(e.assigneeId)) {
      return;
    }
    await this.sendToUsers(e.farmId, [e.assigneeId], {
      title: 'Nouvelle tâche',
      body: `${e.title} — pour le ${frDate(e.dueDate)}`,
      route: '/tasks',
    });
  }

  private async handleOverdue(e: TasksOverdueEvent): Promise<void> {
    // Each assignee hears about their own tasks; unassigned ones go to the
    // managers (who also get the farm-level TACHE alert).
    const byUser = new Map<string, string[]>();
    const unassigned: string[] = [];
    // A task held by a deactivated member goes to the managers instead.
    const active = await this.activeMembers(
      e.farmId,
      [...new Set(e.tasks.map((t) => t.assigneeId).filter((id): id is string => !!id))],
    );
    for (const t of e.tasks) {
      if (t.assigneeId && active.has(t.assigneeId)) {
        byUser.set(t.assigneeId, [
          ...(byUser.get(t.assigneeId) ?? []),
          t.title,
        ]);
      } else {
        unassigned.push(t.title);
      }
    }
    if (unassigned.length > 0) {
      const farm = await this.farmRepo.findOne({ where: { id: e.farmId } });
      for (const id of farm ? await this.farmManagers(farm) : []) {
        byUser.set(id, [...(byUser.get(id) ?? []), ...unassigned]);
      }
    }
    for (const [userId, titles] of byUser) {
      await this.sendToUsers(e.farmId, [userId], {
        title:
          titles.length === 1
            ? 'Tâche en retard'
            : `${titles.length} tâches en retard`,
        body: titles.join(' · '),
        route: '/tasks',
      });
    }
  }

  private track(work: Promise<void>): void {
    const p = work.catch((err) =>
      this.logger.warn(
        `Notification push non envoyée : ${err instanceof Error ? err.message : String(err)}`,
      ),
    );
    this.pending.add(p);
    void p.finally(() => this.pending.delete(p));
  }

  private async postToExpo(messages: PushMessage[]): Promise<void> {
    if (process.env.PUSH_DISABLED === 'true') return;
    const headers: Record<string, string> = {
      accept: 'application/json',
      'content-type': 'application/json',
    };
    if (process.env.EXPO_ACCESS_TOKEN) {
      headers.authorization = `Bearer ${process.env.EXPO_ACCESS_TOKEN}`;
    }
    const dead: string[] = [];
    for (let i = 0; i < messages.length; i += EXPO_BATCH) {
      const chunk = messages.slice(i, i + EXPO_BATCH);
      const res = await fetch(EXPO_PUSH_URL, {
        method: 'POST',
        headers,
        body: JSON.stringify(chunk),
      });
      if (!res.ok) throw new Error(`Expo Push HTTP ${res.status}`);
      const json = (await res.json()) as { data?: ExpoTicket[] };
      (json.data ?? []).forEach((ticket, idx) => {
        if (ticket.status !== 'error') return;
        if (ticket.details?.error === 'DeviceNotRegistered') {
          dead.push(chunk[idx].to);
        } else {
          this.logger.warn(`Expo Push : ${ticket.message}`);
        }
      });
    }
    // App uninstalled or permission revoked: stop sending to that token.
    if (dead.length > 0) {
      await this.deviceRepo.delete({ token: In(dead) });
    }
  }
}
