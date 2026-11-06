import { describe, expect, it } from 'vitest';
import type { ImportField, ImportJobStatus, ImportJobStep } from '../../api/types-admin';
import {
  canStep,
  checkRecoveryFile,
  correctionBody,
  correctionLines,
  depositFormData,
  duplicateTargets,
  fileSizeLabel,
  isFinal,
  mappingChanges,
  missingRequired,
  nextHint,
  reasonError,
  rowOutcome,
  rowsQueryString,
  stepAllowedFrom,
  stepperOf,
} from './recovery';

const job = (status: ImportJobStatus, over: Record<string, unknown> = {}) => ({
  status,
  controlledAt: null,
  dryRunAt: null,
  validatedAt: null,
  integratedAt: null,
  ...over,
});

describe('step machine (mirror of import-job-rules.ts)', () => {
  it('allows each step from the same statuses as the server', () => {
    const table: Array<[ImportJobStep, ImportJobStatus[]]> = [
      ['SETTINGS', ['DEPOSE', 'ANALYSE', 'CONTROLE', 'ESSAI']],
      ['CORRECT', ['CONTROLE', 'ESSAI']],
      ['DRY_RUN', ['CONTROLE', 'ESSAI']],
      ['VALIDATE', ['ESSAI']],
      ['INTEGRATE', ['VALIDE']],
      ['REJECT', ['DEPOSE', 'ANALYSE', 'CONTROLE', 'ESSAI', 'VALIDE']],
    ];
    const all: ImportJobStatus[] = ['DEPOSE', 'ANALYSE', 'CONTROLE', 'ESSAI', 'VALIDE', 'INTEGRE', 'REJETE'];
    for (const [step, ok] of table) for (const s of all) expect(stepAllowedFrom(step, s)).toBe(ok.includes(s));
    expect(isFinal('INTEGRE') && isFinal('REJETE') && !isFinal('VALIDE')).toBe(true);
  });

  it('follows the server’s allowedSteps first', () => {
    expect(canStep({ status: 'CONTROLE', allowedSteps: ['SETTINGS', 'CORRECT', 'REJECT'] }, 'DRY_RUN')).toBe(false);
    expect(canStep({ status: 'CONTROLE', allowedSteps: ['DRY_RUN'] }, 'DRY_RUN')).toBe(true);
  });

  it('draws the stepper', () => {
    expect(stepperOf(job('CONTROLE')).map((s) => s.state)).toEqual(['done', 'current', 'todo', 'todo', 'todo']);
    expect(stepperOf(job('DEPOSE')).map((s) => s.state)).toEqual(['current', 'todo', 'todo', 'todo', 'todo']);
    expect(stepperOf(job('INTEGRE')).map((s) => s.state)).toEqual(['done', 'done', 'done', 'done', 'done']);
    const rejected = stepperOf(job('REJETE', { controlledAt: 'x', dryRunAt: 'y' }));
    expect(rejected.map((s) => [s.status, s.state])).toEqual([
      ['ANALYSE', 'done'],
      ['CONTROLE', 'done'],
      ['ESSAI', 'done'],
      ['VALIDE', 'skipped'],
      ['INTEGRE', 'skipped'],
      ['REJETE', 'current'],
    ]);
  });

  it('says what comes next', () => {
    const counts = { errors: 2 } as never;
    expect(nextHint({ status: 'ANALYSE', mappingError: 'Colonne obligatoire absente : nom.', counts })).toMatch(/nom/);
    expect(nextHint({ status: 'CONTROLE', mappingError: null, counts })).toMatch(/2 ligne/);
  });
});

const fields: ImportField[] = [
  { key: 'name', header: 'nom', label: 'Nom', required: true },
  { key: 'province', header: 'province', label: 'Province', required: true },
  { key: 'phone', header: 'telephone', label: 'Téléphone', required: false },
];

