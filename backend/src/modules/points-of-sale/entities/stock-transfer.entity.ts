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
import { StockTransferProductType } from '../../../common/enums/stock-transfer-product-type.enum.js';
import { StockTransferStatus } from '../../../common/enums/stock-transfer-status.enum.js';
import { ProductionBatch } from '../../batches/entities/production-batch.entity.js';
import { Farm } from '../../farms/entities/farm.entity.js';
import { InputLot } from '../../inputs/entities/input-lot.entity.js';
import { SlaughterOrder } from '../../slaughter/entities/slaughter-order.entity.js';
import { User } from '../../users/entities/user.entity.js';
import { PointOfSale } from './point-of-sale.entity.js';

@Entity('stock_transfers')
export class StockTransfer {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @ManyToOne(() => Farm, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'farm_id' })
  farm: Farm;

  @Column({ name: 'farm_id', type: 'uuid' })
  @Index()
  farmId: string;

  /** Type de produit déplacé (abattu, œufs, provende). */
  @Column({ type: 'enum', enum: StockTransferProductType })
  productType: StockTransferProductType;

  /** Point de vente d'origine : la ferme (point FERME), d'où part le stock. */
  @ManyToOne(() => PointOfSale, { onDelete: 'RESTRICT', eager: true })
  @JoinColumn({ name: 'source_pos_id' })
  sourcePos: PointOfSale;

  @Column({ name: 'source_pos_id', type: 'uuid' })
  @Index()
  sourcePosId: string;

  /** Boutique destination (elle reçoit la réserve vendable). */
  @ManyToOne(() => PointOfSale, { onDelete: 'RESTRICT', eager: true })
  @JoinColumn({ name: 'point_of_sale_id' })
  pointOfSale: PointOfSale;

  @Column({ name: 'point_of_sale_id', type: 'uuid' })
  @Index()
  pointOfSaleId: string;

  /** Ordre d'abattage source (ABATTU) : pool de carcasses de la ferme. */
  @ManyToOne(() => SlaughterOrder, { onDelete: 'RESTRICT', eager: true })
  @JoinColumn({ name: 'slaughter_order_id' })
  slaughterOrder: SlaughterOrder | null;

  @Column({ name: 'slaughter_order_id', type: 'uuid', nullable: true })
  @Index()
  slaughterOrderId: string | null;

  /** Lot de production d'origine (ABATTU / OEUFS). */
  @ManyToOne(() => ProductionBatch, { onDelete: 'RESTRICT', eager: true })
  @JoinColumn({ name: 'batch_id' })
  batch: ProductionBatch | null;

  @Column({ name: 'batch_id', type: 'uuid', nullable: true })
  @Index()
  batchId: string | null;

  /** Lot d'intrant alimentaire d'origine (PROVENDE). */
  @ManyToOne(() => InputLot, { onDelete: 'RESTRICT', eager: true })
  @JoinColumn({ name: 'input_lot_id' })
  inputLot: InputLot | null;

  @Column({ name: 'input_lot_id', type: 'uuid', nullable: true })
  @Index()
  inputLotId: string | null;

  /** Unité de la quantité (PIECE, ALVEOLES, SAC, KG). */
  @Column({ type: 'varchar', nullable: true })
  unit: string | null;

  /** Quantité déplacée de la ferme vers la boutique (≥ 1). */
  @Column({ type: 'int' })
  quantity: number;

  /** Quantité déjà vendue depuis ce transfert (0 ≤ quantitySold ≤ quantity). */
  @Column({ name: 'quantity_sold', type: 'int', default: 0 })
  quantitySold: number;

  @Column({
    type: 'enum',
    enum: StockTransferStatus,
    default: StockTransferStatus.TRANSFERRED,
  })
  status: StockTransferStatus;

  @Column({ name: 'cancelled_at', type: 'timestamptz', nullable: true })
  cancelledAt: Date | null;

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