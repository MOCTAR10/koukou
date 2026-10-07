import {
  Column,
  CreateDateColumn,
  Entity,
  Index,
  JoinColumn,
  ManyToOne,
  OneToMany,
  PrimaryGeneratedColumn,
  UpdateDateColumn,
} from 'typeorm';
import { SaleStatus } from '../../../common/enums/sale-status.enum.js';
import { Farm } from '../../farms/entities/farm.entity.js';
import { PointOfSale } from '../../points-of-sale/entities/point-of-sale.entity.js';
import { ProductionBatch } from '../../batches/entities/production-batch.entity.js';
import { Customer } from './customer.entity.js';
import { Promotion } from './promotion.entity.js';
import { SaleItem } from './sale-item.entity.js';
import { Payment } from './payment.entity.js';

@Index('UQ_sales_farm_idempotency', ['farmId', 'idempotencyKey'], {
  unique: true,
})
@Entity('sales')
export class Sale {
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

  @Column({ name: 'idempotency_key', type: 'varchar', nullable: true })
  idempotencyKey: string | null;

  @Column({ name: 'sale_date', type: 'date' })
  saleDate: string;

  @Column({ name: 'total_amount_fcfa', type: 'int' })
  totalAmountFcfa: number;

  @Column({ name: 'discount_amount_fcfa', type: 'int', default: 0 })
  discountAmountFcfa: number;

  @ManyToOne(() => Promotion, { nullable: true, onDelete: 'SET NULL' })
  @JoinColumn({ name: 'promotion_id' })
  promotion: Promotion | null;

  @Column({ name: 'promotion_id', type: 'uuid', nullable: true })
  @Index()
  promotionId: string | null;

  @Column({ type: 'enum', enum: SaleStatus, default: SaleStatus.SETTLED })
  status: SaleStatus;

  @ManyToOne(() => Customer, { nullable: true, onDelete: 'SET NULL' })
  @JoinColumn({ name: 'customer_id' })
  customer: Customer | null;

  @Column({ name: 'customer_id', type: 'uuid', nullable: true })
  @Index()
  customerId: string | null;

  @ManyToOne(() => ProductionBatch, { nullable: true, onDelete: 'SET NULL' })
  @JoinColumn({ name: 'batch_id' })
  batch: ProductionBatch | null;

  @Column({ name: 'batch_id', type: 'uuid', nullable: true })
  @Index()
  batchId: string | null;

  @ManyToOne(() => PointOfSale, { nullable: true, onDelete: 'SET NULL' })
  @JoinColumn({ name: 'point_of_sale_id' })
  pointOfSale: PointOfSale | null;

  @Column({ name: 'point_of_sale_id', type: 'uuid', nullable: true })
  @Index()
  pointOfSaleId: string | null;

  @Column({ name: 'cancelled_at', type: 'timestamptz', nullable: true })
  cancelledAt: Date | null;

  @Column({ name: 'cancelled_reason', type: 'text', nullable: true })
  cancelledReason: string | null;

  @Column({ name: 'created_by', type: 'uuid', nullable: true })
  createdById: string | null;

  @OneToMany(() => SaleItem, (item) => item.sale)
  items: SaleItem[];

  @OneToMany(() => Payment, (payment) => payment.sale)
  payments: Payment[];

  @CreateDateColumn({ name: 'created_at' })
  createdAt: Date;

  @UpdateDateColumn({ name: 'updated_at' })
  updatedAt: Date;
}
