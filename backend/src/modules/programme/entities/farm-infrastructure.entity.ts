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
import type { Farm } from '../../farms/entities/farm.entity.js';

/** Infrastructure of a programme farm, from the INFRASTRUCTURE list (DGE). */
@Index('UQ_farm_infrastructures_farm_item', ['farmId', 'refItemCode'], {
  unique: true,
})
@Entity('farm_infrastructures')
export class FarmInfrastructure {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @ManyToOne('Farm', { onDelete: 'RESTRICT' })
  @JoinColumn({ name: 'farm_id' })
  farm?: Farm;

  @Column({ name: 'farm_id', type: 'uuid' })
  farmId: string;

  /** Code of an INFRASTRUCTURE list item. */
  @Column({ name: 'ref_item_code', type: 'varchar', length: 40 })
  refItemCode: string;

  @Column({ type: 'int' })
  count: number;

  @Column({ name: 'surface_m2', type: 'float', nullable: true })
  surfaceM2: number | null;

  @CreateDateColumn({ name: 'created_at', type: 'timestamptz' })
  createdAt: Date;

  @UpdateDateColumn({ name: 'updated_at', type: 'timestamptz' })
  updatedAt: Date;
}
