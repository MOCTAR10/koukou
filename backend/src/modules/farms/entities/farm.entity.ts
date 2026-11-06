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
import { GpsSource } from '../../../common/enums/gps-source.enum.js';
import { User } from '../../users/entities/user.entity.js';
import type { Localite } from '../../programme/entities/localite.entity.js';
import type { Program } from '../../programme/entities/program.entity.js';
import type { Province } from '../../programme/entities/province.entity.js';

/** Who confirmed a programme farm despite probable duplicates, and which ones. */
export interface DuplicateOverride {
  confirmedAt: string;
  confirmedById: string | null;
  candidateCodes: string[];
}

/**
 * A farm, always of the programme (POUFA-only instance): created by the
 * registry with its sheet (code, territory, exploitant, capacity, GPS and
 * current status, history in `farm_status_history`). It may exist before
 * the exploitant has an account, so `ownerId` is nullable.
 */
@Index('UQ_farms_program_ami_ref', ['programId', 'amiRef'], { unique: true })
@Entity('farms')
export class Farm {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column()
  name: string;

  @Column()
  @Index()
  administrativeCity: string;

  /** Null while the exploitant has no account (`activate-owner`). */
  @ManyToOne(() => User, { onDelete: 'RESTRICT', nullable: true })
  @JoinColumn({ name: 'owner_id' })
  owner: User | null;

  @Column({ name: 'owner_id', type: 'uuid', nullable: true })
  ownerId: string | null;

  @Column({ type: 'int', nullable: true })
  buildingCount: number | null;

  @Column({ type: 'int', nullable: true })
  capacityPerBuilding: number | null;

  @Column({ name: 'building_area_m2', type: 'float', nullable: true })
  buildingAreaM2: number | null;

  @Column({ name: 'default_sac_kg', type: 'float', default: 50 })
  defaultSacKg: number;

  /** Chemin public du logo de la ferme (ex. « /uploads/logos/<farmId>.png »),
   *  servi par les assets statiques de l'API. Null = logo Fermia par défaut. */
  @Column({ name: 'logo_url', type: 'varchar', nullable: true })
  logoUrl: string | null;

  @Column({ name: 'longitude', type: 'float', nullable: true })
  longitude: number | null;

  @Column({ name: 'latitude', type: 'float', nullable: true })
  latitude: number | null;

  @Column({ name: 'is_verified', default: false })
  isVerified: boolean;

  @Column({ default: true })
  active: boolean;

  // ----- Programme registry sheet -----

  /** Never changes once set (DB trigger `farms_programme_code_immutable`). */
  @ManyToOne('Program', { onDelete: 'RESTRICT', nullable: false })
  @JoinColumn({ name: 'program_id' })
  program?: Program;

  @Column({ name: 'program_id', type: 'uuid' })
  programId: string;

  /** `G1-0012`: province code + IdCounter number. Never changed nor reused (DB trigger). */
  @Column({ type: 'varchar', length: 32, nullable: true, unique: true })
  code: string | null;

  @ManyToOne('Province', { onDelete: 'RESTRICT', nullable: true })
  @JoinColumn({ name: 'province_id' })
  province?: Province | null;

  @Column({ name: 'province_id', type: 'uuid', nullable: true })
  @Index()
  provinceId: string | null;

  @ManyToOne('Localite', { onDelete: 'RESTRICT', nullable: true })
  @JoinColumn({ name: 'localite_id' })
  localite?: Localite | null;

  @Column({ name: 'localite_id', type: 'uuid', nullable: true })
  localiteId: string | null;

  /** Reference of the AMI application form; unique per programme. */
  @Column({ name: 'ami_ref', type: 'varchar', length: 64, nullable: true })
  amiRef: string | null;

  /** Code of a COHORTE list item. */
  @Column({ type: 'varchar', length: 40, nullable: true })
  cohort: string | null;

  /** Places (birds): base of the occupation rate. */
  @Column({ name: 'capacity_places', type: 'int', nullable: true })
  capacityPlaces: number | null;

  @Column({ name: 'gps_captured_at', type: 'timestamptz', nullable: true })
  gpsCapturedAt: Date | null;

  @Column({
    name: 'gps_source',
    type: 'enum',
    enum: GpsSource,
    nullable: true,
  })
  gpsSource: GpsSource | null;

  @Column({ name: 'gps_accuracy_m', type: 'float', nullable: true })
  gpsAccuracyM: number | null;

  /** GPS ↔ province warning (GeoService), never a block. */
  @Column({ name: 'gps_province_warning', type: 'text', nullable: true })
  gpsProvinceWarning: string | null;

  /** Exploitant identity on the sheet (the account may not exist yet). */
  @Column({ name: 'exploitant_name', type: 'varchar', nullable: true })
  exploitantName: string | null;

  /** Normalized like account phones (`normalizePhone`). */
  @Column({ name: 'exploitant_phone', type: 'varchar', nullable: true })
  @Index()
  exploitantPhone: string | null;

  /**
   * Current STATUT_FERME code: a copy of the latest `farm_status_history`
   * row (written in the same transaction), kept for list filters.
   */
  @Column({ name: 'status_code', type: 'varchar', length: 40, nullable: true })
  statusCode: string | null;

  @Column({ name: 'status_since', type: 'timestamptz', nullable: true })
  statusSince: Date | null;

  @Column({ name: 'duplicate_override', type: 'jsonb', nullable: true })
  duplicateOverride: DuplicateOverride | null;

  @CreateDateColumn()
  createdAt: Date;

  @UpdateDateColumn()
  updatedAt: Date;
}
