import { BadRequestException } from '@nestjs/common';
import { CsvError, detectDelimiter, parseCsv } from '../programme/farms/csv.js';
import {
  IMPORT_MAX_ROWS,
  type UploadedCsvFile,
} from '../programme/farms/farm-import.service.js';
import {
  readXlsx,
  SpreadsheetError,
} from '../../common/utils/spreadsheet.js';

/**
 * Parser seam of the recovery import: every uploaded file becomes the same
 * table (header + data rows of plain strings) whatever its format, and the
 * rest of the flow (mapping, staging, controls) only sees that table.
 *
 * Readers: Excel .xlsx / .xlsm (first sheet, `readXlsx`), then CSV; older
 * workbooks (.xls, .ods) get a clear refusal.
 */
export interface ImportTable {
  /** Raw header cells (made unique by the caller). */
  readonly header: string[];
  /** Data rows, blank rows already left out, cells as text. */
  readonly rows: string[][];
  /** Stored on the job: `utf-8` / `latin1` for CSV, `xlsx` for Excel. */
  readonly encoding: string;
  /** Stored on the job: `,` / `;` for CSV, '' for a workbook. */
  readonly delimiter: string;
}

export interface ImportFileReader {
  /** Short French name used in messages. */
  readonly label: string;
  accepts(file: UploadedCsvFile): boolean;
  read(buffer: Buffer): ImportTable | Promise<ImportTable>;
}

/** UTF-8 (BOM tolerated), else Windows-1252/Latin-1 as Excel often saves. */
export function decodeText(buffer: Buffer): { text: string; encoding: string } {
  try {
    return {
      text: new TextDecoder('utf-8', { fatal: true }).decode(buffer),
      encoding: 'utf-8',
    };
  } catch {
    return { text: buffer.toString('latin1'), encoding: 'latin1' };
  }
}

function extensionOf(name: string): string {
  const dot = name.lastIndexOf('.');
  return dot < 0 ? '' : name.slice(dot + 1).toLowerCase();
}

const ZIP_SIGNATURE = Buffer.from([0x50, 0x4b, 0x03, 0x04]);
const OLE_SIGNATURE = Buffer.from([0xd0, 0xcf, 0x11, 0xe0]);

/** An Office Open XML workbook (.xlsx, .xlsm): a zip. */
function isXlsx(file: UploadedCsvFile): boolean {
  const ext = extensionOf(file.originalname ?? '');
  if (['xlsx', 'xlsm'].includes(ext)) return true;
  if (/spreadsheetml/.test(file.mimetype ?? '')) return true;
  return file.buffer.subarray(0, 4).equals(ZIP_SIGNATURE);
}

/** A workbook exceljs does not read (.xls, .ods). */
function isOtherWorkbook(file: UploadedCsvFile): boolean {
  const ext = extensionOf(file.originalname ?? '');
  if (['xls', 'ods'].includes(ext)) return true;
  // Not `application/vnd.ms-excel`: Windows browsers send it for .csv files.
  if (/opendocument\.spreadsheet/.test(file.mimetype ?? '')) return true;
  return file.buffer.subarray(0, 4).equals(OLE_SIGNATURE);
}

function isWorkbook(file: UploadedCsvFile): boolean {
  return isXlsx(file) || isOtherWorkbook(file);
}

/** CSV with `,` or `;`, UTF-8 or Latin-1: the farm importer's parser. */
export const csvReader: ImportFileReader = {
  label: 'CSV',
  accepts: (file) => !isWorkbook(file),
  read(buffer) {
    const { text, encoding } = decodeText(buffer);
    let table: string[][];
    try {
      table = parseCsv(text);
    } catch (e) {
      if (e instanceof CsvError) throw new BadRequestException(e.message);
      throw e;
    }
    const [header = [], ...rows] = table;
    return { header, rows, encoding, delimiter: detectDelimiter(text) };
  },
};

/** Excel .xlsx / .xlsm: first sheet, cells as shown, dates `yyyy-mm-dd`. */
export const xlsxReader: ImportFileReader = {
  label: 'Excel',
  accepts: isXlsx,
  async read(buffer) {
    let table: string[][];
    try {
      // Header + IMPORT_MAX_ROWS rows; longer files are refused early.
      table = await readXlsx(buffer, { maxRows: IMPORT_MAX_ROWS + 1 });
    } catch (e) {
      if (e instanceof SpreadsheetError) {
        throw new BadRequestException(e.message);
      }
      throw e;
    }
    const [header = [], ...rows] = table;
    return { header, rows, encoding: 'xlsx', delimiter: '' };
  },
};

/** .xls / .ods: a clear refusal rather than a garbled CSV parse. */
const OTHER_WORKBOOK: ImportFileReader = {
  label: 'Excel',
  accepts: isOtherWorkbook,
  read() {
    throw new BadRequestException(
      'Ce format de classeur n’est pas lu : enregistrez la feuille au format Excel .xlsx ou CSV (Fichier › Enregistrer sous) et déposez ce fichier.',
    );
  },
};

/** First reader that accepts the file wins. */
const READERS: readonly ImportFileReader[] = [
  xlsxReader,
  OTHER_WORKBOOK,
  csvReader,
];

export async function readImportFile(
  file: UploadedCsvFile,
  readers: readonly ImportFileReader[] = READERS,
): Promise<ImportTable> {
  const reader = readers.find((r) => r.accepts(file));
  if (!reader) {
    throw new BadRequestException('Format de fichier non pris en charge.');
  }
  return reader.read(file.buffer);
}
