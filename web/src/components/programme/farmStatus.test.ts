import { describe, expect, it } from 'vitest';
import { buildStatusPayload, currentFamily, needsReason, statusChoices } from './farmStatus';

const items = [
  { code: 'EN_PREPARATION', label: 'En préparation', family: 'PREPARATION', active: true },
  { code: 'OPERATIONNELLE', label: 'Opérationnelle', family: 'OPERATIONNELLE', active: true },
  { code: 'SUSPENDUE', label: 'Suspendue', family: 'SUSPENDUE', active: true },
  { code: 'ANCIEN', label: 'Ancien statut', family: 'OPERATIONNELLE', active: false },
];
const today = '2026-11-06';

describe('statusChoices', () => {
  it('never suspends a farm still in preparation', () => {
    expect(statusChoices(items, 'EN_PREPARATION').map((i) => i.code)).toEqual(['OPERATIONNELLE']);
    // No status yet counts as preparation: it may get its first one, not a suspension.
    expect(statusChoices(items, null).map((i) => i.code)).toEqual(['EN_PREPARATION', 'OPERATIONNELLE']);
  });

  it('offers the other active statuses otherwise', () => {
    expect(statusChoices(items, 'OPERATIONNELLE').map((i) => i.code)).toEqual(['EN_PREPARATION', 'SUSPENDUE']);
    expect(statusChoices(items, 'SUSPENDUE').map((i) => i.code)).toEqual(['EN_PREPARATION', 'OPERATIONNELLE']);
  });

  it('reads an unknown current code as preparation', () => {
    expect(currentFamily(items, 'INCONNU')).toBe('PREPARATION');
  });
});

describe('needsReason', () => {
  it('is required for the suspended family only', () => {
    expect(needsReason(items[2])).toBe(true);
    expect(needsReason(items[1])).toBe(false);
    expect(needsReason(null)).toBe(false);
  });
});

describe('buildStatusPayload', () => {
  const ctx = { items, statusCode: 'OPERATIONNELLE', statusSince: '2026-10-01T08:00:00.000Z', today };

  it('sends a suspension with its reason and lets the server date "now"', () => {
    expect(buildStatusPayload({ statusCode: 'SUSPENDUE', from: today, reason: '  Contrôle sanitaire ' }, ctx)).toEqual({
      body: { statusCode: 'SUSPENDUE', reason: 'Contrôle sanitaire' },
    });
    expect(buildStatusPayload({ statusCode: 'EN_PREPARATION', from: '', reason: '' }, ctx)).toEqual({
      body: { statusCode: 'EN_PREPARATION' },
    });
  });

  it('keeps a past effective date', () => {
    expect(buildStatusPayload({ statusCode: 'SUSPENDUE', from: '2026-11-02', reason: 'Visite' }, ctx)).toEqual({
      body: { statusCode: 'SUSPENDUE', from: '2026-11-02', reason: 'Visite' },
    });
  });

  it('refuses a suspension without a reason', () => {
    expect(buildStatusPayload({ statusCode: 'SUSPENDUE', from: '', reason: '   ' }, ctx)).toEqual({
      error: 'Le motif est obligatoire pour suspendre une ferme.',
    });
  });

  it('refuses a future date or one before the current status', () => {
    expect(buildStatusPayload({ statusCode: 'SUSPENDUE', from: '2026-11-07', reason: 'x' }, ctx)).toEqual({
      error: 'La date d’effet ne peut pas être future.',
    });
    expect(buildStatusPayload({ statusCode: 'SUSPENDUE', from: '2026-09-30', reason: 'x' }, ctx)).toEqual({
      error: 'La date d’effet précède celle du statut en cours (2026-10-01).',
    });
  });

  it('refuses the current status, an inactive one and a suspension from preparation', () => {
    expect(buildStatusPayload({ statusCode: '', from: '', reason: '' }, ctx)).toEqual({ error: 'Choisissez le nouveau statut.' });
    expect('error' in buildStatusPayload({ statusCode: 'OPERATIONNELLE', from: '', reason: '' }, ctx)).toBe(true);
    expect('error' in buildStatusPayload({ statusCode: 'ANCIEN', from: '', reason: '' }, ctx)).toBe(true);
    expect(
      buildStatusPayload({ statusCode: 'SUSPENDUE', from: '', reason: 'x' }, { ...ctx, statusCode: 'EN_PREPARATION' }),
    ).toEqual({ error: 'Une ferme en préparation ne peut pas être suspendue.' });
  });

  it('caps the reason like the server', () => {
    expect(buildStatusPayload({ statusCode: 'SUSPENDUE', from: '', reason: 'a'.repeat(501) }, ctx)).toEqual({
      error: 'Le motif ne doit pas dépasser 500 caractères.',
    });
  });
});
