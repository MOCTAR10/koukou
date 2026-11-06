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
import type { ProductionBatch } from '../../batches/entities/production-batch.entity.js';

/** MOTIF_SORTIE families (`ref-list-families.ts`). */
export const SORTIE_FAMILY = {
  VENTE: 'VENTE',
  ABATTOIR: 'ABATTOIR',
  REFORME: 'REFORME',
  AUTRE: 'AUTRE',
} as const;

/**
 * Families whose sortie is itself the removal (no sale nor slaughter order
 * behind it): the flock reconciliation counts these sorties directly.
 */
export const RETRAIT_FAMILIES: readonly string[] = [
  SORTIE_FAMILY.REFORME,
  SORTIE_FAMILY.AUTRE,
];

export type SortiePriceUnit = 'TETE' | 'KG';

/**
 * Animals leaving a POUFA band (CDC « Sorties d'animaux »). The reason is a
 * MOTIF_SORTIE list item and only its family drives the behaviour: VENTE books
 * a `Sale`, ABATTOIR creates a slaughter order, REFORME/AUTRE are removals of
 * their own. A sortie is never counted twice: the reconciliation counts the
 * sale or the slaughter order, and only the removals here.
 */
@Index('IDX_sorties_batch_date', ['batchId', 'sortieDate'])
@Index('UQ_sorties_farm_idempotency', ['farmId', 'idempotencyKey'], {
  unique: true,
  where: '"idempotency_key" IS NOT NULL',
})
@Entity('sorties')
export class Sortie {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ name: 'farm_id', type: 'uuid' })
  @Index()
  farmId: string;

  @ManyToOne('ProductionBatch', { onDelete: 'RESTRICT' })
  @JoinColumn({ name: 'batch_id' })
  batch?: ProductionBatch;

  @Column({ name: 'batch_id', type: 'uuid' })
  batchId: string;

  @Column({ name: 'sortie_date', type: 'date' })
  sortieDate: string;

  /** Heads leaving the band. */
  @Column({ type: 'int' })
  count: number;

  /** Live weight of those heads (kg), when weighed. */
  @Column({ name: 'weight_kg', type: 'float', nullable: true })
  weightKg: number | null;

  /** MOTIF_SORTIE item code. */
  @Column({ name: 'reason_code', type: 'varchar', length: 40 })
  reasonCode: string;

  /** Family of that item (never changes once the item exists). */
  @Column({ name: 'reason_family', type: 'varchar', length: 20 })
  reasonFamily: string;

  @Column({ name: 'recipient_name', type: 'varchar', length: 160, nullable: true })
  recipientName: string | null;

  @Column({ name: 'recipient_phone', type: 'varchar', length: 40, nullable: true })
  recipientPhone: string | null;

  /**
   * Programme operator receiving the animals (cession, traceability lot L7).
   * No foreign key yet: the `Operator` registry lands with L7.
   */
  @Column({ name: 'operator_id', type: 'uuid', nullable: true })
  operatorId: string | null;

  /** Sale price (VENTE), per head or per kg (`priceUnit`). */
  @Column({ name: 'unit_price_fcfa', type: 'int', nullable: true })
  unitPriceFcfa: number | null;

  @Column({ name: 'price_unit', type: 'varchar', length: 10, nullable: true })
  priceUnit: SortiePriceUnit | null;

  /** Sale booked for a VENTE sortie. */
  @Column({ name: 'sale_id', type: 'uuid', nullable: true })
  saleId: string | null;

  /** Slaughter order created for an ABATTOIR sortie. */
  @Column({ name: 'slaughter_order_id', type: 'uuid', nullable: true })
  slaughterOrderId: string | null;

  @Column({ type: 'text', nullable: true })
  notes: string | null;

  /** Offline replay key (`op.id`): a replay returns the existing sortie. */
  @Column({
    name: 'idempotency_key',
    type: 'varchar',
    length: 120,
    nullable: true,
  })
  idempotencyKey: string | null;

  /** Capture time on the phone, corrected for clock skew when needed. */
  @Column({ name: 'captured_at', type: 'timestamptz', nullable: true })
  capturedAt: Date | null;

  @Column({ name: 'clock_corrected', type: 'boolean', default: false })
  clockCorrected: boolean;

  @Column({ name: 'created_by_id', type: 'uuid', nullable: true })
  createdById: string | null;

  @CreateDateColumn({ name: 'created_at', type: 'timestamptz' })
  createdAt: Date;

  @UpdateDateColumn({ name: 'updated_at', type: 'timestamptz' })
  updatedAt: Date;
}
