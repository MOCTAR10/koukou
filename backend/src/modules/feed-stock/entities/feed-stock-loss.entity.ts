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
import { FeedLossReason } from '../../../common/enums/feed-loss-reason.enum.js';
import { Farm } from '../../farms/entities/farm.entity.js';
import { FeedUnit } from '../../../common/enums/food-type.enum.js';
import { InputLot } from '../../inputs/entities/input-lot.entity.js';
import { ProductionBatch } from '../../batches/entities/production-batch.entity.js';
import { User } from '../../users/entities/user.entity.js';

@Index('UQ_feed_stock_losses_farm_idem', ['farmId', 'idempotencyKey'], {
  unique: true,
})
@Entity('feed_stock_losses')
export class FeedStockLoss {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  /** Offline replay key: a second declaration with it returns this loss. */
  @Column({ name: 'idempotency_key', type: 'varchar', nullable: true })
  idempotencyKey: string | null;

  @ManyToOne(() => Farm, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'farm_id' })
  farm: Farm;

  @Column({ name: 'farm_id', type: 'uuid' })
  @Index()
  farmId: string;

  @ManyToOne(() => InputLot, { nullable: true, onDelete: 'CASCADE' })
  @JoinColumn({ name: 'input_lot_id' })
  inputLot: InputLot | null;

  @Column({ name: 'input_lot_id', type: 'uuid', nullable: true })
  @Index()
  inputLotId: string | null;

  @ManyToOne(() => ProductionBatch, { nullable: true, onDelete: 'SET NULL' })
  @JoinColumn({ name: 'batch_id' })
  batch: ProductionBatch | null;

  @Column({ name: 'batch_id', type: 'uuid', nullable: true })
  batchId: string | null;

  @Column({ name: 'quantity_kg', type: 'float' })
  quantityKg: number;

  @Column({ type: 'enum', enum: FeedLossReason })
  reason: FeedLossReason;

  @Column({ name: 'occurred_at', type: 'date' })
  occurredAt: string;

  @Column({ type: 'text', nullable: true })
  notes: string | null;

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

export function computeLossKg(
  quantity: number,
  unit: FeedUnit | null | undefined,
  sacKg: number,
): number {
  return (unit ?? FeedUnit.SAC) === FeedUnit.SAC ? quantity * sacKg : quantity;
}
