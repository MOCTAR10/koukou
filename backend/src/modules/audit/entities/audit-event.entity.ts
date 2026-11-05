import { Column, Entity, Index, PrimaryGeneratedColumn } from 'typeorm';
import { AuditAction } from '../../../common/enums/audit-action.enum.js';

/**
 * Audit journal, level 1: one row per action (write, sensitive read, export,
 * login). Append-only: a database trigger refuses UPDATE, DELETE and TRUNCATE
 * (migration `AuditJournal`). No foreign key on purpose: deleting a user or a
 * farm never touches the journal.
 */
@Entity('audit_events')
export class AuditEvent {
  @PrimaryGeneratedColumn('increment', { type: 'bigint' })
  id: string;

  @Index('IDX_audit_events_occurred_at')
  @Column({ name: 'occurred_at', type: 'timestamptz', default: () => 'now()' })
  occurredAt: Date;

  @Index('IDX_audit_events_request_id')
  @Column({ name: 'request_id', type: 'uuid', nullable: true })
  requestId: string | null;

  @Column({ type: 'enum', enum: AuditAction, enumName: 'audit_action_enum' })
  action: AuditAction;

  @Index('IDX_audit_events_actor_user_id')
  @Column({ name: 'actor_user_id', type: 'uuid', nullable: true })
  actorUserId: string | null;

  @Column({ name: 'actor_role', type: 'varchar', length: 40, nullable: true })
  actorRole: string | null;

  @Index('IDX_audit_events_farm_id')
  @Column({ name: 'farm_id', type: 'uuid', nullable: true })
  farmId: string | null;

  @Column({ type: 'varchar', length: 10 })
  method: string;

  /** Route template (`/farms/:farmId/batches/:batchId`), never the raw URL. */
  @Column({ type: 'varchar', length: 300 })
  route: string;

  @Column({ type: 'jsonb', nullable: true })
  params: Record<string, string> | null;

  @Column({ name: 'status_code', type: 'int', nullable: true })
  statusCode: number | null;

  @Column({ type: 'varchar', length: 64, nullable: true })
  ip: string | null;

  @Column({ name: 'user_agent', type: 'varchar', length: 300, nullable: true })
  userAgent: string | null;

  /** `idempotencyKey` of an offline mobile op, when the body carries one. */
  @Column({
    name: 'offline_op_id',
    type: 'varchar',
    length: 120,
    nullable: true,
  })
  offlineOpId: string | null;

  /** Request body without secrets, strings cut at 500 chars, ~8 KB at most. */
  @Column({ type: 'jsonb', nullable: true })
  summary: Record<string, unknown> | null;

  @Column({ name: 'error_message', type: 'text', nullable: true })
  errorMessage: string | null;
}
