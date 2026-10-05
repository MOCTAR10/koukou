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
import { User } from '../../users/entities/user.entity.js';

@Entity('farms')
export class Farm {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column()
  name: string;

  @Column()
  @Index()
  administrativeCity: string;

  @ManyToOne(() => User, { onDelete: 'RESTRICT' })
  @JoinColumn({ name: 'owner_id' })
  owner: User;

  @Column({ name: 'owner_id', type: 'uuid' })
  ownerId: string;

  @Column({ type: 'int', nullable: true })
  buildingCount: number | null;

  @Column({ type: 'int', nullable: true })
  capacityPerBuilding: number | null;

  @Column({ name: 'building_area_m2', type: 'float', nullable: true })
  buildingAreaM2: number | null;

  @Column({ name: 'default_sac_kg', type: 'float', default: 50 })
  defaultSacKg: number;

  /** Chemin public du logo de la ferme (ex. « /uploads/logos/<farmId>.png »),
   *  servi par les assets statiques de l'API. Null = logo KouKou par défaut. */
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

  @CreateDateColumn()
  createdAt: Date;

  @UpdateDateColumn()
  updatedAt: Date;
}
