import { describe, expect, it } from 'vitest';

import type { RefItem } from '@/api/poufa';
import {
  MAX_CLINICAL_SIGNS,
  clinicalSignOptions,
  knownSigns,
  photoMimeType,
  photoRefusal,
  photoSlotsLeft,
  signLabels,
  toggleSign,
  withDeclarationFields,
} from './declaration';

const item = (code: string, label: string, sort: number, active = true): RefItem => ({
  id: code,
  listType: 'SIGNE_CLINIQUE',
  code,
  label,
  family: null,
  meta: null,
  sort,
  active,
});

const base = { kind: 'MALADIE' as const, occurredAt: '2026-11-06', severity: 'ROUGE' as const, title: 'Toux' };

describe('signes cliniques', () => {
  it('options actives triées par ordre puis libellé', () => {
    const list = [item('B', 'Diarrhée', 2), item('A', 'Toux', 1), item('C', 'Boiterie', 2), item('D', 'Ancien', 0, false)];
    expect(clinicalSignOptions(list).map((i) => i.code)).toEqual(['A', 'C', 'B']);
  });

  it('toggle ajoute, retire, sans doublon et sans dépasser le plafond', () => {
    expect(toggleSign([], 'A')).toEqual(['A']);
    expect(toggleSign(['A', 'B'], 'A')).toEqual(['B']);
    const full = Array.from({ length: MAX_CLINICAL_SIGNS }, (_, i) => `S${i}`);
    expect(toggleSign(full, 'X')).toHaveLength(MAX_CLINICAL_SIGNS);
  });

  it('ne garde que les codes encore proposés, dédoublonnés', () => {
    expect(knownSigns(['A', 'Z', 'A'], [item('A', 'Toux', 1)])).toEqual(['A']);
  });

  it('libellés, code inconnu affiché tel quel', () => {
    expect(signLabels(['A', 'Z'], [item('A', 'Toux', 1)])).toEqual(['Toux', 'Z']);
  });
});

describe('withDeclarationFields', () => {
  it('ajoute signes et suspicion seulement quand utiles', () => {
    expect(withDeclarationFields(base, { clinicalSigns: [], suspicion: false })).toEqual(base);
    expect(withDeclarationFields(base, { clinicalSigns: ['A', 'A', 'B'], suspicion: true })).toEqual({
      ...base,
      clinicalSigns: ['A', 'B'],
      suspicion: true,
    });
  });
});

describe('photos', () => {
  it('places restantes', () => {
    expect(photoSlotsLeft(0)).toBe(5);
    expect(photoSlotsLeft(7)).toBe(0);
  });

  it('type MIME déclaré ou déduit de l’extension', () => {
    expect(photoMimeType({ uri: 'file:///a.JPG' })).toBe('image/jpeg');
    expect(photoMimeType({ uri: 'file:///a', mimeType: 'image/webp' })).toBe('image/webp');
    expect(photoMimeType({ uri: 'file:///a.heic' })).toBeNull();
  });

  it('refuse un format ou un poids que le serveur refuserait', () => {
    expect(photoRefusal({ uri: 'file:///a.heic' })).toMatch(/Format/);
    expect(photoRefusal({ uri: 'file:///a.jpg', fileSize: 6 * 1024 * 1024 })).toMatch(/5 Mo/);
    expect(photoRefusal({ uri: 'file:///a.png', fileSize: 1000 })).toBeNull();
  });
});
