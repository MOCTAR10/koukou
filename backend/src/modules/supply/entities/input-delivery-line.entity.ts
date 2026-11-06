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
import { FeedPhase } from '../../../common/enums/feed-phase.enum.js';
import type { InputLot } from '../../inputs/entities/input-lot.entity.js';
import type { InputDelivery } from './input-delivery.entity.js';

/**
 * One input of a delivery. The intrant is an INTRANT list item (its family —
 * POUSSIN, ALIMENT, VACCIN, MEDICAMENT, AUTRE — drives the lot created), the
 * unit a UNITE item; both are stored by code (codes never change). Values are
 * per shipped unit, before subsidy; the confirmation stores what the farm
 * pays (`farmerCostFcfa`, booked as the lot's expense) apart from the
 * subsidy (`subsidyFcfa`, never a farm charge).
 */
@Index('IDX_input_delivery_lines_delivery', ['deliveryId', 'position'])
@Entity('input_delivery_lines')
export class InputDeliveryLine {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @ManyToOne('InputDelivery', (d: InputDelivery) => d.lines, {
    onDelete: 'RESTRICT',
  })
  @JoinColumn({ name: 'delivery_id' })
  delivery?: InputDelivery;

  @Column({ name: 'delivery_id', type: 'uuid' })
  deliveryId: string;

  /** Order of the line in the delivery (1, 2, …). */
  @Column({ type: 'int' })
  position: number;

  /** INTRANT list item code. */
  @Column({ name: 'intrant_code', type: 'varchar', length: 40 })
  intrantCode: string;

  /** Family of that item (never changes once the item exists). */
  @Column({ name: 'intrant_family', type: 'varchar', length: 20 })
  intrantFamily: string;

  /** UNITE list item code of `quantity`. */
  @Column({ name: 'unit_code', type: 'varchar', length: 40 })
  unitCode: string;

  /** Quantity shipped, in `unitCode`. */
  @Column({ type: 'float' })
  quantity: number;

  /** Feed phase of an ALIMENT line (FEFO stock is kept by phase). */
  @Column({ name: 'feed_phase', type: 'enum', enum: FeedPhase, nullable: true })
  feedPhase: FeedPhase | null;

  /** Bag size (kg) when the unit is a bag without a fixed weight. */
  @Column({ name: 'bag_size_kg', type: 'float', nullable: true })
  bagSizeKg: number | null;

  @Column({ type: 'boolean', default: false })
  subsidized: boolean;

  /** Subsidy share in percent, (0, 100], subsidized lines only. */
  @Column({ name: 'subsidy_rate', type: 'float', nullable: true })
  subsidyRate: number | null;

  /** Value of one shipped unit before subsidy (FCFA), when known. */
  @Column({ name: 'unit_value_fcfa', type: 'int', nullable: true })
  unitValueFcfa: number | null;

  /** Supplier batch number (HACCP); the delivery code when absent. */
  @Column({
    name: 'supplier_lot_number',
    type: 'varchar',
    length: 120,
    nullable: true,
  })
  supplierLotNumber: string | null;

  @Column({ name: 'expiration_date', type: 'date', nullable: true })
  expirationDate: string | null;

  /** Quantity really received (confirmation), in `unitCode`. */
  @Column({ name: 'received_quantity', type: 'float', nullable: true })
  receivedQuantity: number | null;

  /** Why received ≠ shipped (mandatory then). */
  @Column({ name: 'discrepancy_reason', type: 'text', nullable: true })
  discrepancyReason: string | null;

  /** What the farm pays for the received quantity (after subsidy). */
  @Column({ name: 'farmer_cost_fcfa', type: 'int', nullable: true })
  farmerCostFcfa: number | null;

  /** Subsidy on the received quantity, kept apart from the farm's charges. */
  @Column({ name: 'subsidy_fcfa', type: 'int', nullable: true })
  subsidyFcfa: number | null;

  /** Farm input lot created at confirmation (none for a zero reception). */
  @ManyToOne('InputLot', { onDelete: 'RESTRICT', nullable: true })
  @JoinColumn({ name: 'input_lot_id' })
  inputLot?: InputLot | null;

  @Column({ name: 'input_lot_id', type: 'uuid', nullable: true })
  @Index()
  inputLotId: string | null;

  @CreateDateColumn({ name: 'created_at', type: 'timestamptz' })
  createdAt: Date;

  @UpdateDateColumn({ name: 'updated_at', type: 'timestamptz' })
  updatedAt: Date;
}
