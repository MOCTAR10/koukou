import { describe, expect, it } from 'vitest';
import type { FarmerChecklistLine } from '../../api/types-financing';
import {
  acceptAttr,
  addMonthsIso,
  captureHint,
  configSummary,
  documentsSplit,
  expiryText,
  farmerAskText,
  farmerProgress,
  farmerRank,
  farmerRemainingText,
  farmerStateText,
  filterRequirements,
  formatsText,
  parseValidity,
  satisfiedWithoutDocument,
  sortFarmerChecklist,
  stepAskCounts,
  toFileTotal,
  type RequirementX,
} from './documentsLogic';

const line = (label: string, state: FarmerChecklistLine['state'], required = true, step: FarmerChecklistLine['step'] = 'DEMANDE'): FarmerChecklistLine => ({
  requirementId: label,
  label,
  step,
  required,
  help: null,
  formats: [],
  templateFileName: null,
  state,
  rejectReason: null,
  expiresOn: null,
  documents: [],
  canFile: state !== 'VALIDEE',
});

const req = (id: string, step: RequirementX['step'], providedBy: 'EXPLOITANT' | 'BCEG' | undefined, active = true): RequirementX => ({
  id,
  code: id,
  label: id,
  step,
  required: true,
  legalBasis: null,
  help: null,
  active,
  sort: 1,
  providedBy,
});

describe('farmer ordering', () => {
  it('refused, missing required, missing optional, expired, filed, validated', () => {
    const sorted = sortFarmerChecklist([
      line('v', 'VALIDEE'),
      line('d', 'DEPOSEE'),
      line('e', 'EXPIREE'),
      line('o', 'MANQUANTE', false),
      line('m', 'MANQUANTE'),
      line('r', 'REJETEE'),
    ]);
    expect(sorted.map((l) => l.label)).toEqual(['r', 'm', 'o', 'e', 'd', 'v']);
  });
  it('keeps step order then label inside a rank', () => {
    const sorted = sortFarmerChecklist([line('b', 'MANQUANTE', true, 'INSTRUCTION'), line('z', 'MANQUANTE', true, 'DEMANDE'), line('a', 'MANQUANTE', true, 'DEMANDE')]);
    expect(sorted.map((l) => l.label)).toEqual(['a', 'z', 'b']);
    expect(farmerRank(line('x', 'REJETEE'))).toBe(0);
  });
});

describe('farmer wording', () => {
  it('says each state in plain words', () => {
    expect(farmerStateText({ state: 'MANQUANTE', rejectReason: null, expiresOn: null })).toBe('À fournir');
    expect(farmerStateText({ state: 'DEPOSEE', rejectReason: null, expiresOn: null })).toBe('Envoyée, en attente de validation');
    expect(farmerStateText({ state: 'VALIDEE', rejectReason: null, expiresOn: null })).toBe('Validée');
    expect(farmerStateText({ state: 'REJETEE', rejectReason: 'Photo floue', expiresOn: null })).toBe('Refusée : Photo floue — envoyez-la de nouveau');
    expect(farmerStateText({ state: 'REJETEE', rejectReason: null, expiresOn: null })).toBe('Refusée — envoyez-la de nouveau');
    expect(farmerStateText({ state: 'EXPIREE', rejectReason: null, expiresOn: '2026-10-05' })).toMatch(/^Expirée le /);
  });
  it('counts the progress with a real French plural', () => {
    expect(farmerProgress([line('a', 'VALIDEE'), line('b', 'DEPOSEE'), line('c', 'DEPOSEE'), line('d', 'MANQUANTE')]).text).toBe('3 pièces sur 4 fournies');
    expect(farmerProgress([line('a', 'VALIDEE'), line('b', 'MANQUANTE')]).text).toBe('1 pièce sur 2 fournie');
    expect(farmerProgress([]).text).toBe('0 pièce sur 0 fournie');
  });
  it('tells what remains', () => {
    expect(farmerRemainingText(1, 4, 3)).toBe('Il reste 1 pièce obligatoire à envoyer.');
    expect(farmerRemainingText(3, 7, 3)).toBe('Il reste 3 pièces obligatoires à envoyer.');
    expect(farmerRemainingText(0, 4, 4)).toBe('Tout est envoyé. Merci.');
  });
  it('sums toFile across files for the menu badge', () => {
    expect(toFileTotal([{ toFile: 2 }, {}, { toFile: 1 }])).toBe(3);
    expect(toFileTotal([])).toBe(0);
  });
});

