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
import { SanitaryAlertOrigin } from '../../../common/enums/sanitary-alert.enum.js';
import type { ProductionBatch } from '../../batches/entities/production-batch.entity.js';
import type { Farm } from '../../farms/entities/farm.entity.js';
import type { HealthEvent } from '../../sanitary/entities/health-event.entity.js';

/**
 * Official sanitary alert (POUFA plan §10, CDC « Alerte précoce » and
 * « Qualification et validation des alertes »), distinct from Fermia's
 * advisory `Alert`. Opened automatically when a band's mortality of the day
 * passes the veterinary threshold (`SEUIL_ALERTE_MORTALITE_JOUR_PCT`, read
 * at the fact's date from `bande_daily_stats`) or by a declaration of
 * suspicion. Statuses are STATUT_ALERTE list items; the code reacts to their
 * family only. Never deleted. Until `publishedAt`, only the farm and the
 * veterinary services see it.
 */
@Index('IDX_sanitary_alerts_program_published', ['programId', 'publishedAt'])
@Index('IDX_sanitary_alerts_batch_origin', ['batchId', 'origin'])
@Index('UQ_sanitary_alerts_health_event', ['healthEventId'], {
  unique: true,
  where: '"health_event_id" IS NOT NULL',
})
@Entity('sanitary_alerts')
export class SanitaryAlert {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  /** `AS-2026-0001` (IdCounter scope `ALERTE_SANITAIRE:<year>`), never changed. */
  @Column({ type: 'varchar', length: 20, unique: true })
  code: string;

  @Column({ name: 'program_id', type: 'uuid' })
  programId: string;

  @ManyToOne('Farm', { onDelete: 'RESTRICT' })
  @JoinColumn({ name: 'farm_id' })
  farm?: Farm;

  @Column({ name: 'farm_id', type: 'uuid' })
  @Index()
  farmId: string;

  @ManyToOne('ProductionBatch', { onDelete: 'RESTRICT', nullable: true })
  @JoinColumn({ name: 'batch_id' })
  batch?: ProductionBatch | null;

  @Column({ name: 'batch_id', type: 'uuid', nullable: true })
  batchId: string | null;

  /** Province of the farm when the alert opened (dashboards by province). */
  @Column({ name: 'province_id', type: 'uuid', nullable: true })
  @Index()
  provinceId: string | null;

  @Column({ type: 'enum', enum: SanitaryAlertOrigin })
  origin: SanitaryAlertOrigin;

  /** The declaration of suspicion (kept null if the declaration is deleted). */
  @ManyToOne('HealthEvent', { onDelete: 'SET NULL', nullable: true })
  @JoinColumn({ name: 'health_event_id' })
  healthEvent?: HealthEvent | null;

  @Column({ name: 'health_event_id', type: 'uuid', nullable: true })
  healthEventId: string | null;

  /** Current STATUT_ALERTE item code. */
  @Column({ name: 'status_code', type: 'varchar', length: 40 })
  statusCode: string;

  /** Family of the current status (copy, read by the code). */
  @Column({ name: 'status_family', type: 'varchar', length: 40 })
  statusFamily: string;

  /** CONFIRMEE or INFIRMEE once qualified (kept after closing). */
  @Column({ type: 'varchar', length: 20, nullable: true })
  outcome: string | null;

  @Column({ type: 'enum', enum: AlertLevel })
  severity: AlertLevel;

  /** Day of the fact (first day past the threshold, or the declaration's date). */
  @Column({ name: 'fact_day', type: 'date' })
  factDay: string;

  /** Last day past the threshold reported on this alert. */
  @Column({ name: 'last_fact_day', type: 'date' })
  lastFactDay: string;

  /** Highest mortality of the day (%) reported on this alert. */
  @Column({ name: 'mortality_pct', type: 'float', nullable: true })
  mortalityPct: number | null;

  /** Threshold in force on `factDay`. */
  @Column({ name: 'threshold_pct', type: 'float', nullable: true })
  thresholdPct: number | null;

  /** Deaths and headcount at the start of `factDay`. */
  @Column({ type: 'int', nullable: true })
  deaths: number | null;

  @Column({ name: 'present_start', type: 'int', nullable: true })
  presentStart: number | null;

  /** SIGNE_CLINIQUE codes of the declaration. */
  @Column({ name: 'clinical_signs', type: 'jsonb', default: () => "'[]'" })
  clinicalSigns: string[];

  @Column({ type: 'varchar', length: 300 })
  summary: string;

  @Column({ name: 'published_at', type: 'timestamptz', nullable: true })
  publishedAt: Date | null;

  @Column({ name: 'published_by_id', type: 'uuid', nullable: true })
  publishedById: string | null;

  @Column({ name: 'closed_at', type: 'timestamptz', nullable: true })
  closedAt: Date | null;

  /** Null when opened automatically. */
  @Column({ name: 'created_by_id', type: 'uuid', nullable: true })
  createdById: string | null;

  @CreateDateColumn({ name: 'created_at', type: 'timestamptz' })
  createdAt: Date;

  @UpdateDateColumn({ name: 'updated_at', type: 'timestamptz' })
  updatedAt: Date;
}
