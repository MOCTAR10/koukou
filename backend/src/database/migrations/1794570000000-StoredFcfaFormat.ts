import { MigrationInterface, QueryRunner } from 'typeorm';
import { fcfaFr } from '../../common/utils/date.utils.js';

/** A bare amount of 4+ digits followed by « FCFA » (old unformatted text). */
const RAW = /\b(\d{4,}) FCFA/g;

export function formatStoredFcfa(text: string): string {
  return text.replace(RAW, (_m, n: string) => fcfaFr(Number(n)));
}

/**
 * Loss alerts raised before fcfaFr() kept raw amounts (« 975000 FCFA »).
 * Rewrites the stored text of alerts and of the notifications that copied it.
 * Data only, no schema change; down() is a no-op (the old text was a defect).
 */
export class StoredFcfaFormat1794570000000 implements MigrationInterface {
  name = 'StoredFcfaFormat1794570000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    const targets: [string, string[]][] = [
      ['alerts', ['message']],
      ['notifications', ['title', 'body']],
    ];
    for (const [table, cols] of targets) {
      const where = cols.map((c) => `"${c}" ~ '[0-9]{4,} FCFA'`).join(' OR ');
      const rows: Record<string, string>[] = await queryRunner.query(
        `SELECT "id", ${cols.map((c) => `"${c}"`).join(', ')} FROM "${table}" WHERE ${where}`,
      );
      for (const row of rows) {
        const values = cols.map((c) => formatStoredFcfa(row[c] ?? ''));
        const set = cols.map((c, i) => `"${c}" = $${i + 1}`).join(', ');
        await queryRunner.query(
          `UPDATE "${table}" SET ${set} WHERE "id" = $${cols.length + 1}`,
          [...values, row.id],
        );
      }
    }
  }

  public async down(): Promise<void> {
    // Nothing to restore: the unformatted amounts were a display defect.
  }
}
