import {
  Column,
  CreateDateColumn,
  Entity,
  Index,
  PrimaryGeneratedColumn,
  UpdateDateColumn,
} from 'typeorm';
import {
  ImportJobStatus,
  ImportJobType,
} from '../../../common/enums/import-job.enum.js';

/** Line counts kept on the job for lists (recomputed at every step). */
export interface ImportJobCounts {
  read: number;
  valid: number;
  warnings: number;
  errors: number;
  excluded: number;
  corrected: number;
  /** Planned by the controls, then the dry run's, then the integration's. */
  integrated: number;
  enriched: number;
  alreadyPresent: number;
  rejected: number;
}

export interface ImportJobOptions {
  /** Integrate lines flagged as probable duplicates anyway. */
  confirmDuplicate: boolean;
}

/**
 * A data recovery job (CDC §9 « reprise complète et contrôlée »): one file
 * deposited, mapped, controlled line by line in staging (`import_rows`), dry
 * run, validated by an authorised profile, then integrated through the
 * registry and band services. Never deleted: it is the recovery report.
 */
@Index('IDX_import_jobs_program_created', ['programId', 'createdAt'])
@Entity('import_jobs')
export class ImportJob {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ name: 'program_id', type: 'uuid' })
  programId: string;

  @Column({ type: 'varchar', length: 30 })
  type: ImportJobType;

  @Column({ type: 'varchar', length: 20 })
  status: ImportJobStatus;

  @Column({ name: 'file_name', type: 'varchar', length: 255 })
  fileName: string;

  @Column({ name: 'file_size', type: 'int' })
  fileSize: number;

  /** SHA-256 of the deposited bytes (same file deposited twice is flagged). */
  @Column({ name: 'file_sha256', type: 'varchar', length: 64 })
  @Index()
  fileSha256: string;

  /** `utf-8` or `latin1`, as detected. */
  @Column({ type: 'varchar', length: 10 })
  encoding: string;

  @Column({ type: 'varchar', length: 1 })
  delimiter: string;

  /** Header line of the file, as read. */
  @Column({ type: 'jsonb' })
  headers: string[];

  /** Header → field key (`null` = ignored), automatic then adjusted. */
  @Column({ name: 'column_mapping', type: 'jsonb' })
  columnMapping: Record<string, string | null>;

  @Column({ name: 'unknown_columns', type: 'jsonb', default: () => "'[]'" })
  unknownColumns: string[];

  /** French reason the file cannot be mapped (missing column), or null. */
  @Column({ name: 'mapping_error', type: 'text', nullable: true })
  mappingError: string | null;

  @Column({ type: 'jsonb' })
  options: ImportJobOptions;

  @Column({ type: 'jsonb' })
  counts: ImportJobCounts;

  /** Free note of the depositor (origin of the file, campaign…). */
  @Column({ type: 'varchar', length: 500, nullable: true })
  note: string | null;

  @Column({ name: 'created_by_id', type: 'uuid', nullable: true })
  createdById: string | null;

  @Column({ name: 'analysed_at', type: 'timestamptz', nullable: true })
  analysedAt: Date | null;

  @Column({ name: 'controlled_at', type: 'timestamptz', nullable: true })
  controlledAt: Date | null;

  @Column({ name: 'dry_run_at', type: 'timestamptz', nullable: true })
  dryRunAt: Date | null;

  @Column({ name: 'dry_run_by_id', type: 'uuid', nullable: true })
  dryRunById: string | null;

  @Column({ name: 'validated_at', type: 'timestamptz', nullable: true })
  validatedAt: Date | null;

  @Column({ name: 'validated_by_id', type: 'uuid', nullable: true })
  validatedById: string | null;

  @Column({
    name: 'validation_comment',
    type: 'varchar',
    length: 500,
    nullable: true,
  })
  validationComment: string | null;

  @Column({ name: 'integrated_at', type: 'timestamptz', nullable: true })
  integratedAt: Date | null;

  @Column({ name: 'integrated_by_id', type: 'uuid', nullable: true })
  integratedById: string | null;

  @Column({ name: 'rejected_at', type: 'timestamptz', nullable: true })
  rejectedAt: Date | null;

  @Column({ name: 'rejected_by_id', type: 'uuid', nullable: true })
  rejectedById: string | null;

  @Column({
    name: 'rejection_reason',
    type: 'varchar',
    length: 500,
    nullable: true,
  })
  rejectionReason: string | null;

  @CreateDateColumn({ name: 'created_at', type: 'timestamptz' })
  createdAt: Date;

  @UpdateDateColumn({ name: 'updated_at', type: 'timestamptz' })
  updatedAt: Date;
}
