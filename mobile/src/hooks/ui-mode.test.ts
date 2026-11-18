import { describe, expect, it } from 'vitest';

import type { FarmMemberProfile } from '@/api/types';
import { resolveUiMode } from './ui-mode';

const link = (over: Partial<FarmMemberProfile> = {}) => ({ role: 'PROPRIETAIRE' as FarmMemberProfile['role'], active: true, ...over });

describe('resolveUiMode', () => {
  it('follows the server value when present', () => {
    expect(resolveUiMode({ profile: link({ uiMode: 'SIMPLE' }), userRole: 'PROPRIETAIRE' }).simple).toBe(true);
    expect(resolveUiMode({ profile: link({ role: 'ELEVEUR', uiMode: 'COMPLET' }), userRole: 'ELEVEUR' }).simple).toBe(false);
  });

  it('falls back to simple for the ground éleveur until the server sends a mode', () => {
    expect(resolveUiMode({ profile: link({ role: 'ELEVEUR' }), userRole: 'PROPRIETAIRE' }).mode).toBe('SIMPLE');
    expect(resolveUiMode({ profile: undefined, userRole: 'ELEVEUR' }).mode).toBe('SIMPLE');
  });

  it('stays complete for an owner, admin or institution without a mode', () => {
    expect(resolveUiMode({ profile: link(), userRole: 'PROPRIETAIRE' }).mode).toBe('COMPLET');
    expect(resolveUiMode({ profile: link({ role: 'ADMIN' }), userRole: 'PROPRIETAIRE' }).mode).toBe('COMPLET');
    expect(resolveUiMode({ profile: undefined, userRole: 'INSTITUTION' }).mode).toBe('COMPLET');
  });

  it('ignores an inactive éleveur link', () => {
    expect(resolveUiMode({ profile: link({ role: 'ELEVEUR', active: false }), userRole: 'PROPRIETAIRE' }).mode).toBe('COMPLET');
  });

  it('exposes the right to change its own mode only when the server says so', () => {
    expect(resolveUiMode({ profile: link({ canChangeOwnUiMode: true }), userRole: 'PROPRIETAIRE' }).canChangeOwn).toBe(true);
    expect(resolveUiMode({ profile: link(), userRole: 'PROPRIETAIRE' }).canChangeOwn).toBe(false);
  });
});
