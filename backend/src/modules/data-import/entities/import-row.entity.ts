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
import {
  ImportRowOutcome,
  ImportRowStatus,
} from '../../../common/enums/import-job.enum.js';
import type { ImportJob } from './import-job.entity.js';

/** One manual correction of a staging line (CDC: « corrections manuelles »). */
export interface ImportRowCorrection {
  at: string;
  byId: string;
  reason: string;
  changes: { field: string; before: string | null; after: string | null }[];
  /** Set when the correction excludes (true) or restores (false) the line. */
  excluded?: boolean;
}

/**
 * Staging line of an import job: the raw cells as read, the values mapped to
 * the job's fields (after manual corrections), the controls' errors and
 * warnings, then the dry run's and the integration's outcome.
 *
 * Not journaled at row level (no `audit_attach`): staging is rewritten
 * wholesale at every re-analysis and holds the file's raw personal data.
 * Corrections are kept on the line itself (who, when, why, before/after) and
 * every request is journaled at level 1.
 */
@Index('UQ_import_rows_job_line', ['jobId', 'line'], { unique: true })
@Entity('import_rows')
export class ImportRow {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @ManyToOne('ImportJob', { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'job_id' })
  job?: ImportJob;

  @Column({ name: 'job_id', type: 'uuid' })
  jobId: string;

  /** Line in the file (header = line 1). */
  @Column({ type: 'int' })
  line: number;

  /** Cells as read, in the header's order. */
  @Column({ type: 'jsonb' })
  raw: string[];

  /** Field key → text value, mapped then corrected. */
  @Column({ type: 'jsonb' })
  values: Record<string, string>;

  @Column({ type: 'varchar', length: 20 })
  status: ImportRowStatus;

  /** What the controls plan for the line. */
  @Column({
    name: 'planned_outcome',
    type: 'varchar',
    length: 20,
    nullable: true,
  })
  plannedOutcome: ImportRowOutcome | null;

  /** Lines integrated together (a band and its daily entries). */
  @Column({ name: 'group_key', type: 'varchar', length: 200, nullable: true })
  groupKey: string | null;

  /** Source key kept for idempotency (AMI reference, legacy band id). */
  @Column({ name: 'source_key', type: 'varchar', length: 200, nullable: true })
  sourceKey: string | null;

  @Column({ type: 'jsonb', default: () => "'[]'" })
  errors: string[];

  @Column({ type: 'jsonb', default: () => "'[]'" })
  warnings: string[];

  /** Extra findings (duplicate candidates, fields to complete…). */
  @Column({ type: 'jsonb', nullable: true })
  details: Record<string, unknown> | null;

  @Column({ type: 'boolean', default: false })
  excluded: boolean;

  @Column({ type: 'jsonb', default: () => "'[]'" })
  corrections: ImportRowCorrection[];

  @Column({
    name: 'dry_run_outcome',
    type: 'varchar',
    length: 20,
    nullable: true,
  })
  dryRunOutcome: ImportRowOutcome | null;

  @Column({ name: 'dry_run_message', type: 'text', nullable: true })
  dryRunMessage: string | null;

  @Column({ name: 'dry_run_code', type: 'varchar', length: 60, nullable: true })
  dryRunCode: string | null;

  @Column({ type: 'varchar', length: 20, nullable: true })
  outcome: ImportRowOutcome | null;

  @Column({ name: 'outcome_message', type: 'text', nullable: true })
  outcomeMessage: string | null;

  /** Farm or band written (or matched) by the integration. */
  @Column({ name: 'target_id', type: 'uuid', nullable: true })
  targetId: string | null;

  @Column({ name: 'target_code', type: 'varchar', length: 60, nullable: true })
  targetCode: string | null;

  @CreateDateColumn({ name: 'created_at', type: 'timestamptz' })
  createdAt: Date;

  @UpdateDateColumn({ name: 'updated_at', type: 'timestamptz' })
  updatedAt: Date;
}
