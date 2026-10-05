import {
  Column,
  CreateDateColumn,
  Entity,
  Index,
  JoinColumn,
  ManyToOne,
  PrimaryGeneratedColumn,
} from 'typeorm';
import { Farm } from '../../farms/entities/farm.entity.js';

export enum ExerciceStatus {
  OPEN = 'OPEN',
  CLOSED = 'CLOSED',
}

/** Période comptable clôturable (par défaut : année civile). */
@Entity('accounting_exercices')
export class Exercice {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @ManyToOne(() => Farm, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'farm_id' })
  farm: Farm;

  @Column({ name: 'farm_id', type: 'uuid' })
  @Index()
  farmId: string;

  @Column({ type: 'varchar', length: 120 })
  label: string;

  @Column({ name: 'start_date', type: 'date' })
  startDate: string;

  @Column({ name: 'end_date', type: 'date' })
  endDate: string;

  @Column({ type: 'enum', enum: ExerciceStatus, default: ExerciceStatus.OPEN })
  status: ExerciceStatus;

  @CreateDateColumn({ name: 'created_at' })
  createdAt: Date;
}