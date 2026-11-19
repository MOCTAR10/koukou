import { describe, expect, it } from 'vitest';
import { FinancingDocumentStatus, FinancingStep } from '../../common/enums/financing.enum.js';
import type { FinancingDocument } from './entities/financing-document.entity.js';
import type { FinancingRequirement } from './entities/financing-requirement.entity.js';
import { CONSENT_REQUIREMENT_CODE, blockersOf, isExpired, lineState } from './financing-view.service.js';

const ctx = { today: '2026-11-19', consentActive: false };
const doc = (status: FinancingDocumentStatus, expiresOn: string | null = null) => ({ status, expiresOn });

describe('états des pièces (péremption, consentement)', () => {
  it('une pièce périmée ne compte plus', () => {
    expect(isExpired({ expiresOn: '2026-11-18' }, ctx.today)).toBe(true);
    expect(isExpired({ expiresOn: '2026-11-19' }, ctx.today)).toBe(false);
    expect(isExpired({ expiresOn: null }, ctx.today)).toBe(false);
  });

  it('états : manquante, rejetée, déposée, validée, expirée', () => {
    const req = { code: 'X' };
    expect(lineState(req, [], ctx)).toBe('MANQUANTE');
    expect(lineState(req, [doc(FinancingDocumentStatus.REJETE)], ctx)).toBe('REJETEE');
    expect(lineState(req, [doc(FinancingDocumentStatus.DEPOSE)], ctx)).toBe('DEPOSEE');
    expect(lineState(req, [doc(FinancingDocumentStatus.VALIDE)], ctx)).toBe('VALIDEE');
    expect(lineState(req, [doc(FinancingDocumentStatus.VALIDE, '2026-01-01')], ctx)).toBe('EXPIREE');
    expect(
      lineState(req, [doc(FinancingDocumentStatus.VALIDE, '2026-01-01'), doc(FinancingDocumentStatus.DEPOSE, '2027-01-01')], ctx),
    ).toBe('DEPOSEE');
  });

  it('le consentement actif satisfait seul l’exigence de consentement', () => {
    const consent = { code: CONSENT_REQUIREMENT_CODE };
    expect(lineState(consent, [], ctx)).toBe('MANQUANTE');
    expect(lineState(consent, [], { ...ctx, consentActive: true })).toBe('VALIDEE');
    expect(lineState({ code: 'AUTRE' }, [], { ...ctx, consentActive: true })).toBe('MANQUANTE');
  });

  it('une pièce expirée bloque l’étape', () => {
    const reqs = [{ id: 'r1', code: 'A', label: 'Assurance', step: FinancingStep.DECAISSEMENT, required: true, active: true }] as FinancingRequirement[];
    const stale = [{ requirementId: 'r1', status: FinancingDocumentStatus.VALIDE, expiresOn: '2026-01-01' }] as FinancingDocument[];
    expect(blockersOf(FinancingStep.DECAISSEMENT, reqs, stale, ctx)).toEqual(['Assurance']);
    expect(blockersOf(FinancingStep.DECAISSEMENT, reqs, [{ ...stale[0], expiresOn: '2027-01-01' }] as FinancingDocument[], ctx)).toEqual([]);
  });
});
