import {
  Column,
  CreateDateColumn,
  Entity,
  Index,
  PrimaryGeneratedColumn,
  UpdateDateColumn,
} from 'typeorm';
import { AlertLevel } from '../../../common/enums/alert-level.enum.js';
import {
  NotificationAudience,
  NotificationChannel,
  NotificationEvent,
} from '../../../common/enums/notification.enum.js';

/**
 * Who hears an event, and how (architecture §12): edited by the programme
 * administration, seeded with defaults that need no SMS provider. `code`
 * and `event` never change; a rule is deactivated, never deleted.
 */
@Index('UQ_notification_rules_program_code', ['programId', 'code'], {
  unique: true,
})
@Index('IDX_notification_rules_program_event', ['programId', 'event'])
@Entity('notification_rules')
export class NotificationRule {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ name: 'program_id', type: 'uuid' })
  programId: string;

  @Column({ type: 'varchar', length: 60 })
  code: string;

  @Column({ type: 'varchar', length: 200 })
  label: string;

  @Column({ type: 'enum', enum: NotificationEvent })
  event: NotificationEvent;

  @Column({ type: 'enum', enum: NotificationAudience })
  audience: NotificationAudience;

  /** Access profile code, for a PROFILE audience only. */
  @Column({ name: 'profile_code', type: 'varchar', length: 40, nullable: true })
  profileCode: string | null;

  /** `NotificationChannel` values; IN_APP always among them. */
  @Column({ type: 'jsonb', default: () => `'["IN_APP"]'` })
  channels: NotificationChannel[];

  /**
   * Minutes after which an unread notification escalates to an SMS (also
   * at once when the recipient has no registered phone for push). Null = no
   * escalation.
   */
  @Column({ name: 'escalate_after_min', type: 'int', nullable: true })
  escalateAfterMin: number | null;

  /** Events below this severity are not reported by this rule. */
  @Column({
    name: 'severity_min',
    type: 'enum',
    enum: AlertLevel,
    default: AlertLevel.VERT,
  })
  severityMin: AlertLevel;

  @Column({ default: true })
  active: boolean;

  /** Seeded default (still editable). */
  @Column({ default: false })
  system: boolean;

  @CreateDateColumn({ name: 'created_at', type: 'timestamptz' })
  createdAt: Date;

  @UpdateDateColumn({ name: 'updated_at', type: 'timestamptz' })
  updatedAt: Date;
}
