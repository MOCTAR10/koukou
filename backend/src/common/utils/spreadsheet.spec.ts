import ExcelJS from 'exceljs';
import {
  looksLikeXlsx,
  readXlsx,
  SpreadsheetError,
  toXlsx,
  toXlsxObject,
} from './spreadsheet.js';

describe('spreadsheet', () => {
  it('writes a typed sheet and reads it back as text cells', async () => {
    const buffer = await toXlsx(
      ['Code', 'Effectif', 'Date', 'Actif', 'Note'],
      [
        ['G1-0001', 1200, new Date(Date.UTC(2026, 10, 6)), true, null],
        ['G1-0002', 0, null, false, '=1+1'],
      ],
      { sheetName: 'Fermes: G1/POUFA [test] avec un nom bien trop long' },
    );
    expect(looksLikeXlsx(buffer)).toBe(true);

    const workbook = new ExcelJS.Workbook();
    await workbook.xlsx.load(buffer as unknown as ArrayBuffer);
    const sheet = workbook.worksheets[0];
    expect(sheet.name.length).toBeLessThanOrEqual(31);
    expect(sheet.name).not.toMatch(/[[\]:*?/\\]/);
    expect(sheet.getRow(1).font?.bold).toBe(true);
    expect(sheet.getCell('B2').value).toBe(1200);
    expect(sheet.getCell('C2').value).toBeInstanceOf(Date);
    // A label starting with « = » is text, never a formula.
    expect(sheet.getCell('E3').value).toBe('=1+1');
    expect(sheet.getCell('E3').formula).toBeUndefined();

    expect(await readXlsx(buffer)).toEqual([
      ['Code', 'Effectif', 'Date', 'Actif', 'Note'],
      ['G1-0001', '1200', '2026-11-06', 'oui', ''],
      ['G1-0002', '0', '', 'non', '=1+1'],
    ]);
  });

  it('maps keyed rows like CsvService.toCsvObject', async () => {
    const buffer = await toXlsxObject(
      [
        ['code', 'Code'],
        ['name', 'Nom'],
      ] as const,
      [{ code: 'G1-0001', name: 'Ferme A', ignored: 'x' }],
    );
    expect(await readXlsx(buffer)).toEqual([
      ['Code', 'Nom'],
      ['G1-0001', 'Ferme A'],
    ]);
  });

  it('reads formulas, rich text and hyperlinks as the text they show, skips blank rows', async () => {
    const workbook = new ExcelJS.Workbook();
    const sheet = workbook.addWorksheet('S');
    sheet.getCell('A1').value = 'Nom';
    sheet.getCell('B1').value = 'Total';
    sheet.getCell('A3').value = {
      richText: [{ text: 'Ferme ' }, { text: 'Nzeng', font: { bold: true } }],
    };
    sheet.getCell('B3').value = { formula: '2*21', result: 42 };
    sheet.getCell('A4').value = {
      text: 'site',
      hyperlink: 'https://example.org',
    };
    const buffer = Buffer.from(
      (await workbook.xlsx.writeBuffer()) as ArrayBuffer,
    );
    expect(await readXlsx(buffer)).toEqual([
      ['Nom', 'Total'],
      ['Ferme Nzeng', '42'],
      ['site', ''],
    ]);
  });

  it('refuses a file that is not a workbook, or one over maxRows', async () => {
    const csv = Buffer.from('code;nom\r\nG1;A', 'utf8');
    expect(looksLikeXlsx(csv)).toBe(false);
    await expect(readXlsx(csv)).rejects.toBeInstanceOf(SpreadsheetError);

    const buffer = await toXlsx(
      ['n'],
      Array.from({ length: 5 }, (_, i) => [i]),
    );
    await expect(readXlsx(buffer, { maxRows: 3 })).rejects.toThrow(
      /3 lignes au plus/,
    );
    expect(await readXlsx(buffer, { maxRows: 6 })).toHaveLength(6);
  });
});
