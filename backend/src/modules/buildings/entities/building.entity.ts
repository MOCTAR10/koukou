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
import { Farm } from '../../farms/entities/farm.entity.js';

@Entity('buildings')
export class Building {
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

  @Column({ name: 'building_area_m2', type: 'float', nullable: true })
  buildingAreaM2: number | null;

  @Column({ name: 'capacity', type: 'int', nullable: true })
  capacity: number | null;

  @Column({ name: 'last_vide_sanitaire_at', type: 'date', nullable: true })
  lastVideSanitaireAt: string | null;

  @Column({ name: 'longitude', type: 'float', nullable: true })
  longitude: number | null;

  @Column({ name: 'latitude', type: 'float', nullable: true })
  latitude: number | null;

  @CreateDateColumn()
  createdAt: Date;

  @UpdateDateColumn()
  updatedAt: Date;
}
