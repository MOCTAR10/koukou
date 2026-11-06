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
  TraceLotKind,
  TraceLotStatus,
} from '../../../common/enums/trace.enum.js';
import type { ProductionBatch } from '../../batches/entities/production-batch.entity.js';
import type { Sortie } from '../../bandes/entities/sortie.entity.js';
import type { Farm } from '../../farms/entities/farm.entity.js';
import type { Program } from '../../programme/entities/program.entity.js';
import type { Operator } from './operator.entity.js';

/**
 * Traceability lot (CDC §6, architecture §11): the root lot of a band
 * (`G1-0012-B07-L01`, created with the band) and the sub-lots ceded to an
 * operator (`…-L01-03`, one per cession = a sortie towards an operator).
 * Codes come from `IdCounter` and are never changed nor reused (DB trigger).
 * `qrToken` is the truncated HMAC signature printed in the QR address.
 */
@Index('UQ_trace_lots_root_per_batch', ['batchId'], {
  unique: true,
  where: '"parent_id" IS NULL',
})
@Index('UQ_trace_lots_sortie', ['sortieId'], {
  unique: true,
  where: '"sortie_id" IS NOT NULL',
})
@Entity('trace_lots')
export class TraceLot {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @ManyToOne('Program', { onDelete: 'RESTRICT' })
  @JoinColumn({ name: 'program_id' })
  program?: Program;

  @Column({ name: 'program_id', type: 'uuid' })
  programId: string;

  @ManyToOne('Farm', { onDelete: 'RESTRICT' })
  @JoinColumn({ name: 'farm_id' })
  farm?: Farm;

  @Column({ name: 'farm_id', type: 'uuid' })
  @Index()
  farmId: string;

  @ManyToOne('ProductionBatch', { onDelete: 'RESTRICT' })
  @JoinColumn({ name: 'batch_id' })
  batch?: ProductionBatch;

  @Column({ name: 'batch_id', type: 'uuid' })
  @Index()
  batchId: string;

  @ManyToOne('TraceLot', { onDelete: 'RESTRICT', nullable: true })
  @JoinColumn({ name: 'parent_id' })
  parent?: TraceLot | null;

  @Column({ name: 'parent_id', type: 'uuid', nullable: true })
  @Index()
  parentId: string | null;

  @Column({ type: 'enum', enum: TraceLotKind })
  kind: TraceLotKind;

  @Column({ type: 'varchar', length: 60, unique: true })
  code: string;

  /** Heads in the lot (band start, or birds ceded). */
  @Column({ type: 'int' })
  quantity: number;

  /** Live weight ceded (kg), when weighed. */
  @Column({ name: 'weight_kg', type: 'float', nullable: true })
  weightKg: number | null;

  @Column({
    type: 'enum',
    enum: TraceLotStatus,
    default: TraceLotStatus.OUVERT,
  })
  status: TraceLotStatus;

  /** Signature printed in the QR address (`?s=`). */
  @Column({ name: 'qr_token', type: 'varchar', length: 32 })
  qrToken: string;

  /** Operator the sub-lot was ceded to. */
  @ManyToOne('Operator', { onDelete: 'RESTRICT', nullable: true })
  @JoinColumn({ name: 'operator_id' })
  operator?: Operator | null;

  @Column({ name: 'operator_id', type: 'uuid', nullable: true })
  operatorId: string | null;

  /** Sortie that created the sub-lot (one sub-lot per sortie). */
  @ManyToOne('Sortie', { onDelete: 'RESTRICT', nullable: true })
  @JoinColumn({ name: 'sortie_id' })
  sortie?: Sortie | null;

  @Column({ name: 'sortie_id', type: 'uuid', nullable: true })
  sortieId: string | null;

  /** Date of the cession (the sortie's date). */
  @Column({ name: 'ceded_on', type: 'date', nullable: true })
  cededOn: string | null;

  @Column({ name: 'closed_at', type: 'timestamptz', nullable: true })
  closedAt: Date | null;

  @Column({ name: 'created_by_id', type: 'uuid', nullable: true })
  createdById: string | null;

  @CreateDateColumn({ name: 'created_at', type: 'timestamptz' })
  createdAt: Date;

  @UpdateDateColumn({ name: 'updated_at', type: 'timestamptz' })
  updatedAt: Date;
}
