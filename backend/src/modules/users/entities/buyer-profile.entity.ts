import {
  Column,
  CreateDateColumn,
  Entity,
  JoinColumn,
  OneToOne,
  PrimaryGeneratedColumn,
  UpdateDateColumn,
} from 'typeorm';
import { CustomerType } from '../../../common/enums/customer-type.enum.js';
import { User } from './user.entity.js';

/** Who a user is when buying on the Market. Any role can have one. */
@Entity('buyer_profiles')
export class BuyerProfile {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @OneToOne(() => User, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'user_id' })
  user: User;

  @Column({ name: 'user_id', type: 'uuid', unique: true })
  userId: string;

  @Column({ type: 'enum', enum: CustomerType, default: CustomerType.PARTICULIER })
  type: CustomerType;

  /** Hotel, restaurant or company name. */
  @Column({ name: 'organization_name', type: 'varchar', nullable: true })
  organizationName: string | null;

  @Column({ type: 'varchar', nullable: true })
  city: string | null;

  @CreateDateColumn({ name: 'created_at' })
  createdAt: Date;

  @UpdateDateColumn({ name: 'updated_at' })
  updatedAt: Date;
}
