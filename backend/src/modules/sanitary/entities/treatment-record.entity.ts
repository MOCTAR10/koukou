import {
  Column,
  CreateDateColumn,
  Entity,
  Index,
  PrimaryGeneratedColumn,
  UpdateDateColumn,
} from 'typeorm';
import { CareType } from '../../../common/enums/care-type.enum.js';

@Index('UQ_treatment_records_farm_idempotency', ['farmId', 'idempotencyKey'], {
  unique: true,
  where: '"idempotency_key" IS NOT NULL',
})
@Entity('treatment_records')
export class TreatmentRecord {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ name: 'farm_id', type: 'uuid' })
  @Index()
  farmId: string;

  @Column({ name: 'batch_id', type: 'uuid' })
  @Index()
  batchId: string;

  @Column({ name: 'care_type', type: 'enum', enum: CareType })
  careType: CareType;

  /** Label of the product (the PRODUIT_TRAITEMENT label when `productCode` is set). */
  @Column({ name: 'product_name' })
  productName: string;

  /**
   * Code of the PRODUIT_TRAITEMENT programme list (CDC n° 23). Null for free
   * text, accepted only while the list has no active item.
   */
  @Column({ name: 'product_code', type: 'varchar', length: 60, nullable: true })
  productCode: string | null;

  @Column({ type: 'varchar', nullable: true })
  dosage: string | null;

  @Column({ type: 'varchar', nullable: true })
  route: string | null;

  @Column({ name: 'administered_at', type: 'timestamptz' })
  administeredAt: Date;

  /** Last day of the treatment (CDC n° 23 « dates de début et fin »); null = one day. */
  @Column({ name: 'end_date', type: 'date', nullable: true })
  endDate: string | null;

  /** Why the birds were treated (CDC n° 23 « motif »). */
  @Column({ type: 'varchar', length: 500, nullable: true })
  reason: string | null;

  /** Birds treated (CDC n° 23 « animaux »). */
  @Column({ name: 'animal_count', type: 'int', nullable: true })
  animalCount: number | null;

  @Column({ name: 'withdrawal_days', type: 'int', default: 0 })
  withdrawalDays: number;

  @Column({ name: 'withdrawal_end_date', type: 'date', nullable: true })
  withdrawalEndDate: string | null;

  @Column({ name: 'performed_by_id', type: 'uuid', nullable: true })
  performedById: string | null;

  @Column({ name: 'medication_lot_id', type: 'uuid', nullable: true })
  medicationLotId: string | null;

  @Column({ type: 'text', nullable: true })
  notes: string | null;

  /** Offline replay key (`op.id`): a replay returns the existing record. */
  @Column({
    name: 'idempotency_key',
    type: 'varchar',
    length: 120,
    nullable: true,
  })
  idempotencyKey: string | null;

  @CreateDateColumn()
  createdAt: Date;

  @UpdateDateColumn()
  updatedAt: Date;
}

/**
 * The withdrawal period runs from the last administration: the treatment's
 * end date when it lasts several days, else the administration day.
 */
export function computeWithdrawalEndDate(
  administeredAt: Date,
  withdrawalDays: number,
  endDate?: string | null,
): string | null {
  if (!withdrawalDays || withdrawalDays <= 0) return null;
  const end = endDate ? new Date(`${endDate}T00:00:00Z`) : new Date(administeredAt);
  end.setUTCDate(end.getUTCDate() + withdrawalDays);
  return end.toISOString().slice(0, 10);
}
