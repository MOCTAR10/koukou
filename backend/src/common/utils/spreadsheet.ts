/**
 * Excel (.xlsx) next to the CSV helpers: one sheet written from a header row
 * and data rows, and the first sheet of an upload read back as raw text cells
 * (the same `string[][]` shape as `parseCsv`, so importers map both alike).
 */
import ExcelJS from 'exceljs';

export class SpreadsheetError extends Error {}

/** MIME type of an .xlsx file (Content-Type of exports). */
export const XLSX_MIME =
  'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet';

/** An .xlsx is a zip: it starts with `PK\x03\x04`. A CSV never does. */
export function looksLikeXlsx(buffer: Buffer): boolean {
  return (
    buffer.length >= 4 &&
    buffer[0] === 0x50 &&
    buffer[1] === 0x4b &&
    buffer[2] === 0x03 &&
    buffer[3] === 0x04
  );
}

/** Excel refuses a sheet name over 31 characters or with `[]:*?/\`. */
function sheetNameOf(name: string | undefined): string {
  const clean = (name ?? 'Feuille 1').replace(/[[\]:*?/\\]/g, ' ').trim();
  return (clean || 'Feuille 1').slice(0, 31);
}

/**
 * One-sheet workbook: bold, frozen header row, columns sized to their
 * content. Numbers and dates stay typed (Excel sums and sorts them); other
 * values become text, never formulas (a label starting with `=` is stored
 * as a string, so no formula injection).
 */
export async function toXlsx(
  headers: string[],
  rows: unknown[][],
  options?: { sheetName?: string },
): Promise<Buffer> {
  const workbook = new ExcelJS.Workbook();
  workbook.creator = 'Fermia';
  const sheet = workbook.addWorksheet(sheetNameOf(options?.sheetName), {
    views: [{ state: 'frozen', ySplit: 1 }],
  });
  sheet.addRow(headers);
  sheet.getRow(1).font = { bold: true };
  const widths = headers.map((h) => h.length);
  for (const row of rows) {
    const cells = row.map((value) => {
      if (value == null) return null;
      if (typeof value === 'number' && Number.isFinite(value)) return value;
      if (value instanceof Date) return value;
      if (typeof value === 'boolean') return value ? 'oui' : 'non';
      return String(value);
    });
    sheet.addRow(cells);
    cells.forEach((cell, i) => {
      const length =
        cell instanceof Date ? 10 : cell == null ? 0 : String(cell).length;
      widths[i] = Math.max(widths[i] ?? 0, length);
    });
  }
  widths.forEach((width, i) => {
    sheet.getColumn(i + 1).width = Math.min(Math.max(width + 2, 8), 60);
  });
  const data = await workbook.xlsx.writeBuffer();
  return Buffer.from(data as ArrayBuffer);
}

/** `toXlsx` from keyed rows, `columns` as in `CsvService.toCsvObject`. */
export function toXlsxObject<T extends Record<string, unknown>>(
  columns: ReadonlyArray<readonly [keyof T & string, string]>,
  rows: T[],
  options?: { sheetName?: string },
): Promise<Buffer> {
  return toXlsx(
    columns.map(([, header]) => header),
    rows.map((row) => columns.map(([key]) => row[key])),
    options,
  );
}

const pad = (n: number) => String(n).padStart(2, '0');

/** A date cell as `YYYY-MM-DD` (time kept only when it is not midnight). */
function dateText(date: Date): string {
  const day = `${date.getUTCFullYear()}-${pad(date.getUTCMonth() + 1)}-${pad(date.getUTCDate())}`;
  const h = date.getUTCHours();
  const m = date.getUTCMinutes();
  return h === 0 && m === 0 ? day : `${day} ${pad(h)}:${pad(m)}`;
}

