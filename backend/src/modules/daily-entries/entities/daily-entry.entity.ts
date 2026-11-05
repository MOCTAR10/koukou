import {
  Column,
  CreateDateColumn,
  Entity,
  Index,
  JoinColumn,
  ManyToOne,
  PrimaryGeneratedColumn,
  Unique,
  UpdateDateColumn,
} from 'typeorm';
import { FeedUnit, FoodType } from '../../../common/enums/food-type.enum.js';
import { FeedPhase } from '../../../common/enums/feed-phase.enum.js';
import { ConsumptionSource } from '../../../common/enums/consumption-source.enum.js';
import { ProductionBatch } from '../../batches/entities/production-batch.entity.js';
import { InputLot } from '../../inputs/entities/input-lot.entity.js';
import { User } from '../../users/entities/user.entity.js';

/** Who wrote a daily-entry field last, and when it was captured. */
export interface FieldSyncMeta {
  capturedAt: string;
  updatedAt: string;
  userId: string | null;
  deviceId: string | null;
}

@Entity('daily_entries')
@Unique(['batch', 'entryDate'])
export class DailyEntry {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @ManyToOne(() => ProductionBatch, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'batch_id' })
  batch: ProductionBatch;

  @Column({ name: 'batch_id', type: 'uuid' })
  @Index()
  batchId: string;

  @Column({ name: 'entry_date', type: 'date' })
  @Index()
  entryDate: string;

  @Column({ type: 'int', default: 0 })
  deaths: number;

  @Column({ name: 'feed_quantity', type: 'float', default: 0 })
  feedQuantity: number;

  @Column({ name: 'feed_unit', type: 'enum', enum: FeedUnit, nullable: true })
  feedUnit: FeedUnit | null;

  @Column({ name: 'bag_size_kg', type: 'float', nullable: true })
  bagSizeKg: number | null;

  @Column({ name: 'feed_type', type: 'enum', enum: FoodType, nullable: true })
  feedType: FoodType | null;

  @Column({ name: 'feed_phase', type: 'enum', enum: FeedPhase, nullable: true })
  feedPhase: FeedPhase | null;

  @Column({ name: 'custom_feed_phase_name', type: 'text', nullable: true })
  customFeedPhaseName: string | null;

  @Column({ name: 'input_lot_id', type: 'uuid', nullable: true })
  inputLotId: string | null;

  /**
   * Achat externe : la consommation d'aliment est enregistrée mais ne décrémente
   * PAS le stock suivi (pas d'auto-affectation FEFO, pas d'alerte « rupture »).
   */
  @Column({ name: 'skip_stock_deduction', type: 'boolean', default: false })
  skipStockDeduction: boolean;

  @ManyToOne(() => InputLot, { nullable: true, onDelete: 'SET NULL' })
  @JoinColumn({ name: 'input_lot_id' })
  inputLot: InputLot | null;

  @Column({ name: 'water_l', type: 'float', default: 0 })
  waterL: number;

  @Column({ name: 'avg_weight_kg', type: 'float', nullable: true })
  avgWeightKg: number | null;

  /** Number of birds weighed for `avgWeightKg` (POUFA weighing sample). */
  @Column({ name: 'sample_size', type: 'int', nullable: true })
  sampleSize: number | null;

  /**
   * Catch-up entry (programme farms): recorded after the day following its
   * date, e.g. copied from the paper sheet.
   */
  @Column({ name: 'catch_up', type: 'boolean', default: false })
  catchUp: boolean;

  /** When the last accepted values were captured (phone time, corrected). */
  @Column({ name: 'captured_at', type: 'timestamptz', nullable: true })
  capturedAt: Date | null;

  /**
   * Per-field write metadata for offline conflicts (programme farms):
   * `{ deaths: { capturedAt, updatedAt, userId, deviceId } }`.
   */
  @Column({ name: 'field_sync', type: 'jsonb', nullable: true })
  fieldSync: Record<string, FieldSyncMeta> | null;

  @Column({ name: 'eggs_collected', type: 'int', default: 0 })
  eggsCollected: number;

  @Column({ name: 'eggs_sellable', type: 'int', default: 0 })
  eggsSellable: number;

  @Column({ name: 'eggs_cracked', type: 'int', default: 0 })
  eggsCracked: number;

  @Column({ name: 'eggs_small', type: 'int', default: 0 })
  eggsSmall: number;

  @Column({ name: 'eggs_double_yolk', type: 'int', default: 0 })
  eggsDoubleYolk: number;

  @Column({ name: 'eggs_dirty', type: 'int', default: 0 })
  eggsDirty: number;

  @ManyToOne(() => User, { nullable: true })
  @JoinColumn({ name: 'created_by' })
  createdBy: User | null;

  @Column({ name: 'created_by', type: 'uuid', nullable: true })
  createdById: string | null;

  @Column({
    type: 'enum',
    enum: ConsumptionSource,
    default: ConsumptionSource.MANUELLE,
  })
  source: ConsumptionSource;

  @CreateDateColumn()
  createdAt: Date;

  @UpdateDateColumn()
  updatedAt: Date;
}
