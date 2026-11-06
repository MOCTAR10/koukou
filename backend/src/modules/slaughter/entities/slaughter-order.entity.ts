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
import { SlaughterDestination } from '../../../common/enums/slaughter-destination.enum.js';
import { SlaughterStatus } from '../../../common/enums/slaughter-status.enum.js';
import { SlaughterType } from '../../../common/enums/slaughter-type.enum.js';
import { ProductionBatch } from '../../batches/entities/production-batch.entity.js';
import { Farm } from '../../farms/entities/farm.entity.js';
import { User } from '../../users/entities/user.entity.js';
import type { Operator } from '../../trace/entities/operator.entity.js';

@Entity('slaughter_orders')
export class SlaughterOrder {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @ManyToOne(() => Farm, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'farm_id' })
  farm: Farm;

  @Column({ name: 'farm_id', type: 'uuid' })
  @Index()
  farmId: string;

  @ManyToOne(() => ProductionBatch, { onDelete: 'RESTRICT', eager: true })
  @JoinColumn({ name: 'batch_id' })
  batch: ProductionBatch;

  @Column({ name: 'batch_id', type: 'uuid' })
  @Index()
  batchId: string;

  @Column({ name: 'reference_number' })
  referenceNumber: string;

  @Column({ type: 'enum', enum: SlaughterType })
  slaughterType: SlaughterType;

  @Column({ type: 'enum', enum: SlaughterDestination })
  destination: SlaughterDestination;

  @Column({ name: 'planned_date', type: 'date' })
  plannedDate: string;

  @Column({ name: 'bird_count', type: 'int' })
  birdCount: number;

  /** Carcasses de cet ordre disponibles à la vente (POS « abattu »). */
  @Column({ name: 'carcasses_available', type: 'int', default: 0 })
  carcassesAvailable: number;

  @Column({ name: 'total_weight_kg', type: 'float', nullable: true })
  totalWeightKg: number | null;

  @Column({ name: 'carcass_weight_kg', type: 'float', nullable: true })
  carcassWeightKg: number | null;

  @Column({ name: 'rendement_percent', type: 'float', nullable: true })
  rendementPercent: number | null;

  @Column({ name: 'internal_batch_code', type: 'varchar', nullable: true })
  internalBatchCode: string | null;

  @Column({ name: 'abattoir_lot_code', type: 'varchar', nullable: true })
  abattoirLotCode: string | null;

  /**
   * POUFA lot A2 divers (F4): programme operator (abattoir) receiving the
   * birds; processing the order cedes the lot to it (sub-lot, signed QR).
   */
  @ManyToOne('Operator', { onDelete: 'RESTRICT', nullable: true })
  @JoinColumn({ name: 'operator_id' })
  operator?: Operator | null;

  @Column({ name: 'operator_id', type: 'uuid', nullable: true })
  operatorId: string | null;

  @Column({
    type: 'enum',
    enum: SlaughterStatus,
    default: SlaughterStatus.DRAFT,
  })
  status: SlaughterStatus;

  @Column({ name: 'processed_at', type: 'timestamptz', nullable: true })
  processedAt: Date | null;

  @Column({ name: 'abattoir_notes', type: 'text', nullable: true })
  abattoirNotes: string | null;

  @ManyToOne(() => User, { nullable: true })
  @JoinColumn({ name: 'created_by' })
  createdBy: User | null;

  @Column({ name: 'created_by', type: 'uuid', nullable: true })
  createdById: string | null;

  @CreateDateColumn({ name: 'created_at' })
  createdAt: Date;

  @UpdateDateColumn({ name: 'updated_at' })
  updatedAt: Date;
}
