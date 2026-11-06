import {
  Column,
  CreateDateColumn,
  Entity,
  Index,
  JoinColumn,
  ManyToOne,
  PrimaryGeneratedColumn,
  UpdateDateColumn,
} from 'typeorm';
import { AlertLevel } from '../../../common/enums/alert-level.enum.js';
import {
  NotificationChannel,
  NotificationEvent,
  NotificationStatus,
} from '../../../common/enums/notification.enum.js';
import type { User } from '../../users/entities/user.entity.js';

/** Data the client needs to open the notification's subject. */
export interface NotificationPayload {
  /** In-app route of the subject. */
  route: string;
  /** Minimal SMS text (no diagnosis, no exploitant name). */
  sms: string;
}

/**
 * One notification of one user on one channel (architecture §12). The rows
 * of a user for the same occurrence share `dedupKey` (one alert = one SMS,
 * not one per re-evaluation); reading any of them reads them all and stops
 * the escalation.
 */
@Index(
  'UQ_notifications_user_dedup_channel',
  ['userId', 'dedupKey', 'channel'],
  { unique: true },
)
@Index('IDX_notifications_user_channel_created', [
  'userId',
  'channel',
  'createdAt',
])
@Index('IDX_notifications_status_next_attempt', ['status', 'nextAttemptAt'])
@Entity('notifications')
export class Notification {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @ManyToOne('User', { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'user_id' })
  user?: User;

  @Column({ name: 'user_id', type: 'uuid' })
  userId: string;

  @Column({ name: 'farm_id', type: 'uuid', nullable: true })
  farmId: string | null;

  @Column({ name: 'rule_id', type: 'uuid', nullable: true })
  ruleId: string | null;

  @Column({ type: 'enum', enum: NotificationEvent })
  event: NotificationEvent;

  /** Alert, declaration or band the notification is about. */
  @Column({ name: 'subject_id', type: 'uuid', nullable: true })
  subjectId: string | null;

  @Column({ name: 'dedup_key', type: 'varchar', length: 200 })
  dedupKey: string;

  @Column({ type: 'enum', enum: AlertLevel })
  severity: AlertLevel;

  @Column({ type: 'varchar', length: 200 })
  title: string;

  @Column({ type: 'text' })
  body: string;

  @Column({ type: 'jsonb' })
  payload: NotificationPayload;

  @Column({ type: 'enum', enum: NotificationChannel })
  channel: NotificationChannel;

  @Column({ type: 'enum', enum: NotificationStatus })
  status: NotificationStatus;

  @Column({ type: 'int', default: 0 })
  attempts: number;

  @Column({ name: 'last_error', type: 'text', nullable: true })
  lastError: string | null;

  /** SMS: next send attempt (retry with a growing delay). */
  @Column({ name: 'next_attempt_at', type: 'timestamptz', nullable: true })
  nextAttemptAt: Date | null;

  /** Lead row of an occurrence: escalate to SMS at this time if still unread. */
  @Column({ name: 'escalate_at', type: 'timestamptz', nullable: true })
  escalateAt: Date | null;

  @Column({ name: 'escalated_at', type: 'timestamptz', nullable: true })
  escalatedAt: Date | null;

  /** The notification this SMS escalates. */
  @Column({ name: 'escalated_from_id', type: 'uuid', nullable: true })
  escalatedFromId: string | null;

  @Column({ name: 'sent_at', type: 'timestamptz', nullable: true })
  sentAt: Date | null;

  @Column({ name: 'delivered_at', type: 'timestamptz', nullable: true })
  deliveredAt: Date | null;

  @Column({ name: 'read_at', type: 'timestamptz', nullable: true })
  readAt: Date | null;

  @CreateDateColumn({ name: 'created_at', type: 'timestamptz' })
  createdAt: Date;

  @UpdateDateColumn({ name: 'updated_at', type: 'timestamptz' })
  updatedAt: Date;
}
