import {
  Column,
  CreateDateColumn,
  Entity,
  Index,
  PrimaryGeneratedColumn,
  UpdateDateColumn,
} from 'typeorm';
import { CareType } from '../../../common/enums/care-type.enum.js';
import { ProphylaxisStatus } from '../../../common/enums/prophylaxis-status.enum.js';
import { ScheduleSource } from '../../../common/enums/schedule-source.enum.js';

@Index('UQ_prophylaxis_events_farm_idempotency', ['farmId', 'idempotencyKey'], {
  unique: true,
  where: '"idempotency_key" IS NOT NULL',
})
@Entity('prophylaxis_events')
export class ProphylaxisEvent {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ name: 'farm_id', type: 'uuid' })
  @Index()
  farmId: string;

  @Column({ name: 'batch_id', type: 'uuid' })
  @Index()
  batchId: string;

  @Column({ name: 'building_id', type: 'uuid', nullable: true })
  buildingId: string | null;

  @Column({ name: 'protocol_step_id', type: 'uuid', nullable: true })
  protocolStepId: string | null;

  @Column({
    name: 'care_type',
    type: 'enum',
    enum: CareType,
  })
  careType: CareType;

  @Column({
    type: 'enum',
    enum: ScheduleSource,
    default: ScheduleSource.MANUEL,
  })
  source: ScheduleSource;

  @Column({ type: 'text', nullable: true })
  notes: string | null;

  @Column()
  name: string;

  @Column({ type: 'varchar', nullable: true })
  dosage: string | null;

  @Column({ type: 'varchar', nullable: true })
  route: string | null;

  @Column({ name: 'withdrawal_days', type: 'int', default: 0 })
  withdrawalDays: number;

  @Column({ name: 'scheduled_date', type: 'date' })
  scheduledDate: string;

  @Column({
    type: 'enum',
    enum: ProphylaxisStatus,
    default: ProphylaxisStatus.PLANIFIE,
  })
  status: ProphylaxisStatus;

  @Column({ name: 'completed_at', type: 'timestamptz', nullable: true })
  completedAt: Date | null;

  @Column({ name: 'performed_by_id', type: 'uuid', nullable: true })
  performedById: string | null;

  @Column({ name: 'performed_notes', type: 'text', nullable: true })
  performedNotes: string | null;

  @Column({ name: 'medication_lot_id', type: 'uuid', nullable: true })
  medicationLotId: string | null;

  /** Birds vaccinated or treated, given at completion (CDC n° 22 « nombre d'animaux »). */
  @Column({ name: 'animal_count', type: 'int', nullable: true })
  animalCount: number | null;

  /**
   * Key of the completion sent from the offline queue (`op.id`): replaying the
   * same completion returns the care instead of « déjà réalisé ».
   */
  @Column({
    name: 'idempotency_key',
    type: 'varchar',
    length: 120,
    nullable: true,
  })
  idempotencyKey: string | null;

  @Column({ name: 'cancelled_reason', type: 'varchar', nullable: true })
  cancelledReason: string | null;

  /** Sortie de stock volontaire d'un médicament (choix « Sortir du stock »). */
  @Column({ name: 'decrement_stock', type: 'boolean', default: false })
  decrementStock: boolean;

  /** Quantité sortie du stock (dose) lors de la planification. */
  @Column({ name: 'medication_qty', type: 'float', nullable: true })
  medicationQty: number | null;

  @Column({ name: 'medication_unit', type: 'varchar', nullable: true })
  medicationUnit: string | null;

  /**
   * Horodatage de la déduction effective : seul le soin « porteur » de la
   * sortie de stock (premier du groupe) rétablit le stock s'il est annulé.
   */
  @Column({ name: 'stock_consumed_at', type: 'timestamptz', nullable: true })
  stockConsumedAt: Date | null;

  @CreateDateColumn()
  createdAt: Date;

  @UpdateDateColumn()
  updatedAt: Date;
}
