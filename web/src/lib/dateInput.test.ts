import { describe, expect, it } from 'vitest';
import { checkTypedDate } from './dateInput';

describe('checkTypedDate', () => {
  it('treats blank text as empty', () => {
    expect(checkTypedDate('  ').status).toBe('empty');
  });

  it('accepts a complete valid date and returns the ISO form', () => {
    expect(checkTypedDate('06/11/2026')).toMatchObject({ status: 'ok', iso: '2026-11-06' });
  });

  it('flags an unfinished date without emitting an ISO value', () => {
    expect(checkTypedDate('06/11')).toMatchObject({ status: 'incomplete', iso: '' });
    expect(checkTypedDate('06/11/20')).toMatchObject({ status: 'incomplete', iso: '' });
  });

  it('flags an impossible date', () => {
    expect(checkTypedDate('31/02/2026')).toMatchObject({ status: 'invalid', iso: '' });
  });

  it('applies min and max', () => {
    expect(checkTypedDate('01/11/2026', '2026-11-05', '2026-11-30').status).toBe('out');
    expect(checkTypedDate('01/12/2026', '2026-11-05', '2026-11-30').status).toBe('out');
    expect(checkTypedDate('05/11/2026', '2026-11-05', '2026-11-30').status).toBe('ok');
    expect(checkTypedDate('30/11/2026', '2026-11-05', '2026-11-30').status).toBe('ok');
  });
});
