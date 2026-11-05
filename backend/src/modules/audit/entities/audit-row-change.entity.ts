import { Column, Entity, Index, PrimaryGeneratedColumn } from 'typeorm';

/**
 * Audit journal, level 2: the row before and after each change of a key
 * table, written by the PostgreSQL trigger `audit_row_change()` (attached with
 * `SELECT audit_attach('table')`). The application never writes it directly.
 * Append-only, like `audit_events`.
 */
@Entity('audit_row_changes')
@Index('IDX_audit_row_changes_table_row', ['tableName', 'rowId'])
export class AuditRowChange {
  @PrimaryGeneratedColumn('increment', { type: 'bigint' })
  id: string;

  @Index('IDX_audit_row_changes_at')
  @Column({ type: 'timestamptz', default: () => 'now()' })
  at: Date;

  /** `app.request_id` of the transaction; null for a write outside a transaction. */
  @Index('IDX_audit_row_changes_request_id')
  @Column({ name: 'request_id', type: 'uuid', nullable: true })
  requestId: string | null;

  @Column({ name: 'actor_user_id', type: 'uuid', nullable: true })
  actorUserId: string | null;

  @Column({ type: 'bigint', default: () => 'txid_current()' })
  txid: string;

  @Column({ name: 'table_name', type: 'varchar', length: 100 })
  tableName: string;

  @Column({ name: 'row_id', type: 'text', nullable: true })
  rowId: string | null;

  /** I (insert), U (update) or D (delete). */
  @Column({ type: 'char', length: 1 })
  op: string;

  @Column({ type: 'jsonb', nullable: true })
  before: Record<string, unknown> | null;

  @Column({ type: 'jsonb', nullable: true })
  after: Record<string, unknown> | null;
}
