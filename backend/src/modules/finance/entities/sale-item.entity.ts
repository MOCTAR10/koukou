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
  SaleItemProductType,
  SaleItemUnit,
} from '../../../common/enums/sale-item-type.enum.js';
import { Sale } from './sale.entity.js';
import { ProductionBatch } from '../../batches/entities/production-batch.entity.js';
import { SlaughterOrder } from '../../slaughter/entities/slaughter-order.entity.js';
import { InputLot } from '../../inputs/entities/input-lot.entity.js';

@Entity('sale_items')
export class SaleItem {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @ManyToOne(() => Sale, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'sale_id' })
  sale: Sale;

  @Column({ name: 'sale_id', type: 'uuid' })
  @Index()
  saleId: string;

  @Column({
    name: 'product_type',
    type: 'enum',
    enum: SaleItemProductType,
  })
  productType: SaleItemProductType;

  @Column({ name: 'label', type: 'varchar', nullable: true })
  label: string | null;

  @Column({ type: 'float' })
  quantity: number;

  @Column({ type: 'enum', enum: SaleItemUnit, default: SaleItemUnit.UNITE })
  unit: SaleItemUnit;

  @Column({ name: 'piece_count', type: 'int', nullable: true })
  pieceCount: number | null;

  @Column({ name: 'unit_price_fcfa', type: 'int' })
  unitPriceFcfa: number;

  @Column({ name: 'amount_fcfa', type: 'int' })
  amountFcfa: number;

  @ManyToOne(() => ProductionBatch, { nullable: true, onDelete: 'SET NULL' })
  @JoinColumn({ name: 'batch_id' })
  batch: ProductionBatch | null;

  @Column({ name: 'batch_id', type: 'uuid', nullable: true })
  @Index()
  batchId: string | null;

  @ManyToOne(() => InputLot, { nullable: true, onDelete: 'SET NULL' })
  @JoinColumn({ name: 'input_lot_id' })
  inputLot: InputLot | null;

  @Column({ name: 'input_lot_id', type: 'uuid', nullable: true })
  inputLotId: string | null;

  /** Ordre d'abattage source pour une vente ABATTU gérée par pool de carcasses. */
  @ManyToOne(() => SlaughterOrder, { nullable: true, onDelete: 'SET NULL' })
  @JoinColumn({ name: 'source_slaughter_order_id' })
  sourceSlaughterOrder: SlaughterOrder | null;

  @Column({ name: 'source_slaughter_order_id', type: 'uuid', nullable: true })
  @Index()
  sourceSlaughterOrderId: string | null;

  /** Transfert de stock ferme → boutique (vente puisant dans une réserve PDV). */
  @Column({ name: 'stock_transfer_id', type: 'uuid', nullable: true })
  @Index()
  stockTransferId: string | null;

  @CreateDateColumn({ name: 'created_at' })
  createdAt: Date;

  @UpdateDateColumn({ name: 'updated_at' })
  updatedAt: Date;
}
