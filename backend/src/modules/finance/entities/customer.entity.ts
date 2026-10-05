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
import { User } from '../../users/entities/user.entity.js';
import { CustomerType } from '../../../common/enums/customer-type.enum.js';

@Entity('customers')
@Index('IDX_customers_farm_phone', ['farmId', 'phone'])
@Index('IDX_customers_farm_code', ['farmId', 'code'], { unique: true })
export class Customer {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @ManyToOne(() => Farm, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'farm_id' })
  farm: Farm;

  @Column({ name: 'farm_id', type: 'uuid' })
  @Index()
  farmId: string;

  /** Code interne client (ex. CL-0001). Généré automatiquement à la création. */
  @Column({ name: 'code', type: 'varchar', nullable: true })
  code: string | null;

  @Column({ name: 'full_name' })
  fullName: string;

  /** Nature du client (particulier, restaurant, hôtel…). Sépare le segment (valeur calculée). */
  @Column({ name: 'type', type: 'varchar', default: CustomerType.PARTICULIER })
  type: CustomerType | string;

  @Column({ type: 'varchar', nullable: true })
  phone: string | null;

  @Column({ type: 'varchar', nullable: true })
  email: string | null;

  @Column({ type: 'varchar', nullable: true })
  city: string | null;

  @Column({ type: 'text', nullable: true })
  notes: string | null;

  @ManyToOne(() => User, { nullable: true })
  @JoinColumn({ name: 'created_by' })
  createdBy: User | null;

  @Column({ name: 'created_by', type: 'uuid', nullable: true })
  createdById: string | null;

  @CreateDateColumn({ name: 'created_at' })
  createdAt: Date;

  @UpdateDateColumn({ name: 'updated_at' })
  updatedAt: Date;
}
