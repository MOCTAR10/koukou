import {
  Column,
  CreateDateColumn,
  Entity,
  PrimaryGeneratedColumn,
  UpdateDateColumn,
} from 'typeorm';
import { UserRole } from '../../../common/enums/role.enum.js';

@Entity('users')
export class User {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ unique: true })
  phone: string;

  @Column({ type: 'varchar', unique: true, nullable: true })
  email: string | null;

  @Column()
  passwordHash: string;

  @Column()
  fullName: string;

  @Column({ type: 'enum', enum: UserRole, default: UserRole.PROPRIETAIRE })
  role: UserRole;

  @Column({ default: true })
  active: boolean;

  /** Consecutive failed logins since the last success (account lockout). */
  @Column({ name: 'failed_logins', type: 'int', default: 0 })
  failedLogins: number;

  /** Login refused until this instant (null = not locked). */
  @Column({ name: 'locked_until', type: 'timestamptz', nullable: true })
  lockedUntil: Date | null;

  @CreateDateColumn()
  createdAt: Date;

  @UpdateDateColumn()
  updatedAt: Date;
}
