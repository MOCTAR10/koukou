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
import { OrderCanal } from '../../../common/enums/order-canal.enum.js';
import { OrderStatus } from '../../../common/enums/order-status.enum.js';
import { AlertLevel } from '../../../common/enums/alert-level.enum.js';
import {
  SaleItemProductType,
  SaleItemUnit,
} from '../../../common/enums/sale-item-type.enum.js';
import { ReadyReason } from '../../batches/models/batch-metrics.model.js';
import { ProductionBatch } from '../../batches/entities/production-batch.entity.js';
import { Farm } from '../../farms/entities/farm.entity.js';
import { PointOfSale } from '../../points-of-sale/entities/point-of-sale.entity.js';
import { Sale } from '../../finance/entities/sale.entity.js';
import { Customer } from '../../finance/entities/customer.entity.js';

/** Instantané des articles figé au moment du bon de commande. */
export interface OrderItemSnapshot {
  saleItemId: string;
  productType: SaleItemProductType;
  label: string;
  quantity: number;
  unit: SaleItemUnit;
  pieceCount: number | null;
  unitPriceFcfa: number;
  amountFcfa: number;
  batchId: string | null;
  inputLotId: string | null;
}

/** Alerte sanitaire active figée au bon de commande (DELAI_ATTENTE / PROPHYLAXIE / MALADIE). */
export interface OrderPassportAlert {
  kind: string;
  level: AlertLevel;
  message: string;
}

/** Délai de carence (retrait) encore en cours à la date du bon de commande. */
export interface OrderPassportWithdrawal {
  careTypeLabel: string;
  productName: string;
  administeredAt: string;
  withdrawalEndDate: string;
}

export interface OrderPassportVaccination {
  name: string;
  date: string | null;
}

/** Événement sanitaire notable (maladie) figé au bon de commande. */
export interface OrderPassportEvent {
  title: string;
  occurredAt: string;
  severity: string;
}

/**
 * « Passeport » de traçabilité du lot, figé au moment du bon de commande :
 * identité du lot, zootechnie, auto-signal (conseil non bloquant), vaccins,
 * délais de carence et alerts sanitaires. Transparence totale envers le
 * client : il voit exactement ce qu'il achète.
 */
export interface OrderPassportSnapshot {
  batchId: string;
  batchLabel: string;
  speciesLabel: string;
  breedName: string | null;
  batchTypeLabel: string;
  integrationDate: string;
  ageDays: number;
  liveCount: number;
  statusLabel: string;
  readiness: {
    readyForSale: boolean;
    readyReason: ReadyReason;
    label: string;
    note: string;
  };
  metrics: { label: string; value: string }[];
  vaccinations: {
    completed: number;
    planned: number;
    last: OrderPassportVaccination | null;
  };
  withdrawals: OrderPassportWithdrawal[];
  sanitary: {
    level: AlertLevel;
    conformity: 'CONFORME' | 'PRECONFORMITE' | 'EN_ATTENTE';
    conformityNote: string;
    alerts: OrderPassportAlert[];
    events: OrderPassportEvent[];
    vetVisited: boolean;
  };
  generatedAt: string;
}

@Index('UQ_orders_farm_idem', ['farmId', 'idempotencyKey'], {
  unique: true,
})
@Entity('orders')
export class Order {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @ManyToOne(() => Farm, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'farm_id' })
  farm: Farm;

  @Column({ name: 'farm_id', type: 'uuid' })
  @Index()
  farmId: string;

  @Column({ name: 'reference_number', unique: true })
  @Index()
  referenceNumber: string;

  @Column({ type: 'enum', enum: OrderCanal })
  canal: OrderCanal;

  @ManyToOne(() => Sale, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'sale_id' })
  sale: Sale;

  @Column({ name: 'sale_id', type: 'uuid' })
  @Index()
  saleId: string;

  @Column({ name: 'idempotency_key', type: 'varchar', nullable: true })
  idempotencyKey: string | null;

  @Column({ type: 'enum', enum: OrderStatus, default: OrderStatus.PENDING })
  status: OrderStatus;

  @ManyToOne(() => Customer, { nullable: true, onDelete: 'SET NULL' })
  @JoinColumn({ name: 'customer_id' })
  customer: Customer | null;

  @Column({ name: 'customer_id', type: 'uuid', nullable: true })
  @Index()
  customerId: string | null;

  @Column({ name: 'expected_date', type: 'date', nullable: true })
  expectedDate: string | null;

  @Column({ type: 'varchar', nullable: true })
  address: string | null;

  /** Province de livraison au Gabon (filtre du géocodage OSM côté mobile). */
  @Column({ name: 'delivery_province', type: 'varchar', nullable: true })
  deliveryProvince: string | null;

  /** Coordonnées GPS de livraison (issue du géocodage OpenStreetMap). */
  @Column({ type: 'double precision', nullable: true })
  latitude: number | null;

  @Column({ type: 'double precision', nullable: true })
  longitude: number | null;

  /** Lot de production concerné (réservation des précommandes de volaille). */
  @ManyToOne(() => ProductionBatch, { nullable: true, onDelete: 'SET NULL' })
  @JoinColumn({ name: 'batch_id' })
  batch: ProductionBatch | null;

  @Column({ name: 'batch_id', type: 'uuid', nullable: true })
  @Index()
  batchId: string | null;

  /** Point de livraison/réception : la ferme (null) ou un point de vente. */
  @ManyToOne(() => PointOfSale, { nullable: true, onDelete: 'SET NULL' })
  @JoinColumn({ name: 'point_of_sale_id' })
  pointOfSale: PointOfSale | null;

  @Column({ name: 'point_of_sale_id', type: 'uuid', nullable: true })
  @Index()
  pointOfSaleId: string | null;

  @Column({ name: 'total_amount_fcfa', type: 'int' })
  totalAmountFcfa: number;

  /** Total des acomptes encaissés (mouvement caisse à l'encaissement). */
  @Column({ name: 'deposit_fcfa', type: 'int', default: 0 })
  depositFcfa: number;

  @Column({ type: 'jsonb' })
  items: OrderItemSnapshot[];

  /** Passeport de traçabilité du lot, figé au moment du bon de commande (null pour les commandes sans volaille). */
  @Column({ type: 'jsonb', nullable: true })
  passport: OrderPassportSnapshot | null;

  @Column({ name: 'livred_at', type: 'timestamptz', nullable: true })
  livredAt: Date | null;

  @Column({ name: 'cancelled_at', type: 'timestamptz', nullable: true })
  cancelledAt: Date | null;

  @Column({ name: 'cancelled_reason', type: 'text', nullable: true })
  cancelledReason: string | null;

  @Column({ name: 'created_by', type: 'uuid', nullable: true })
  createdById: string | null;

  @CreateDateColumn({ name: 'created_at' })
  createdAt: Date;

  @UpdateDateColumn({ name: 'updated_at' })
  updatedAt: Date;
}

/** Article libre tel qu'accepté à la création (avant figement du snapshot). */
export interface OrderItemInput {
  productType: SaleItemProductType;
  label?: string;
  quantity: number;
  unit?: SaleItemUnit;
  pieceCount?: number;
  unitPriceFcfa: number;
  batchId?: string;
  inputLotId?: string;
}
