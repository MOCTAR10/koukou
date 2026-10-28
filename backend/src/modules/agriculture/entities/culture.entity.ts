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
import { CropCategory } from '../../../common/enums/crop-category.enum.js';
import { Farm } from '../../farms/entities/farm.entity.js';

/** Culture (référentiel global, ex : plantain, manioc, maïs…) regroupée par catégorie. */
@Index('UQ_cultures_shared_name', ['name'], {
  unique: true,
  where: '"farm_id" IS NULL',
})
@Index('UQ_cultures_farm_name', ['farmId', 'name'], { unique: true })
@Entity('cultures')
export class Culture {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column()
  name: string;

  /**
   * Owning farm of a custom culture; null = shared reference data (seeded).
   * A farm only sees and uses the shared rows plus its own.
   */
  @ManyToOne(() => Farm, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'farm_id' })
  farm: Farm | null;

  @Column({ name: 'farm_id', type: 'uuid', nullable: true })
  farmId: string | null;

  @Column({ type: 'enum', enum: CropCategory })
  @Index()
  category: CropCategory;

  /** Durée de cycle (jours) — renseignée pour le conseil (phase 2). */
  @Column({ name: 'default_cycle_days', type: 'int', nullable: true })
  defaultCycleDays: number | null;

  /** Besoin en eau de la culture (L/plant/jour) — conseil phase 2. */
  @Column({ name: 'water_needs_l_plant_day', type: 'float', nullable: true })
  waterNeedsLPlantDay: number | null;

  @Column({ name: 'is_custom', default: false })
  isCustom: boolean;

  @Column({ default: true })
  active: boolean;

  @Column({ type: 'text', nullable: true })
  notes: string | null;

  @CreateDateColumn()
  createdAt: Date;

  @UpdateDateColumn()
  updatedAt: Date;
}