import { describe, expect, it } from 'vitest';
import { CsvService } from '../../common/services/csv.service.js';
import { CsvTableSerializer, ExportWriter } from './export-table.js';
import {
  inputGapFigures,
  NoInputReconciliationSource,
  stockGapPct,
} from './input-reconciliation.js';

describe('input reconciliation seam', () => {
  it('measures the stock gap against the declared stock', () => {
    expect(stockGapPct(100, 90)).toBe(10);
    expect(stockGapPct(100, 115)).toBe(15);
    expect(stockGapPct(100, null)).toBeNull();
    expect(stockGapPct(0, 0)).toBe(0);
    expect(stockGapPct(0, 5)).toBe(100);
  });

  it('counts deliveries and stock lines over the threshold', () => {
    const f = inputGapFigures(
      [
        {
          farmId: 'a',
          deliveries: { pending: 1, confirmed: 3, cancelled: 0, withGap: 1 },
          inputs: [
            {
              inputCode: 'ALIMENT',
              pending: 0,
              shipped: 10,
              received: 10,
              used: 5,
              declarativeStock: 5,
              physicalStock: 4,
            },
            {
              inputCode: 'VACCIN',
              pending: 0,
              shipped: 1,
              received: 1,
              used: 0,
              declarativeStock: 1,
              physicalStock: null,
            },
          ],
        },
        {
          farmId: 'b',
          deliveries: { pending: 0, confirmed: 2, cancelled: 1, withGap: 0 },
          inputs: [
            {
              inputCode: 'ALIMENT',
              pending: 0,
              shipped: 10,
              received: 10,
              used: 0,
              declarativeStock: 10,
              physicalStock: 10,
            },
          ],
        },
      ],
      10,
    );
    expect(f).toEqual({
      farms: 2,
      deliveries: { pending: 1, confirmed: 5, cancelled: 1, withGap: 1 },
      stockLinesCounted: 2,
      stockLinesOverThreshold: 1,
      farmsWithStockGap: 1,
    });
  });

  it('has no data by default', async () => {
    const source = new NoInputReconciliationSource();
    expect(source.available).toBe(false);
    expect(await source.farmSummaries()).toEqual([]);
  });
});

describe('export writer', () => {
  const writer = new ExportWriter([new CsvTableSerializer(new CsvService())]);
  const table = {
    baseName: 'pilotage-test',
    sheetName: 'Test',
    columns: [
      ['code', 'Code'],
      ['value', 'Valeur'],
    ] as const,
    rows: [
      { code: 'G1', value: 12.5 },
      { code: '=SUM(A1)', value: null },
    ],
  };

  it('writes the table as CSV through the shared service', async () => {
    const file = await writer.write(table, 'csv');
    expect(file.filename).toBe('pilotage-test.csv');
    expect(file.contentType).toContain('text/csv');
    const text = file.buffer.toString('utf8').replace('﻿', '');
    expect(text.split('\r\n')).toEqual([
      'Code;Valeur',
      'G1;12.5',
      "'=SUM(A1);",
    ]);
  });

  it('refuses an unknown format in French', async () => {
    await expect(writer.write(table, 'xlsx')).rejects.toThrow(
      /Format d’export inconnu/,
    );
  });
});
