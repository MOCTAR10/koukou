import {
  Column,
  CreateDateColumn,
  Entity,
  Index,
  JoinColumn,
  ManyToOne,
  PrimaryGeneratedColumn,
} from 'typeorm';
import type { ProductionBatch } from '../../batches/entities/production-batch.entity.js';

export type BandeSnapshotTrigger =
  | 'CLOTURE_AUTO'
  | 'CLOTURE_MANUELLE'
  | 'CORRECTION';

/** One indicator of a frozen bilan, with the formula version that produced it. */
export interface SnapshotIndicator {
  key: string;
  label: string;
  unit: string;
  value: number | null;
  expression: string;
  parameterKey: string;
  /** `program_parameters.id` used; null when the catalog default applied. */
  parameterVersionId: string | null;
  validFrom: string | null;
}

/**
 * Frozen bilan of a closed POUFA band (CDC « Clôture et bilan de bande »).
 * Rows are immutable (DB trigger): a privileged correction of a closed band
 * adds a new version, so the earlier bilan stays readable as it was.
 */
@Index('UQ_bande_snapshots_batch_version', ['batchId', 'version'], {
  unique: true,
})
@Entity('bande_snapshots')
export class BandeSnapshot {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @ManyToOne('ProductionBatch', { onDelete: 'RESTRICT' })
  @JoinColumn({ name: 'batch_id' })
  batch?: ProductionBatch;

  @Column({ name: 'batch_id', type: 'uuid' })
  batchId: string;

  @Column({ name: 'farm_id', type: 'uuid' })
  @Index()
  farmId: string;

  /** 1 at closure, +1 per correction. */
  @Column({ type: 'int' })
  version: number;

  @Column({ type: 'varchar', length: 20 })
  trigger: BandeSnapshotTrigger;

  /** Mandatory for a correction. */
  @Column({ type: 'text', nullable: true })
  reason: string | null;

  /** Date the bilan is computed at (closure day). */
  @Column({ name: 'as_of', type: 'date' })
  asOf: string;

  /** Opening → closure, in days. */
  @Column({ name: 'duration_days', type: 'int' })
  durationDays: number;

  /** Age of the birds at closure (initial age + duration). */
  @Column({ name: 'age_days', type: 'int' })
  ageDays: number;

  /** Base variables fed to the formulas (volumes, weights, feed, money). */
  @Column({ type: 'jsonb' })
  variables: Record<string, number | null>;

  @Column({ type: 'jsonb' })
  indicators: SnapshotIndicator[];

  @Column({ name: 'revenue_fcfa', type: 'int', nullable: true })
  revenueFcfa: number | null;

  @Column({ name: 'charges_fcfa', type: 'int', nullable: true })
  chargesFcfa: number | null;

  @Column({ name: 'margin_fcfa', type: 'int', nullable: true })
  marginFcfa: number | null;

  /** Days entered / days elapsed × 100 (from `bande_daily_stats`). */
  @Column({ name: 'completeness_pct', type: 'float', nullable: true })
  completenessPct: number | null;

  @Column({ name: 'created_by_id', type: 'uuid', nullable: true })
  createdById: string | null;

  @CreateDateColumn({ name: 'created_at', type: 'timestamptz' })
  createdAt: Date;
}
