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
  InputDeliveryStatus,
  InputDeliverySource,
} from '../../../common/enums/input-delivery.enum.js';
import type { Farm } from '../../farms/entities/farm.entity.js';
import type { ProductionBatch } from '../../batches/entities/production-batch.entity.js';
import type { InputDeliveryLine } from './input-delivery-line.entity.js';

/**
 * Inputs shipped to a programme farm (CDC « Réception des intrants », POUFA
 * L4). Recorded by the DGE (INTRANTS:CREER, within its scope) or the platform
 * admin; the farmer confirms it with the quantities really received, which
 * creates the farm's input lots. Never deleted: cancelled before
 * confirmation at most. Status flow in `InputDeliveryStatus`.
 */
@Index('IDX_input_deliveries_farm_status', ['farmId', 'status'])
@Index('IDX_input_deliveries_status_shipped', ['status', 'shippedAt'])
@Index(
  'UQ_input_deliveries_farm_confirm_key',
  ['farmId', 'confirmIdempotencyKey'],
  { unique: true, where: '"confirm_idempotency_key" IS NOT NULL' },
)
@Entity('input_deliveries')
export class InputDelivery {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  /** `G1-0012-L03`: farm code + `IdCounter` rank (scope `LIVRAISON:<farm>`). */
  @Column({ type: 'varchar', length: 60, unique: true })
  code: string;

  @ManyToOne('Farm', { onDelete: 'RESTRICT' })
  @JoinColumn({ name: 'farm_id' })
  farm?: Farm;

  @Column({ name: 'farm_id', type: 'uuid' })
  farmId: string;

  /** Band the inputs are meant for (optional; may be set later for chicks). */
  @ManyToOne('ProductionBatch', { onDelete: 'RESTRICT', nullable: true })
  @JoinColumn({ name: 'band_id' })
  band?: ProductionBatch | null;

  @Column({ name: 'band_id', type: 'uuid', nullable: true })
  bandId: string | null;

  @Column({ type: 'enum', enum: InputDeliverySource })
  source: InputDeliverySource;

  /** Supplier name (mandatory for AUTRE; « État / SMAG » when absent). */
  @Column({
    name: 'supplier_name',
    type: 'varchar',
    length: 160,
    nullable: true,
  })
  supplierName: string | null;

  @Column({
    type: 'enum',
    enum: InputDeliveryStatus,
    default: InputDeliveryStatus.EXPEDIEE,
  })
  status: InputDeliveryStatus;

  @Column({ name: 'shipped_at', type: 'date' })
  shippedAt: string;

  /** Day the farmer received the inputs (declared at confirmation). */
  @Column({ name: 'received_date', type: 'date', nullable: true })
  receivedDate: string | null;

  @Column({ name: 'confirmed_at', type: 'timestamptz', nullable: true })
  confirmedAt: Date | null;

  @Column({ name: 'confirmed_by_id', type: 'uuid', nullable: true })
  confirmedById: string | null;

  /** Offline replay key of the confirmation (the mobile queues it). */
  @Column({
    name: 'confirm_idempotency_key',
    type: 'varchar',
    length: 120,
    nullable: true,
  })
  confirmIdempotencyKey: string | null;

  /** At least one line received ≠ shipped (each with its reason). */
  @Column({ name: 'has_discrepancy', type: 'boolean', default: false })
  hasDiscrepancy: boolean;

  @Column({ name: 'cancelled_at', type: 'timestamptz', nullable: true })
  cancelledAt: Date | null;

  @Column({ name: 'cancelled_by_id', type: 'uuid', nullable: true })
  cancelledById: string | null;

  @Column({ name: 'cancel_reason', type: 'text', nullable: true })
  cancelReason: string | null;

  @Column({ type: 'text', nullable: true })
  notes: string | null;

  @Column({ name: 'created_by_id', type: 'uuid', nullable: true })
  createdById: string | null;

  @OneToMany('InputDeliveryLine', (l: InputDeliveryLine) => l.delivery)
  lines?: InputDeliveryLine[];

  @CreateDateColumn({ name: 'created_at', type: 'timestamptz' })
  createdAt: Date;

  @UpdateDateColumn({ name: 'updated_at', type: 'timestamptz' })
  updatedAt: Date;
}
