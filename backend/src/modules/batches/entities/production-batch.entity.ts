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
  BatchStatus,
  BatchType,
} from '../../../common/enums/batch-type.enum.js';
import { Species } from '../../../common/enums/species.enum.js';
import { Breed } from '../../breeds/entities/breed.entity.js';
import { Farm } from '../../farms/entities/farm.entity.js';

@Entity('production_batches')
export class ProductionBatch {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @ManyToOne(() => Farm, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'farm_id' })
  farm: Farm;

  @Column({ name: 'farm_id', type: 'uuid' })
  @Index()
  farmId: string;

  @Column({ name: 'building_id', type: 'uuid', nullable: true })
  @Index()
  buildingId: string | null;

  @ManyToOne(() => Breed, { eager: true, nullable: true })
  @JoinColumn({ name: 'breed_id' })
  breed: Breed | null;

  @Column({ name: 'breed_id', type: 'uuid', nullable: true })
  breedId: string | null;

  @Column({ name: 'batch_name', type: 'varchar', nullable: true })
  batchName: string | null;

  @Column({ name: 'integration_date', type: 'date' })
  integrationDate: string;

  @Column({ name: 'quantity_at_start', type: 'int' })
  quantityAtStart: number;

  @Column({ name: 'quantity_alive', type: 'int' })
  quantityAlive: number;

  @Column({ name: 'chick_unit_price_fcfa', type: 'int', nullable: true })
  chickUnitPriceFcfa: number | null;

  @Column({ type: 'enum', enum: BatchType, default: BatchType.CHAIR })
  @Index()
  type: BatchType;

  @Column({
    type: 'enum',
    enum: Species,
    default: Species.POULET,
  })
  species: Species;

  /** Espèce libre (espèce = AUTRE) — ex : "Canard", "Faisan" */
  @Column({ name: 'custom_species', type: 'varchar', nullable: true })
  customSpecies: string | null;

  /** Souche / race libre (espèce = AUTRE) — ex : "Coureur indien" */
  @Column({ name: 'custom_breed', type: 'varchar', nullable: true })
  customBreed: string | null;

  @Column({ type: 'enum', enum: BatchStatus, default: BatchStatus.ACTIF })
  status: BatchStatus;

  /**
   * When the lot was closed. The vide sanitaire is measured from it, so it
   * must not move with later edits (updatedAt does).
   */
  @Column({ name: 'closed_at', type: 'timestamptz', nullable: true })
  closedAt: Date | null;

  @Column({ name: 'building_area_m2', type: 'float', nullable: true })
  buildingAreaM2: number | null;

  @Column({ name: 'feed_unit_sac_kg', type: 'float', nullable: true })
  feedUnitSacKg: number | null;

  @Column({ name: 'last_computed_fcr', type: 'float', default: 0 })
  lastComputedFcr: number;

  @Column({ name: 'couvoir_supplier', type: 'varchar', nullable: true })
  couvoirSupplier: string | null;

  @Column({ name: 'chick_lot_number', type: 'varchar', nullable: true })
  chickLotNumber: string | null;

  @Column({ name: 'hatch_date', type: 'date', nullable: true })
  hatchDate: string | null;

  @Column({ name: 'sale_readiness_checked', default: false })
  saleReadinessChecked: boolean;

  @Column({ name: 'ready_for_sale_at', type: 'date', nullable: true })
  readyForSaleAt: string | null;

  @CreateDateColumn()
  createdAt: Date;

  @UpdateDateColumn()
  updatedAt: Date;
}
