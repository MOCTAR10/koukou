import {
  Column,
  CreateDateColumn,
  Entity,
  Index,
  JoinColumn,
  ManyToOne,
  PrimaryGeneratedColumn,
  Unique,
  UpdateDateColumn,
} from 'typeorm';
import { FoodType } from '../../../common/enums/food-type.enum.js';
import { FeedEntryType } from '../../../common/enums/feed-entry-type.enum.js';
import { FeedPhase } from '../../../common/enums/feed-phase.enum.js';
import { Farm } from '../../farms/entities/farm.entity.js';

@Entity('feed_products')
@Unique(['farmId', 'name'])
export class FeedProduct {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @ManyToOne(() => Farm, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'farm_id' })
  farm: Farm;

  @Column({ name: 'farm_id', type: 'uuid' })
  @Index()
  farmId: string;

  @Column()
  name: string;

  @Column({ name: 'entry_type', type: 'enum', enum: FeedEntryType, default: FeedEntryType.BAG })
  entryType: FeedEntryType;

  @Column({ name: 'food_type', type: 'enum', enum: FoodType, nullable: true })
  foodType: FoodType | null;

  @Column({ name: 'feed_phase', type: 'enum', enum: FeedPhase, nullable: true })
  feedPhase: FeedPhase | null;

  @Column({ name: 'custom_feed_phase_name', type: 'text', nullable: true })
  customFeedPhaseName: string | null;

  @Column({ name: 'default_sac_kg', type: 'float', nullable: true })
  defaultSacKg: number | null;

  @Column({ name: 'default_bag_size_kg', type: 'float', nullable: true })
  defaultBagSizeKg: number | null;

  @Column({ name: 'default_unit_price_fcfa', type: 'int', nullable: true })
  defaultUnitPriceFcfa: number | null;

  @Column({ name: 'default_cost_per_mt_fcfa', type: 'int', nullable: true })
  defaultCostPerMtFcfa: number | null;

  @Column({ name: 'default_cost_per_bag_fcfa', type: 'int', nullable: true })
  defaultCostPerBagFcfa: number | null;

  @Column({ type: 'text', nullable: true })
  supplier: string | null;

  /** Manufacturer of the product (free text). */
  @Column({ type: 'varchar', length: 120, nullable: true })
  manufacturer: string | null;

  /** Label crude protein, % of the feed. */
  @Column({ name: 'protein_pct', type: 'float', nullable: true })
  proteinPct: number | null;

  /** Label metabolisable energy, kcal per kg. */
  @Column({ name: 'energy_kcal_kg', type: 'float', nullable: true })
  energyKcalKg: number | null;

  /**
   * Authorisation or approval reference of the manufacturer (free text);
   * feed and additives must be authorised (décret n° 0190/PR/MAA, art. 19).
   */
  @Column({ name: 'authorized_ref', type: 'varchar', length: 80, nullable: true })
  authorizedRef: string | null;

  @Column({ default: true })
  active: boolean;

  @CreateDateColumn()
  createdAt: Date;

  @UpdateDateColumn()
  updatedAt: Date;
}
