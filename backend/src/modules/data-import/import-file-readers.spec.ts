import { BadRequestException } from '@nestjs/common';
import { describe, expect, it } from 'vitest';
import { toXlsx } from '../../common/utils/spreadsheet.js';
import {
  readImportFile,
  type ImportFileReader,
} from './import-file-readers.js';

const file = (name: string, buffer: Buffer, mimetype = 'text/csv') => ({
  originalname: name,
  mimetype,
  size: buffer.length,
  buffer,
});

describe('import file readers', () => {
  it('reads a Latin-1 CSV with ; into header + rows', async () => {
    const table = await readImportFile(
      file(
        'a.csv',
        Buffer.from('nom;province\r\nFerme Été;G1\r\n\r\n', 'latin1'),
      ),
    );
    // Windows browsers label a .csv as an Excel file: still read as CSV.
    const labelled = await readImportFile(
      file('b.csv', Buffer.from('nom,province\nA,G1\n'), 'application/vnd.ms-excel'),
    );
    expect(labelled.delimiter).toBe(',');
    expect(table).toEqual({
      header: ['nom', 'province'],
      rows: [['Ferme Été', 'G1']],
      encoding: 'latin1',
      delimiter: ';',
    });
  });

  it('reads the first sheet of an .xlsx, whatever its name or label', async () => {
    const xlsx = await toXlsx(['nom', 'effectif'], [['Ferme Été', 1200]]);
    const expected = {
      header: ['nom', 'effectif'],
      rows: [['Ferme Été', '1200']],
      encoding: 'xlsx',
      delimiter: '',
    };
    expect(await readImportFile(file('fermes.xlsx', xlsx))).toEqual(expected);
    // Recognised by its zip signature too (no extension, generic type).
    expect(
      await readImportFile(file('fermes', xlsx, 'application/octet-stream')),
    ).toEqual(expected);
  });

  it('refuses a broken .xlsx and older workbooks with a French hint', async () => {
    const zip = Buffer.from([0x50, 0x4b, 0x03, 0x04, 0, 0]);
    await expect(readImportFile(file('fermes.bin', zip))).rejects.toThrow(
      /Fichier Excel illisible/,
    );
    const ole = Buffer.from([0xd0, 0xcf, 0x11, 0xe0, 0, 0]);
    await expect(readImportFile(file('fermes.dat', ole))).rejects.toThrow(
      /format Excel .xlsx ou CSV/,
    );
    await expect(
      readImportFile(file('fermes.ods', Buffer.from('x'))),
    ).rejects.toBeInstanceOf(BadRequestException);
  });

  it('lets another reader be plugged in front of the CSV one', async () => {
    const xlsx: ImportFileReader = {
      label: 'Excel',
      accepts: (f) => f.originalname.endsWith('.xlsx'),
      read: async () => ({
        header: ['nom'],
        rows: [['A']],
        encoding: 'xlsx',
        delimiter: '',
      }),
    };
    const table = await readImportFile(file('a.xlsx', Buffer.from('x')), [
      xlsx,
    ]);
    expect(table.rows).toEqual([['A']]);
  });
});