describe('rows', () => {
  it('shows the outcome of the latest phase', () => {
    expect(rowOutcome({ outcome: null, dryRunOutcome: 'INTEGREE', plannedOutcome: 'REJETEE' })).toEqual({ outcome: 'INTEGREE', phase: 'dryRun' });
    expect(rowOutcome({ outcome: null, dryRunOutcome: null, plannedOutcome: null })).toEqual({ outcome: null, phase: null });
    expect(rowsQueryString({ status: 'ERREUR', outcome: '' }, 2)).toBe('?status=ERREUR&page=2&pageSize=50');
  });

  it('sends only the changed values, with a reason of 5 characters or more', () => {
    const row = { values: { name: 'Ferme A', province: 'G2' }, excluded: false };
    expect(correctionBody(row, { name: 'Ferme A', province: 'G1' }, false, 'Erreur de province')).toEqual({
      body: { values: { province: 'G1' }, reason: 'Erreur de province' },
    });
    expect(correctionBody(row, { phone: '', province: 'G2' }, false, 'Vide')).toEqual({ error: 'Le motif doit faire au moins 5 caractères.' });
    expect(correctionBody(row, { name: 'Ferme A' }, false, 'Aucune modif')).toEqual({ error: 'Aucune modification : les valeurs saisies sont celles de la ligne.' });
    expect(correctionBody(row, { name: '' }, true, 'Doublon connu')).toEqual({ body: { values: { name: null }, exclude: true, reason: 'Doublon connu' } });
    expect(reasonError('abcd', 'Le motif du rejet')).toBe('Le motif du rejet doit faire au moins 5 caractères.');
  });

  it('describes a correction', () => {
    expect(
      correctionLines({ at: '', byId: 'u', reason: 'r', changes: [{ field: 'province', before: 'G2', after: 'G1' }, { field: 'x', before: null, after: 'y' }], excluded: true }, fields),
    ).toEqual(['Province : G2 → G1', 'x : (vide) → y', 'Ligne exclue']);
  });
});

describe('mapping', () => {
  it('finds missing required fields and duplicates', () => {
    expect(missingRequired(fields, { Nom: 'name', Tel: 'phone' }).map((f) => f.key)).toEqual(['province']);
    expect(duplicateTargets({ A: 'name', B: 'name', C: null })).toEqual(['name']);
  });

  it('sends only the changed headers', () => {
    expect(mappingChanges({ A: 'name', B: null }, { A: 'name', B: 'province' })).toEqual({ B: 'province' });
    expect(mappingChanges({ A: 'name' }, { A: null })).toEqual({ A: null });
    expect(mappingChanges({ A: 'name' }, { A: 'name' })).toBeNull();
  });
});

describe('deposit', () => {
  it('checks the file like the server readers', () => {
    expect(checkRecoveryFile(null)).toMatch(/Choisissez/);
    expect(checkRecoveryFile({ name: 'a.xls', size: 10 })).toMatch(/xlsx/);
    expect(checkRecoveryFile({ name: 'a.pdf', size: 10 })).toMatch(/Format attendu/);
    expect(checkRecoveryFile({ name: 'a.CSV', size: 0 })).toBe('Fichier vide.');
    expect(checkRecoveryFile({ name: 'a.xlsx', size: 6 * 1024 * 1024 })).toMatch(/5 Mo/);
    expect(checkRecoveryFile({ name: 'bandes.xlsx', size: 1000 })).toBeNull();
  });

  it('builds the multipart body', () => {
    const form = depositFormData(new Blob(['a,b']), 'f.csv', { type: 'AMI', note: ' campagne 1 ', confirmDuplicate: true });
    expect(form.get('type')).toBe('AMI');
    expect(form.get('note')).toBe('campagne 1');
    expect(form.get('confirmDuplicate')).toBe('true');
    expect(form.get('file')).toBeInstanceOf(Blob);
    const bare = depositFormData(new Blob(['a']), 'f.csv', { type: 'BANDES_HISTORIQUES', note: '', confirmDuplicate: false });
    expect(bare.has('note') || bare.has('confirmDuplicate')).toBe(false);
    expect(fileSizeLabel(2048)).toBe('2 Ko');
    expect(fileSizeLabel(1.5 * 1024 * 1024)).toBe('1,5 Mo');
  });
});
