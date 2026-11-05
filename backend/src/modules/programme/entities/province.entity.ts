import {
  Column,
  CreateDateColumn,
  Entity,
  Index,
  JoinColumn,
  ManyToOne,
  OneToMany,
  PrimaryGeneratedColumn,
  UpdateDateColumn,
} from 'typeorm';
import type { GeoJsonGeometry } from '../../../common/geo/geo-geometry.js';
import { Program } from './program.entity.js';
import type { Localite } from './localite.entity.js';

/** Province of a programme (Gabon: G1…G9). */
@Index('UQ_provinces_program_code', ['programId', 'code'], { unique: true })
@Entity('provinces')
export class Province {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @ManyToOne(() => Program, { onDelete: 'RESTRICT' })
  @JoinColumn({ name: 'program_id' })
  program: Program;

  @Column({ name: 'program_id', type: 'uuid' })
  programId: string;

  @Column({ type: 'varchar', length: 16 })
  code: string;

  @Column({ type: 'varchar' })
  name: string;

  @Column({ name: 'chef_lieu', type: 'varchar' })
  chefLieu: string;

  /**
   * Boundary (GeoJSON Polygon / MultiPolygon, WGS84 [lng, lat]) uploaded by an
   * administrator; null until then (the GPS check then answers "unknown").
   * Not selected by default: lists never carry it.
   */
  @Column({ type: 'jsonb', nullable: true, select: false })
  geometry: GeoJsonGeometry | null;

  @Column({ type: 'int', default: 0 })
  sort: number;

  @OneToMany('Localite', (l: Localite) => l.province)
  localites: Localite[];

  @CreateDateColumn({ name: 'created_at', type: 'timestamptz' })
  createdAt: Date;

  @UpdateDateColumn({ name: 'updated_at', type: 'timestamptz' })
  updatedAt: Date;
}