/** The text a cell shows: formulas give their result, rich text its runs. */
function cellText(value: ExcelJS.CellValue): string {
  if (value == null) return '';
  if (value instanceof Date) return dateText(value);
  if (typeof value === 'object') {
    if ('result' in value) {
      const result = (value as ExcelJS.CellFormulaValue).result;
      return result == null || typeof result === 'object'
        ? result instanceof Date
          ? dateText(result)
          : ''
        : String(result);
    }
    if ('richText' in value) {
      return (value as ExcelJS.CellRichTextValue).richText
        .map((run) => run.text)
        .join('');
    }
    if ('text' in value) {
      const text = (value as ExcelJS.CellHyperlinkValue).text;
      return typeof text === 'string' ? text : '';
    }
    if ('error' in value) return '';
  }
  return String(value);
}

/** A real farm workbook is far below these; a zip bomb is far above. */
const XLSX_MAX_UNCOMPRESSED_BYTES = 60 * 1024 * 1024;
const XLSX_MAX_ENTRIES = 500;

/**
 * Zip-bomb guard: reads the zip central directory (declared sizes only, no
 * inflate) and refuses a workbook that would expand past the limits, before
 * exceljs inflates anything into memory.
 */
export function assertXlsxNotBomb(buffer: Buffer): void {
  const bad = () =>
    new SpreadsheetError(
      'Fichier Excel refusé : contenu compressé anormalement volumineux.',
    );
  if (!looksLikeXlsx(buffer)) return;
  // End of central directory record: last 22 bytes + up to 64 KB of comment.
  const minStart = Math.max(0, buffer.length - 22 - 0xffff);
  let eocd = -1;
  for (let i = buffer.length - 22; i >= minStart; i--) {
    if (buffer.readUInt32LE(i) === 0x06054b50) {
      eocd = i;
      break;
    }
  }
  if (eocd < 0) return; // exceljs will report an unreadable file
  const entries = buffer.readUInt16LE(eocd + 10);
  let offset = buffer.readUInt32LE(eocd + 16);
  if (entries > XLSX_MAX_ENTRIES) throw bad();
  let total = 0;
  for (let n = 0; n < entries; n++) {
    if (offset + 46 > buffer.length || buffer.readUInt32LE(offset) !== 0x02014b50) {
      return;
    }
    total += buffer.readUInt32LE(offset + 24);
    if (total > XLSX_MAX_UNCOMPRESSED_BYTES) throw bad();
    offset +=
      46 +
      buffer.readUInt16LE(offset + 28) +
      buffer.readUInt16LE(offset + 30) +
      buffer.readUInt16LE(offset + 32);
  }
}

/**
 * Rows of the first sheet, each a list of raw text cells (not trimmed), from
 * column A to the last filled column. Blank rows are dropped, like
 * `parseCsv`. Hidden columns and other sheets are ignored.
 * @throws SpreadsheetError on a file that is not a readable workbook, or
 *   with more than `maxRows` rows (checked before reading the cells).
 */
export async function readXlsx(
  buffer: Buffer,
  options?: { maxRows?: number },
): Promise<string[][]> {
  assertXlsxNotBomb(buffer);
  const workbook = new ExcelJS.Workbook();
  try {
    await workbook.xlsx.load(buffer as unknown as ArrayBuffer);
  } catch {
    throw new SpreadsheetError(
      'Fichier Excel illisible : enregistrez-le au format .xlsx ou .csv.',
    );
  }
  const sheet = workbook.worksheets[0];
  if (!sheet) return [];
  if (options?.maxRows != null && sheet.actualRowCount > options.maxRows) {
    throw new SpreadsheetError(
      `Fichier trop long : ${options.maxRows} lignes au plus.`,
    );
  }
  const width = sheet.actualColumnCount;
  const rows: string[][] = [];
  sheet.eachRow({ includeEmpty: false }, (row) => {
    const cells: string[] = [];
    for (let c = 1; c <= width; c++) cells.push(cellText(row.getCell(c).value));
    if (!cells.every((cell) => cell.trim() === '')) rows.push(cells);
  });
  return rows;
}
