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
  MarketFulfilment,
  MarketOrderState,
} from '../../../common/enums/market.enum.js';
import { Farm } from '../../farms/entities/farm.entity.js';
import { Order } from '../../orders/entities/order.entity.js';
import { User } from '../../users/entities/user.entity.js';
import { MarketListing } from './market-listing.entity.js';

/** A buyer's request. It reserves nothing until the farm accepts it. */
@Index('UQ_market_orders_buyer_idem', ['buyerUserId', 'idempotencyKey'], {
  unique: true,
})
@Index('IDX_market_orders_farm_state', ['farmId', 'state'])
@Index('IDX_market_orders_buyer_state', ['buyerUserId', 'state'])
@Entity('market_orders')
export class MarketOrder {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @ManyToOne(() => MarketListing, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'listing_id' })
  listing: MarketListing;

  @Column({ name: 'listing_id', type: 'uuid' })
  @Index()
  listingId: string;

  @ManyToOne(() => Farm, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'farm_id' })
  farm: Farm;

  @Column({ name: 'farm_id', type: 'uuid' })
  farmId: string;

  @ManyToOne(() => User, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'buyer_user_id' })
  buyer: User;

  @Column({ name: 'buyer_user_id', type: 'uuid' })
  buyerUserId: string;

  @Column({ type: 'int' })
  quantity: number;

  /** Snapshot: what the buyer agreed to, whatever the listing says later. */
  @Column({ name: 'unit_price_fcfa', type: 'int' })
  unitPriceFcfa: number;

  @Column({ name: 'delivery_fee_fcfa', type: 'int', default: 0 })
  deliveryFeeFcfa: number;

  /** 0 when the listing asks for no deposit. */
  @Column({ name: 'deposit_required_fcfa', type: 'int', default: 0 })
  depositRequiredFcfa: number;

  @Column({ type: 'enum', enum: MarketFulfilment })
  fulfilment: MarketFulfilment;

  @Column({ type: 'varchar', nullable: true })
  address: string | null;

  /** Reachable number for this order, separate from the account's phone. */
  @Column({ name: 'contact_phone', type: 'varchar' })
  contactPhone: string;

  @Column({ type: 'text', nullable: true })
  note: string | null;

  /** NOW listings only: when the buyer would like it. */
  @Column({ name: 'desired_date', type: 'date', nullable: true })
  desiredDate: string | null;

  @Column({ type: 'enum', enum: MarketOrderState, default: MarketOrderState.REQUESTED })
  state: MarketOrderState;

  @Column({ name: 'request_expires_at', type: 'timestamptz' })
  requestExpiresAt: Date;

  /** When the request stopped being open: rejected, withdrawn or expired. */
  @Column({ name: 'closed_at', type: 'timestamptz', nullable: true })
  closedAt: Date | null;

  /** The farm's words to the buyer. */
  @Column({ name: 'reject_reason', type: 'text', nullable: true })
  rejectReason: string | null;

  @ManyToOne(() => Order, { nullable: true, onDelete: 'SET NULL' })
  @JoinColumn({ name: 'order_id' })
  order: Order | null;

  @Column({ name: 'order_id', type: 'uuid', nullable: true })
  orderId: string | null;

  @Column({ name: 'accepted_at', type: 'timestamptz', nullable: true })
  acceptedAt: Date | null;

  @Column({ name: 'deposit_due_at', type: 'timestamptz', nullable: true })
  depositDueAt: Date | null;

  /** The farm's single extension of the deadline. */
  @Column({ name: 'deposit_extended_at', type: 'timestamptz', nullable: true })
  depositExtendedAt: Date | null;

  /** Set when the sweep cancelled the order for an unpaid deposit. */
  @Column({ name: 'deposit_expired_at', type: 'timestamptz', nullable: true })
  depositExpiredAt: Date | null;

  @Column({ name: 'idempotency_key', type: 'varchar', nullable: true })
  idempotencyKey: string | null;

  @CreateDateColumn({ name: 'created_at' })
  createdAt: Date;

  @UpdateDateColumn({ name: 'updated_at' })
  updatedAt: Date;
}
