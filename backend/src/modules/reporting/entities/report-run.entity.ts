import {
  Column,
  CreateDateColumn,
  Entity,
  Index,
  JoinColumn,
  ManyToOne,
  PrimaryGeneratedColumn,
} from 'typeorm';
import { ReportLevel } from '../../../common/enums/report.enum.js';
import type { ReportTemplate } from './report-template.entity.js';

/** One recipient of a run, and why. */
export interface ReportRecipient {
  userId: string;
  /** OWNER (the farm's exploitant) or MEMBER (an institutional account). */
  kind: 'OWNER' | 'MEMBER';
  profileCode: string | null;
}

/**
 * One generated report (CDC « Rapports périodiques automatiques »): the PDF,
 * its SHA-256 fingerprint and the recipients told it is available. Rows are
 * immutable (DB trigger); one run per template, scope and period.
 */
@Index(
  'UQ_report_runs_template_scope_period',
  ['templateId', 'scopeKey', 'periodStart'],
  { unique: true },
)
@Index('IDX_report_runs_program_created', ['programId', 'createdAt'])
@Entity('report_runs')
export class ReportRun {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @ManyToOne('ReportTemplate', { onDelete: 'RESTRICT' })
  @JoinColumn({ name: 'template_id' })
  template?: ReportTemplate;

  @Column({ name: 'template_id', type: 'uuid' })
  templateId: string;

  @Column({ name: 'program_id', type: 'uuid' })
  programId: string;

  /** Template code at generation (display, filters). */
  @Column({ name: 'template_code', type: 'varchar', length: 40 })
  templateCode: string;

  @Column({ type: 'varchar', length: 200 })
  title: string;

  @Column({ type: 'varchar', length: 20 })
  level: ReportLevel;

  /** `NATIONAL`, `PROVINCE:<code>` or `BANDE:<batch id>`. */
  @Column({ name: 'scope_key', type: 'varchar', length: 80 })
  scopeKey: string;

  @Column({ name: 'province_id', type: 'uuid', nullable: true })
  provinceId: string | null;

  @Column({ name: 'farm_id', type: 'uuid', nullable: true })
  @Index()
  farmId: string | null;

  @Column({ name: 'batch_id', type: 'uuid', nullable: true })
  batchId: string | null;

  @Column({ name: 'period_start', type: 'date' })
  periodStart: string;

  @Column({ name: 'period_end', type: 'date' })
  periodEnd: string;

  /** The PDF lists farms by name (never served to an aggregate-only account). */
  @Column({ name: 'has_farm_rows', type: 'boolean' })
  hasFarmRows: boolean;

  /** The PDF itself; not selected by default (lists never carry it). */
  @Column({ type: 'bytea', select: false })
  pdf?: Buffer;

  @Column({ name: 'size_bytes', type: 'int' })
  sizeBytes: number;

  /** SHA-256 of the PDF, hex. */
  @Column({ type: 'char', length: 64 })
  sha256: string;

  @Column({ type: 'jsonb' })
  recipients: ReportRecipient[];

  /** Null when the hourly sweep produced it. */
  @Column({ name: 'generated_by_id', type: 'uuid', nullable: true })
  generatedById: string | null;

  @CreateDateColumn({ name: 'created_at', type: 'timestamptz' })
  createdAt: Date;
}