describe('formats', () => {
  it('maps formats to text, accept and capture', () => {
    expect(formatsText([])).toBe('PDF ou photo');
    expect(formatsText(['PDF'])).toBe('PDF');
    expect(formatsText(['IMAGE'])).toBe('Photo');
    expect(acceptAttr(['PDF'])).toBe('.pdf,application/pdf');
    expect(acceptAttr(['IMAGE'])).toContain('image/jpeg');
    expect(acceptAttr(undefined)).toContain('.pdf');
    expect(acceptAttr(undefined)).toContain('image/png');
    expect(captureHint(['IMAGE'])).toBe('environment');
    expect(captureHint(['PDF', 'IMAGE'])).toBeUndefined();
    expect(captureHint([])).toBeUndefined();
  });
});

describe('validity', () => {
  it('parses months, empty meaning no limit', () => {
    expect(parseValidity('')).toBeNull();
    expect(parseValidity(' 12 ')).toBe(12);
    expect(parseValidity('0')).toBeUndefined();
    expect(parseValidity('1,5')).toBeUndefined();
    expect(parseValidity('121')).toBeUndefined();
  });
  it('adds months with the end of month clamped', () => {
    expect(addMonthsIso('2026-01-31', 1)).toBe('2026-02-28');
    expect(addMonthsIso('2026-11-19', 12)).toBe('2027-11-19');
    expect(addMonthsIso('2026-11-19', 3)).toBe('2027-02-19');
  });
  it('words the expiry of a document', () => {
    expect(expiryText({ expiresOn: null, expired: false })).toBeNull();
    expect(expiryText({ expiresOn: '2027-03-12', expired: false })).toMatch(/^Valable jusqu’au /);
    expect(expiryText({ expiresOn: '2026-10-05', expired: true })).toMatch(/^Expiré le /);
  });
});

describe('framework', () => {
  const items = [req('a', 'DEMANDE', 'EXPLOITANT'), req('b', 'DEMANDE', 'BCEG'), req('c', 'DEMANDE', undefined), req('d', 'DECISION', 'EXPLOITANT', false)];
  it('filters by provider, an unset provider counting as the farmer', () => {
    expect(filterRequirements(items, 'ALL')).toHaveLength(4);
    expect(filterRequirements(items, 'BCEG').map((r) => r.id)).toEqual(['b']);
    expect(filterRequirements(items, 'EXPLOITANT').map((r) => r.id)).toEqual(['a', 'c', 'd']);
  });
  it('counts the pieces asked to the farmer per step, active only', () => {
    const counts = stepAskCounts(items);
    expect(counts.DEMANDE).toBe(2);
    expect(counts.DECISION).toBe(0);
    expect(farmerAskText(1)).toBe('1 pièce demandée à l’exploitant');
    expect(farmerAskText(3)).toBe('3 pièces demandées à l’exploitant');
  });
  it('summarises a row', () => {
    expect(configSummary({ ...req('a', 'DEMANDE', 'BCEG'), formats: ['PDF'], validityMonths: 12 })).toBe('Fournie par BCEG · PDF · valable 12 mois');
    expect(configSummary(req('a', 'DEMANDE', 'EXPLOITANT'))).toBe('Fournie par Exploitant · PDF ou photo · sans limite de validité');
  });
});

describe('consent line and portfolio split', () => {
  it('recognises a line satisfied without document', () => {
    expect(satisfiedWithoutDocument({ state: 'VALIDEE', documents: [] })).toBe(true);
    expect(satisfiedWithoutDocument({ state: 'MANQUANTE', documents: [] })).toBe(false);
  });
  it('splits expected pieces between the farmer and the BCEG', () => {
    expect(documentsSplit({ expected: 100, provided: 70, validated: 50 })).toEqual({ waitingFarmer: 30, toValidate: 20, validated: 50 });
    expect(documentsSplit({ expected: 5, provided: 6, validated: 7 })).toEqual({ waitingFarmer: 0, toValidate: 0, validated: 7 });
  });
});
