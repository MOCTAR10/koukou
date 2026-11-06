import { describe, expect, it } from 'vitest';
import {
  ImportJobStatus,
  ImportRowOutcome,
  ImportRowStatus,
} from '../../common/enums/import-job.enum.js';
import {
  canonicalJson,
  countRows,
  rowStatusOf,
  stepRefusal,
} from './import-job-rules.js';

describe('import job steps', () => {
  it('follows DEPOSE → … → INTEGRE', () => {
    expect(stepRefusal('SETTINGS', ImportJobStatus.ANALYSE)).toBeNull();
    expect(stepRefusal('DRY_RUN', ImportJobStatus.CONTROLE)).toBeNull();
    expect(stepRefusal('VALIDATE', ImportJobStatus.ESSAI)).toBeNull();
    expect(stepRefusal('INTEGRATE', ImportJobStatus.VALIDE)).toBeNull();
    expect(stepRefusal('REJECT', ImportJobStatus.VALIDE)).toBeNull();
  });

  it('refuses skipped or late steps with a French reason', () => {
    expect(stepRefusal('VALIDATE', ImportJobStatus.CONTROLE)).toMatch(
      /suit un essai à blanc/,
    );
    expect(stepRefusal('INTEGRATE', ImportJobStatus.ESSAI)).toMatch(
      /suit la validation/,
    );
    expect(stepRefusal('CORRECT', ImportJobStatus.VALIDE)).toMatch(
      /rejetez-le/,
    );
    expect(stepRefusal('REJECT', ImportJobStatus.INTEGRE)).toMatch(
      /ne peut plus être modifié/,
    );
    expect(stepRefusal('DRY_RUN', ImportJobStatus.ANALYSE)).toMatch(
      /correspondance des colonnes/,
    );
  });
});

describe('import counts', () => {
  const row = (
    status: ImportRowStatus,
    planned: ImportRowOutcome | null,
    extra: Partial<{
      excluded: boolean;
      corrections: unknown[];
      outcome: ImportRowOutcome;
    }> = {},
  ) => ({
    status,
    excluded: extra.excluded ?? false,
    corrections: extra.corrections ?? [],
    plannedOutcome: planned,
    dryRunOutcome: null,
    outcome: extra.outcome ?? null,
  });

  it('counts lines by status and by outcome of the phase', () => {
    const rows = [
      row(ImportRowStatus.VALIDE, ImportRowOutcome.INTEGREE, {
        outcome: ImportRowOutcome.REJETEE,
      }),
      row(ImportRowStatus.AVERTISSEMENT, ImportRowOutcome.ENRICHIE),
      row(ImportRowStatus.ERREUR, ImportRowOutcome.REJETEE, {
        corrections: [{}],
      }),
      row(ImportRowStatus.EXCLUE, ImportRowOutcome.EXCLUE, { excluded: true }),
    ];
    expect(countRows(rows, 'planned')).toEqual({
      read: 4,
      valid: 1,
      warnings: 1,
      errors: 1,
      excluded: 1,
      corrected: 1,
      integrated: 1,
      enriched: 1,
      alreadyPresent: 0,
      rejected: 1,
    });
    expect(countRows(rows, 'final')).toMatchObject({
      integrated: 0,
      rejected: 1,
    });
  });

  it('derives the line status from its findings', () => {
    expect(rowStatusOf(true, ['x'], [])).toBe(ImportRowStatus.EXCLUE);
    expect(rowStatusOf(false, ['x'], ['y'])).toBe(ImportRowStatus.ERREUR);
    expect(rowStatusOf(false, [], ['y'])).toBe(ImportRowStatus.AVERTISSEMENT);
    expect(rowStatusOf(false, [], [])).toBe(ImportRowStatus.VALIDE);
  });

  it('serializes canonically (key order does not matter)', () => {
    expect(canonicalJson({ b: 1, a: [{ d: 2, c: 3 }] })).toBe(
      canonicalJson({ a: [{ c: 3, d: 2 }], b: 1 }),
    );
  });
});
