import { describe, expect, it } from 'vitest';
import { CsvService } from './csv.service.js';

const csv = (rows: unknown[][]) =>
  new CsvService()
    .toCsv(['A'], rows)
    .toString('utf8')
    .slice(1)
    .split('\r\n')
    .slice(1);

describe('CsvService : injection de formules', () => {
  it('neutralise un texte commençant par = + - @', () => {
    expect(
      csv([['=HYPERLINK("x")'], ['+1+1'], ['@SUM(A1)'], ['-cmd']]),
    ).toEqual([`"'=HYPERLINK(""x"")"`, "'+1+1", "'@SUM(A1)", "'-cmd"]);
  });

  it('laisse les nombres négatifs intacts', () => {
    expect(csv([[-1500], ['-1500'], ['-12,5'], ['Provende']])).toEqual([
      '-1500',
      '-1500',
      '-12,5',
      'Provende',
    ]);
  });
});
