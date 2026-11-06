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
  MarketListingKind,
  MarketListingStatus,
  MarketProduct,
} from '../../../common/enums/market.enum.js';
import { ProductionBatch } from '../../batches/entities/production-batch.entity.js';
import { Farm } from '../../farms/entities/farm.entity.js';

@Index('IDX_market_listings_farm_status', ['farmId', 'status'])
@Index('IDX_market_listings_status_published', ['status', 'publishedAt'])
@Entity('market_listings')
export class MarketListing {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @ManyToOne(() => Farm, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'farm_id' })
  farm: Farm;

  @Column({ name: 'farm_id', type: 'uuid' })
  farmId: string;

  @Column({ type: 'enum', enum: MarketListingKind })
  kind: MarketListingKind;

  @Column({ type: 'enum', enum: MarketProduct })
  product: MarketProduct;

  @ManyToOne(() => ProductionBatch, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'batch_id' })
  batch: ProductionBatch;

  @Column({ name: 'batch_id', type: 'uuid' })
  @Index()
  batchId: string;

  @Column({ type: 'text', nullable: true })
  description: string | null;

  /** Per bird, or per tray for eggs. */
  @Column({ name: 'unit_price_fcfa', type: 'int' })
  unitPriceFcfa: number;

  @Column({ name: 'quantity_published', type: 'int' })
  quantityPublished: number;

  @Column({ name: 'min_order_qty', type: 'int', default: 1 })
  minOrderQty: number;

  /** PRE only: when the birds will be ready. */
  @Column({ name: 'ready_date', type: 'date', nullable: true })
  readyDate: string | null;

  /** PRE only: the date before the farm last moved it, shown to buyers. */
  @Column({ name: 'previous_ready_date', type: 'date', nullable: true })
  previousReadyDate: string | null;

  @Column({ name: 'ready_date_moved_at', type: 'timestamptz', nullable: true })
  readyDateMovedAt: Date | null;

  /** PRE only: share of the order to pay within 24 hours of acceptance. */
  @Column({ name: 'deposit_pct', type: 'int', nullable: true })
  depositPct: number | null;

  @Column({ name: 'pickup_available', default: true })
  pickupAvailable: boolean;

  @Column({ name: 'delivery_available', default: false })
  deliveryAvailable: boolean;

  @Column({ name: 'delivery_fee_fcfa', type: 'int', default: 0 })
  deliveryFeeFcfa: number;

  @Column({
    type: 'enum',
    enum: MarketListingStatus,
    default: MarketListingStatus.DRAFT,
  })
  status: MarketListingStatus;

  @Column({ name: 'published_at', type: 'timestamptz', nullable: true })
  publishedAt: Date | null;

  @Column({ name: 'created_by', type: 'uuid', nullable: true })
  createdById: string | null;

  @CreateDateColumn({ name: 'created_at' })
  createdAt: Date;

  @UpdateDateColumn({ name: 'updated_at' })
  updatedAt: Date;
}
