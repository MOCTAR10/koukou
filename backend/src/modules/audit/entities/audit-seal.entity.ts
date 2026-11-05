import { Column, Entity, PrimaryColumn } from 'typeorm';

/**
 * Daily seal of the audit journal: SHA-256 over the previous seal and every
 * event and row change of one UTC day (`audit-canonical.ts`). A removed,
 * altered or back-dated row changes the recomputed hash. Append-only.
 */
@Entity('audit_seals')
export class AuditSeal {
  /** UTC day, `YYYY-MM-DD`. */
  @PrimaryColumn({ type: 'date' })
  day: string;

  @Column({ name: 'events_count', type: 'int' })
  eventsCount: number;

  @Column({ name: 'row_changes_count', type: 'int' })
  rowChangesCount: number;

  @Column({ type: 'varchar', length: 64 })
  hash: string;

  /** Hash of the previous day's seal; null for the first seal. */
  @Column({ name: 'prev_hash', type: 'varchar', length: 64, nullable: true })
  prevHash: string | null;

  @Column({ name: 'sealed_at', type: 'timestamptz', default: () => 'now()' })
  sealedAt: Date;
}
