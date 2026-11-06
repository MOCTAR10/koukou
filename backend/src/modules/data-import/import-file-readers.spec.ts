import { BadRequestException } from '@nestjs/common';
import { describe, expect, it } from 'vitest';
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

  it('refuses a workbook until the xlsx reader exists', async () => {
    const zip = Buffer.from([0x50, 0x4b, 0x03, 0x04, 0, 0]);
    await expect(readImportFile(file('fermes.bin', zip))).rejects.toThrow(
      /enregistrez la feuille au format CSV/,
    );
    await expect(
      readImportFile(file('fermes.xlsx', Buffer.from('x'))),
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
