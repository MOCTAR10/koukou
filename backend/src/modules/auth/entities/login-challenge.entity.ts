import {
  Column,
  CreateDateColumn,
  Entity,
  Index,
  JoinColumn,
  ManyToOne,
  PrimaryGeneratedColumn,
} from 'typeorm';
import type { User } from '../../users/entities/user.entity.js';

/**
 * Second login step of an institutional account: a one-time code sent by
 * SMS. Only its bcrypt hash is stored (never journaled); it expires, allows a
 * few attempts and is consumed once.
 */
@Index('IDX_login_challenges_user_created', ['userId', 'createdAt'])
@Entity('login_challenges')
export class LoginChallenge {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @ManyToOne('User', { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'user_id' })
  user?: User;

  @Column({ name: 'user_id', type: 'uuid' })
  userId: string;

  @Column({ name: 'code_hash', type: 'varchar', length: 100 })
  codeHash: string;

  @Column({ name: 'expires_at', type: 'timestamptz' })
  expiresAt: Date;

  /** Wrong codes typed so far. */
  @Column({ type: 'integer', default: 0 })
  attempts: number;

  @Column({ name: 'consumed_at', type: 'timestamptz', nullable: true })
  consumedAt: Date | null;

  @CreateDateColumn({ name: 'created_at', type: 'timestamptz' })
  createdAt: Date;
}
