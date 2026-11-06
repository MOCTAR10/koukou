import { describe, expect, it } from 'vitest';
import type { ReferenceConstant } from '../../api/types';
import { groupOf, groupThresholds, mayEditThreshold, ownerOf, parseThreshold, thresholdValueError } from './thresholds';

const row = (over: Partial<ReferenceConstant>): ReferenceConstant => ({ key: 'k', value: 1, description: null, isEditable: true, ...over });

const rights = (over: Partial<{ write: boolean; profileCode: string | null; anyOwner: boolean }>) => ({
  view: true,
  write: true,
  profileCode: null,
  anyOwner: false,
  ...over,
});

describe('conduct thresholds (F8)', () => {
  it('groups by owner when the server gives no group', () => {
    expect(groupOf(row({ ownerProfile: 'VETERINAIRE' }))).toBe('SANITAIRE');
    expect(groupOf(row({ ownerProfile: 'DGE' }))).toBe('CONDUITE');
    expect(groupOf(row({ group: 'SANITAIRE', ownerProfile: 'DGE' }))).toBe('SANITAIRE');
    expect(ownerOf(row({}))).toBe('DGE');
  });

  it('lets only the owner profile, or the platform admin, edit an editable threshold', () => {
    const vide = row({ key: 'vide_sanitaire_min_days', ownerProfile: 'VETERINAIRE' });
    const marge = row({ key: 'rentabilite_marge_min_pct', ownerProfile: 'DGE' });
    expect(mayEditThreshold(rights({ profileCode: 'VETERINAIRE' }), vide)).toBe(true);
    expect(mayEditThreshold(rights({ profileCode: 'VETERINAIRE' }), marge)).toBe(false);
    expect(mayEditThreshold(rights({ profileCode: 'DGE' }), marge)).toBe(true);
    expect(mayEditThreshold(rights({ profileCode: 'DGE', write: false }), marge)).toBe(false);
    expect(mayEditThreshold(rights({ anyOwner: true }), vide)).toBe(true);
    expect(mayEditThreshold(rights({ anyOwner: true }), { ...vide, isEditable: false })).toBe(false);
  });

  it('sorts sanitary first, then by key, with a search', () => {
    const rows = [
      row({ key: 'feed_stock_warn_days', ownerProfile: 'DGE', description: 'Autonomie provende' }),
      row({ key: 'vide_sanitaire_min_days', ownerProfile: 'VETERINAIRE' }),
      row({ key: 'calendar_lead_days', ownerProfile: 'VETERINAIRE' }),
    ];
    const groups = groupThresholds(rows);
    expect(groups.map((g) => g.group)).toEqual(['SANITAIRE', 'CONDUITE']);
    expect(groups[0]!.rows.map((r) => r.key)).toEqual(['calendar_lead_days', 'vide_sanitaire_min_days']);
    expect(groupThresholds(rows, 'autonomie').map((g) => g.rows.length)).toEqual([1]);
  });

  it('checks the typed value', () => {
    expect(thresholdValueError('')).toMatch(/Indiquez/);
    expect(thresholdValueError('abc')).toMatch(/nombre/);
    expect(thresholdValueError('-2')).toMatch(/négative/);
    expect(thresholdValueError('12,5')).toBeNull();
    expect(parseThreshold('12,5')).toBe(12.5);
  });
});
