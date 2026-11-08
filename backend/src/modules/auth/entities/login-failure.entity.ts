import { Column, Entity, PrimaryColumn } from 'typeorm';

/**
 * Failed-login counter of one account seen from one client IP. A stranger
 * guessing from his own address locks that pair only, never the owner coming
 * from elsewhere (the account-wide ceiling stays on `users.failed_logins`).
 * Rows older than the account's last code reset are ignored.
 */
@Entity('login_failures')
export class LoginFailure {
  @PrimaryColumn({ name: 'user_id', type: 'uuid' })
  userId: string;

  @PrimaryColumn({ type: 'varchar', length: 64 })
  ip: string;

  @Column({ type: 'int', default: 0 })
  failures: number;

  @Column({ name: 'locked_until', type: 'timestamptz', nullable: true })
  lockedUntil: Date | null;

  @Column({ name: 'updated_at', type: 'timestamptz', default: () => 'now()' })
  updatedAt: Date;
}
