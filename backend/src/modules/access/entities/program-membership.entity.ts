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
import type { User } from '../../users/entities/user.entity.js';
import type { AccessProfile } from './access-profile.entity.js';

/**
 * Attachment of an institutional account to the programme: its profile and
 * its scope (provinces, farms, operator). One per account; suspended with
 * `active = false`, expired past `validUntil`.
 */
@Entity('program_memberships')
export class ProgramMembership {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @ManyToOne('User', { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'user_id' })
  user?: User;

  @Index('UQ_program_memberships_user', { unique: true })
  @Column({ name: 'user_id', type: 'uuid' })
  userId: string;

  @ManyToOne('AccessProfile', { onDelete: 'RESTRICT' })
  @JoinColumn({ name: 'profile_id' })
  profile?: AccessProfile;

  @Index()
  @Column({ name: 'profile_id', type: 'uuid' })
  profileId: string;

  /** Provinces of a PROVINCES scope. */
  @Column({
    name: 'province_ids',
    type: 'uuid',
    array: true,
    default: () => "'{}'",
  })
  provinceIds: string[];

  /** Farms of a FARMS scope. */
  @Column({
    name: 'farm_ids',
    type: 'uuid',
    array: true,
    default: () => "'{}'",
  })
  farmIds: string[];

  /** Operator of an OPERATOR scope (reserved: no operator model yet). */
  @Column({ name: 'operator_id', type: 'uuid', nullable: true })
  operatorId: string | null;

  @Column({ type: 'boolean', default: true })
  active: boolean;

  @Column({ name: 'valid_until', type: 'timestamptz', nullable: true })
  validUntil: Date | null;

  @ManyToOne('User', { onDelete: 'SET NULL', nullable: true })
  @JoinColumn({ name: 'created_by' })
  createdBy?: User | null;

  @Column({ name: 'created_by', type: 'uuid', nullable: true })
  createdById: string | null;

  @CreateDateColumn({ name: 'created_at', type: 'timestamptz' })
  createdAt: Date;

  @UpdateDateColumn({ name: 'updated_at', type: 'timestamptz' })
  updatedAt: Date;
}
