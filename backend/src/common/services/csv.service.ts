import { Injectable } from '@nestjs/common';

/** CSV UTF-8 simple (point-virgule, compatible Excel). */
@Injectable()
export class CsvService {
  toCsv(
    headers: string[],
    rows: unknown[][],
    options?: { separator?: string },
  ): Buffer {
    const sep = options?.separator ?? ';';
    const escape = (value: unknown): string => {
      const text = value == null ? '' : String(value);
      return /[";\n\r]/.test(text) ? `"${text.replace(/"/g, '""')}"` : text;
    };
    const lines = [headers.map(escape).join(sep)];
    for (const row of rows) {
      lines.push(row.map(escape).join(sep));
    }
    return Buffer.from('\uFEFF' + lines.join('\r\n'), 'utf8');
  }

  /** `columns` maps each row key to its display header (keys ≠ headers). */
  toCsvObject<T extends Record<string, unknown>>(
    columns: ReadonlyArray<readonly [keyof T & string, string]>,
    rows: T[],
    options?: { separator?: string },
  ): Buffer {
    return this.toCsv(
      columns.map(([, header]) => header),
      rows.map((row) => columns.map(([key]) => row[key])),
      options,
    );
  }
}