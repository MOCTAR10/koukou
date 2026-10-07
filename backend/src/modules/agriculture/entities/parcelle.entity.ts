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
import type { GeoJsonGeometry } from '../../../common/geo/geo-geometry.js';
import { ParcelleStatus } from '../../../common/enums/parcelle-status.enum.js';
import { Farm } from '../../farms/entities/farm.entity.js';
import { Culture } from './culture.entity.js';

/** Parcelle agricole d'une ferme (scopée par ferme, comme un bâtiment). */
@Entity('parcelles')
export class Parcelle {
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

  @ManyToOne(() => Culture, { onDelete: 'RESTRICT', eager: true })
  @JoinColumn({ name: 'culture_id' })
  culture: Culture;

  @Column({ name: 'culture_id', type: 'uuid' })
  cultureId: string;

  /** Surface (ha). Si un contour GeoJSON est fourni, recalculée par PostGIS. */
  @Column({ name: 'area_ha', type: 'float' })
  areaHa: number;

  /** Contour de la parcelle (GeoJSON Polygon/MultiPolygon) — sondable par PostGIS. */
  @Column({ name: 'boundary_geojson', type: 'jsonb', nullable: true })
  boundaryGeoJson: GeoJsonGeometry | null;

  @Column({ name: 'planted_at', type: 'date', nullable: true })
  plantedAt: string | null;

  @Column({ type: 'enum', enum: ParcelleStatus, default: ParcelleStatus.ACTIVE })
  status: ParcelleStatus;

  @Column({ type: 'text', nullable: true })
  notes: string | null;

  @CreateDateColumn()
  createdAt: Date;

  @UpdateDateColumn()
  updatedAt: Date;
}