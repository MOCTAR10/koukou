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
import { BatchType } from '../../../common/enums/batch-type.enum.js';
import { Species } from '../../../common/enums/species.enum.js';
import { Farm } from '../../farms/entities/farm.entity.js';

// Names are unique among shared rows and within each farm.
@Index('UQ_breeds_shared_name', ['name'], {
  unique: true,
  where: '"farm_id" IS NULL',
})
@Index('UQ_breeds_farm_name', ['farmId', 'name'], { unique: true })
@Entity('breeds')
export class Breed {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column()
  name: string;

  /**
   * Owning farm of a custom breed; null = shared reference data (seeded).
   * A farm only sees and uses the shared rows plus its own.
   */
  @ManyToOne(() => Farm, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'farm_id' })
  farm: Farm | null;

  @Column({ name: 'farm_id', type: 'uuid', nullable: true })
  farmId: string | null;

  /** Code de référence fournisseur/couvoir (ex : BV-300). */
  @Column({ name: 'ref_code', type: 'varchar', length: 32, nullable: true })
  refCode: string | null;

  @Column({ type: 'enum', enum: BatchType })
  @Index()
  type: BatchType;

  @Column({ type: 'enum', enum: Species, default: Species.POULET })
  species: Species;

  @Column({ name: 'is_custom', default: false })
  isCustom: boolean;

  @Column({ default: true })
  active: boolean;

  @CreateDateColumn()
  createdAt: Date;

  @UpdateDateColumn()
  updatedAt: Date;
}
