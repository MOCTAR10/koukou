import { Column, Entity, PrimaryColumn } from 'typeorm';

/**
 * Monotonic number per scope ('FARM:G1', 'LOCALITE:<provinceId>'…). `next`
 * holds the LAST number handed out; numbers are never reused. Always go
 * through `IdCounterService.next`, which increments atomically.
 */
@Entity('id_counters')
export class IdCounter {
  @PrimaryColumn({ type: 'varchar', length: 120 })
  scope: string;

  @Column({ type: 'int' })
  next: number;
}
