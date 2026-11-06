import { BadRequestException, Inject, Injectable } from '@nestjs/common';
import { CsvService } from '../../common/services/csv.service.js';

/**
 * Export seam: a service builds a table (columns + rows), a serializer turns
 * it into a file. CSV is the only format today; an Excel writer (`exceljs`,
 * approved, added on the integration branch) implements `TableSerializer`
 * with `format: 'xlsx'` and joins the `TABLE_SERIALIZERS` list in
 * `ReportingModule` — no export service changes.
 */

/** Rows keyed by column key; `columns` maps each key to its French header. */
export interface ExportTable {
  /** File name without extension, e.g. `pilotage-fermes-2026-10-01-2026-10-31`. */
  baseName: string;
  /** Sheet title for a workbook format. */
  sheetName: string;
  columns: ReadonlyArray<readonly [string, string]>;
  rows: ReadonlyArray<Record<string, unknown>>;
}

export interface ExportFile {
  filename: string;
  contentType: string;
  buffer: Buffer;
}

export interface TableSerializer {
  /** Format code asked by the caller (`csv`, later `xlsx`). */
  readonly format: string;
  readonly extension: string;
  readonly contentType: string;
  /** Headers first, then one array per row (numbers stay numbers, null = empty). */
  serialize(
    headers: readonly string[],
    rows: readonly (readonly unknown[])[],
    sheetName: string,
  ): Buffer | Promise<Buffer>;
}

export const TABLE_SERIALIZERS = Symbol('TABLE_SERIALIZERS');

/** CSV through the shared `CsvService` (`;`, UTF-8 BOM, formula escaping). */
@Injectable()
export class CsvTableSerializer implements TableSerializer {
  readonly format = 'csv';
  readonly extension = 'csv';
  readonly contentType = 'text/csv; charset=utf-8';

  constructor(private readonly csv: CsvService) {}

  serialize(
    headers: readonly string[],
    rows: readonly (readonly unknown[])[],
  ): Buffer {
    return this.csv.toCsv(
      [...headers],
      rows.map((r) => [...r]),
    );
  }
}

@Injectable()
export class ExportWriter {
  constructor(
    @Inject(TABLE_SERIALIZERS)
    private readonly serializers: readonly TableSerializer[],
  ) {}

  get formats(): string[] {
    return this.serializers.map((s) => s.format);
  }

  async write(table: ExportTable, format = 'csv'): Promise<ExportFile> {
    const serializer = this.serializers.find((s) => s.format === format);
    if (!serializer) {
      throw new BadRequestException(
        `Format d’export inconnu : ${format} (formats disponibles : ${this.formats.join(', ')}).`,
      );
    }
    const headers = table.columns.map(([, header]) => header);
    const rows = table.rows.map((row) =>
      table.columns.map(([key]) => row[key] ?? null),
    );
    return {
      filename: `${table.baseName}.${serializer.extension}`,
      contentType: serializer.contentType,
      buffer: await serializer.serialize(headers, rows, table.sheetName),
    };
  }
}
