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
import type { Relation } from 'typeorm';
import { RecolteUnit } from '../../../common/enums/recolte-unit.enum.js';
import { Farm } from '../../farms/entities/farm.entity.js';
import { Parcelle } from './parcelle.entity.js';

/** Récolte authentifiée d'une parcelle : seule source du stock vendable au POS Ferme. */
@Entity('recoltes')
export class Recolte {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @ManyToOne(() => Farm, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'farm_id' })
  farm: Relation<Farm>;

  @Column({ name: 'farm_id', type: 'uuid' })
  farmId: string;

  @ManyToOne(() => Parcelle, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'parcelle_id' })
  parcelle: Relation<Parcelle>;

  @Column({ name: 'parcelle_id', type: 'uuid' })
  @Index()
  parcelleId: string;

  /** Date de récolte (jour calendaire). */
  @Column({ type: 'date' })
  harvestDate: string;

  @Column({ type: 'float' })
  quantity: number;

  @Column({ type: 'enum', enum: RecolteUnit })
  unit: RecolteUnit;

  @Column({ type: 'text', nullable: true })
  notes: string | null;

  @CreateDateColumn()
  createdAt: Date;

  @UpdateDateColumn()
  updatedAt: Date;
}