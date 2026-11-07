import {
  Column,
  CreateDateColumn,
  Entity,
  Index,
  JoinColumn,
  ManyToOne,
  OneToMany,
  PrimaryGeneratedColumn,
  UpdateDateColumn,
} from 'typeorm';
import {
  BiosecurityClass,
  VisitType,
} from '../../../common/enums/visit.enum.js';
import type { ProductionBatch } from '../../batches/entities/production-batch.entity.js';
import type { Farm } from '../../farms/entities/farm.entity.js';
import type { User } from '../../users/entities/user.entity.js';
import type { FarmVisitAnswer } from './farm-visit-answer.entity.js';

/**
 * Technical visit of an agent to a programme farm (CDC n° 45), optionally
 * about one band, with the biosecurity grid filled on site (n° 27) and the
 * agent's visa of a period of the band's records (§3.2). Immutable once
 * recorded (a correction is a new visit); journaled; never deleted. The score
 * and class are computed once, from the grid and the thresholds in force on
 * the visit day, and stored.
 */
@Index('IDX_farm_visits_farm_date', ['farmId', 'visitDate'])
@Index('IDX_farm_visits_batch', ['batchId'])
@Index('UQ_farm_visits_farm_idempotency', ['farmId', 'idempotencyKey'], {
  unique: true,
  where: '"idempotency_key" IS NOT NULL',
})
@Entity('farm_visits')
export class FarmVisit {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @ManyToOne('Farm', { onDelete: 'RESTRICT' })
  @JoinColumn({ name: 'farm_id' })
  farm?: Farm;

  @Column({ name: 'farm_id', type: 'uuid' })
  farmId: string;

  @ManyToOne('ProductionBatch', { onDelete: 'RESTRICT', nullable: true })
  @JoinColumn({ name: 'batch_id' })
  batch?: ProductionBatch | null;

  @Column({ name: 'batch_id', type: 'uuid', nullable: true })
  batchId: string | null;

  @Column({ name: 'visit_date', type: 'date' })
  visitDate: string;

  @Column({ type: 'enum', enum: VisitType })
  type: VisitType;

  @ManyToOne('User', { onDelete: 'RESTRICT' })
  @JoinColumn({ name: 'agent_user_id' })
  agent?: User;

  @Column({ name: 'agent_user_id', type: 'uuid' })
  agentUserId: string;

  @Column({ type: 'text', nullable: true })
  observations: string | null;

  @Column({ type: 'text', nullable: true })
  recommendations: string | null;

  @Column({ type: 'double precision', nullable: true })
  latitude: number | null;

  @Column({ type: 'double precision', nullable: true })
  longitude: number | null;

  @Column({ name: 'next_visit_date', type: 'date', nullable: true })
  nextVisitDate: string | null;

  /** Agent's visa: period of the band's records checked on site (both set, or none). */
  @Column({ name: 'visa_from', type: 'date', nullable: true })
  visaFrom: string | null;

  @Column({ name: 'visa_to', type: 'date', nullable: true })
  visaTo: string | null;

  /** Biosecurity score in %, null when no criterion was assessed. */
  @Column({
    name: 'score_pct',
    type: 'numeric',
    precision: 5,
    scale: 1,
    nullable: true,
    transformer: {
      to: (v: number | null) => v,
      from: (v: string | null) => (v == null ? null : Number(v)),
    },
  })
  scorePct: number | null;

  @Column({
    type: 'enum',
    enum: BiosecurityClass,
    nullable: true,
  })
  classification: BiosecurityClass | null;

  /** Thresholds (A, B) in force when the class was computed. */
  @Column({ type: 'jsonb', nullable: true })
  thresholds: { a: number; b: number } | null;

  /** Phone clock at capture (offline visits keep their own time). */
  @Column({ name: 'captured_at', type: 'timestamptz', nullable: true })
  capturedAt: Date | null;

  /** Offline replay key (`op.id`): a replay returns the existing visit. */
  @Column({
    name: 'idempotency_key',
    type: 'varchar',
    length: 120,
    nullable: true,
  })
  idempotencyKey: string | null;

  @OneToMany('FarmVisitAnswer', 'visit')
  answers?: FarmVisitAnswer[];

  @CreateDateColumn({ name: 'created_at', type: 'timestamptz' })
  createdAt: Date;

  @UpdateDateColumn({ name: 'updated_at', type: 'timestamptz' })
  updatedAt: Date;
}
