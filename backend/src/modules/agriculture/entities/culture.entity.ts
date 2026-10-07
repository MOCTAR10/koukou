import {
  Column,
  CreateDateColumn,
  Entity,
  Index,
  PrimaryGeneratedColumn,
  UpdateDateColumn,
} from 'typeorm';
import { CropCategory } from '../../../common/enums/crop-category.enum.js';

/** Culture (référentiel global, ex : plantain, manioc, maïs…) regroupée par catégorie. */
@Entity('cultures')
export class Culture {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ unique: true })
  name: string;

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