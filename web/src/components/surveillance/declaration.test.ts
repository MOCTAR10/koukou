import { describe, expect, it } from 'vitest';
import { PHOTO_MAX_BYTES, photoProblem, signLabels, sizeFr, splitPhotos, toggleSign, withDeclaration } from './declaration';

const file = (name: string, size: number, type: string) => ({ name, size, type });

describe('photoProblem', () => {
  it('accepts PNG, JPEG and WEBP up to 5 MiB', () => {
    expect(photoProblem(file('a.png', 1000, 'image/png'), 0)).toBeNull();
    expect(photoProblem(file('a.jpg', PHOTO_MAX_BYTES, 'image/jpeg'), 4)).toBeNull();
    expect(photoProblem(file('a.webp', 10, ''), 0)).toBeNull();
  });

  it('refuses other formats, empty or too big files, and a sixth photo', () => {
    expect(photoProblem(file('a.gif', 10, 'image/gif'), 0)).toMatch(/PNG, JPEG ou WEBP/);
    expect(photoProblem(file('a.png', 0, 'image/png'), 0)).toMatch(/vide/);
    expect(photoProblem(file('a.png', PHOTO_MAX_BYTES + 1, 'image/png'), 0)).toMatch(/5 Mo/);
    expect(photoProblem(file('a.png', 10, 'image/png'), 5)).toMatch(/5 photos/);
  });

  it('splits a pick and counts the accepted ones against the cap', () => {
    const { accepted, refused } = splitPhotos([file('1.png', 1, 'image/png'), file('2.gif', 1, 'image/gif'), file('3.png', 1, 'image/png')], 4);
    expect(accepted.map((f) => f.name)).toEqual(['1.png']);
    expect(refused).toHaveLength(2);
    expect(refused[1]).toMatch(/^3\.png : 5 photos/);
  });

  it('prints sizes in French', () => {
    expect(sizeFr(1.25 * 1024 * 1024)).toBe('1,3 Mo');
    expect(sizeFr(350 * 1024)).toBe('350 Ko');
  });
});

describe('clinical signs', () => {
  const list = [{ code: 'TOUX' }, { code: 'DIARRHEE' }, { code: 'PARALYSIE' }];

  it('toggles in list order', () => {
    expect(toggleSign(['PARALYSIE'], 'TOUX', list)).toEqual(['TOUX', 'PARALYSIE']);
    expect(toggleSign(['TOUX', 'PARALYSIE'], 'TOUX', list)).toEqual(['PARALYSIE']);
  });

  it('shows labels, an unknown code as is', () => {
    expect(signLabels(['TOUX', 'OLD'], [{ code: 'TOUX', label: 'Toux' }])).toEqual(['Toux', 'OLD']);
    expect(signLabels(null, [])).toEqual([]);
  });
});

describe('withDeclaration', () => {
  it('adds the active signs, the suspicion and the idempotency key', () => {
    expect(
      withDeclaration({ kind: 'MALADIE' }, { clinicalSigns: ['TOUX', 'TOUX', 'OLD'], suspicion: true, idempotencyKey: 'k1', activeCodes: ['TOUX'] }),
    ).toEqual({ kind: 'MALADIE', clinicalSigns: ['TOUX'], suspicion: true, idempotencyKey: 'k1' });
  });

  it('leaves out empty signs and an unticked suspicion', () => {
    expect(withDeclaration({ kind: 'MORTALITE' }, { clinicalSigns: [], suspicion: false, idempotencyKey: 'k2' })).toEqual({
      kind: 'MORTALITE',
      idempotencyKey: 'k2',
    });
  });
});
