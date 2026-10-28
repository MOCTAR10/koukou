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
import { FoodType, FeedUnit } from '../../../common/enums/food-type.enum.js';
import { FeedEntryType } from '../../../common/enums/feed-entry-type.enum.js';
import { FeedPhase } from '../../../common/enums/feed-phase.enum.js';
import { InputKind } from '../../../common/enums/input-kind.enum.js';
import { Farm } from '../../farms/entities/farm.entity.js';
import { ProductionBatch } from '../../batches/entities/production-batch.entity.js';
import { FeedProduct } from '../../feed-stock/entities/feed-product.entity.js';

@Index('UQ_input_lots_farm_idem', ['farmId', 'idempotencyKey'], {
  unique: true,
})
@Entity('input_lots')
export class InputLot {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  /** Offline replay key: a second create with it returns this lot. */
  @Column({ name: 'idempotency_key', type: 'varchar', nullable: true })
  idempotencyKey: string | null;

  @ManyToOne(() => Farm, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'farm_id' })
  farm: Farm;

  @Column({ name: 'farm_id', type: 'uuid' })
  @Index()
  farmId: string;

  @ManyToOne(() => ProductionBatch, { nullable: true, onDelete: 'SET NULL' })
  @JoinColumn({ name: 'batch_id' })
  batch: ProductionBatch | null;

  @Column({ name: 'batch_id', type: 'uuid', nullable: true })
  batchId: string | null;

  @Column({ type: 'enum', enum: InputKind })
  kind: InputKind;

  @Column({ name: 'food_type', type: 'enum', enum: FoodType, nullable: true })
  foodType: FoodType | null;

  @ManyToOne(() => FeedProduct, { nullable: true, onDelete: 'SET NULL' })
  @JoinColumn({ name: 'product_id' })
  product: FeedProduct | null;

  @Column({ name: 'product_id', type: 'uuid', nullable: true })
  @Index()
  productId: string | null;

  @Column()
  productName: string;

  @Column()
  supplier: string;

  @Column({ name: 'supplier_lot_number' })
  @Index()
  supplierLotNumber: string;

  @Column({ name: 'expiration_date', type: 'date', nullable: true })
  expirationDate: string | null;

  @Column({ name: 'received_date', type: 'date' })
  receivedDate: string;

  @Column({ name: 'unit_price_fcfa', type: 'int', nullable: true })
  unitPriceFcfa: number | null;

  @Column({ type: 'float', default: 0 })
  quantity: number;

  @Column({ type: 'enum', enum: FeedUnit, nullable: true })
  unit: FeedUnit | null;

  @Column({ name: 'entry_type', type: 'enum', enum: FeedEntryType, default: FeedEntryType.BAG })
  entryType: FeedEntryType;

  @Column({ name: 'feed_phase', type: 'enum', enum: FeedPhase, nullable: true })
  feedPhase: FeedPhase | null;

  @Column({ name: 'custom_feed_phase_name', type: 'text', nullable: true })
  customFeedPhaseName: string | null;

  @Column({ name: 'bag_size_kg', type: 'float', nullable: true })
  bagSizeKg: number | null;

  @Column({ name: 'number_of_bags', type: 'int', nullable: true })
  numberOfBags: number | null;

  @Column({ name: 'tonnage_mt', type: 'float', nullable: true })
  tonnageMt: number | null;

  @Column({ name: 'cost_per_mt_fcfa', type: 'int', nullable: true })
  costPerMtFcfa: number | null;

  @Column({ name: 'total_cost_fcfa', type: 'int', nullable: true })
  totalCostFcfa: number | null;

  @Column({ name: 'dose_quantity', type: 'float', nullable: true })
  doseQuantity: number | null;

  @Column({ name: 'dose_unit', type: 'text', nullable: true })
  doseUnit: string | null;

  @Column({ name: 'additive_name', type: 'text', nullable: true })
  additiveName: string | null;

  @CreateDateColumn()
  createdAt: Date;

  @UpdateDateColumn()
  updatedAt: Date;
}
