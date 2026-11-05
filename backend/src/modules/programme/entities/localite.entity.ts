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
import { LocaliteKind } from '../../../common/enums/localite-kind.enum.js';
import type { Province } from './province.entity.js';

/** Department, commune… of a province. Deactivated, never deleted. */
@Index('UQ_localites_province_code', ['provinceId', 'code'], { unique: true })
@Entity('localites')
export class Localite {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @ManyToOne('Province', (p: Province) => p.localites, {
    onDelete: 'RESTRICT',
  })
  @JoinColumn({ name: 'province_id' })
  province: Province;

  @Column({ name: 'province_id', type: 'uuid' })
  provinceId: string;

  /** Stable code, never changed (the name may be corrected). */
  @Column({ type: 'varchar', length: 40 })
  code: string;

  @Column({ type: 'varchar' })
  name: string;

  @Column({ type: 'enum', enum: LocaliteKind, default: LocaliteKind.AUTRE })
  kind: LocaliteKind;

  @Column({ name: 'chef_lieu', type: 'varchar', nullable: true })
  chefLieu: string | null;

  @Column({ default: true })
  active: boolean;

  @Column({ type: 'int', default: 0 })
  sort: number;

  @CreateDateColumn({ name: 'created_at', type: 'timestamptz' })
  createdAt: Date;

  @UpdateDateColumn({ name: 'updated_at', type: 'timestamptz' })
  updatedAt: Date;
}
