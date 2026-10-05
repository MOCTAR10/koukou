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

/** Nature comptable d'un compte (dérivée du plan OHADA). */
export type AccountNature =
  | 'ACTIF'
  | 'PASSIF'
  | 'CAPITAUX'
  | 'CHARGE'
  | 'PRODUIT'
  | 'TRESORERIE';

/** Compte du plan comptable SYSCOHADA, par ferme (labels locaux éditables). */
@Index('UQ_accounts_farm_code', ['farmId', 'code'], { unique: true })
@Entity('accounting_accounts')
export class Account {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @ManyToOne(() => Farm, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'farm_id' })
  farm: Farm;

  @Column({ name: 'farm_id', type: 'uuid' })
  @Index()
  farmId: string;

  /** Code SYSCOHADA (ex. 571, 411, 7011). */
  @Column({ type: 'varchar', length: 8 })
  code: string;

  @Column({ type: 'varchar', length: 120 })
  label: string;

  /** Classe SYSCOHADA (1..8). */
  @Column({ type: 'int' })
  classe: number;

  @Column({ type: 'varchar', length: 12 })
  nature: AccountNature;

  /** Compte créé localement par la ferme (sur demande). */
  @Column({ name: 'is_custom', default: false })
  isCustom: boolean;

  @CreateDateColumn({ name: 'created_at' })
  createdAt: Date;

  @UpdateDateColumn({ name: 'updated_at' })
  updatedAt: Date;
}