import { BadRequestException, NotFoundException } from '@nestjs/common';
import { QueryFailedError } from 'typeorm';
import { asClientError } from './audit-exception.filter.js';

const pgError = (code: string) =>
  new QueryFailedError('SELECT 1', [], Object.assign(new Error('pg'), { code }));

describe('asClientError (malformed client values answer 400, not 500)', () => {
  it('maps an invalid uuid / date / number from Postgres to 400', () => {
    for (const code of ['22P02', '22007', '22008', '22003']) {
      expect(asClientError(pgError(code))).toBeInstanceOf(BadRequestException);
    }
  });

  it('maps an invalid Date (RangeError: Invalid time value) to 400', () => {
    let err: unknown;
    try {
      new Date('garbage').toISOString();
    } catch (e) {
      err = e;
    }
    expect(asClientError(err)).toBeInstanceOf(BadRequestException);
  });

  it('keeps other errors unchanged', () => {
    const unique = pgError('23505');
    expect(asClientError(unique)).toBe(unique);
    const nf = new NotFoundException();
    expect(asClientError(nf)).toBe(nf);
    const other = new RangeError('Maximum call stack size exceeded');
    expect(asClientError(other)).toBe(other);
  });
});
