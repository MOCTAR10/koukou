import { describe, expect, it } from 'vitest';
import type { ChecklistLine, ConsentClause, FinancingRequirement, Instalment } from '../../api/types-financing';
import {
  addCategory,
  allClausesTicked,
  fcfaCompact,
  fileFilterParams,
  filesQuery,
  groupChecklist,
  groupRequirements,
  monthLabel,
  moveRequirement,
  nextInstalment,
  nextStep,
  pageRange,
  parseFileFilters,
  parsePct,
  passStepState,
  perimeterText,
  scheduleTotals,
  sortClassBuckets,
  stepperState,
  targetForDecision,
  templateError,
  termsPatch,
} from './financingLogic';

const req = (over: Partial<FinancingRequirement>): FinancingRequirement => ({
  id: 'r',
  code: 'C',
  label: 'Pièce',
  step: 'DEMANDE',
  required: true,
  legalBasis: null,
  help: null,
  active: true,
  sort: 1,
  ...over,
});
const line = (over: Partial<FinancingRequirement>, state: ChecklistLine['state'] = 'MANQUANTE', docs = 0): ChecklistLine => ({
  requirement: req(over),
  state,
  documents: Array.from({ length: docs }, (_, i) => ({ id: `d${i}` }) as never),
});

describe('stepper', () => {
  it('marks done, current and to-do steps', () => {
    expect(stepperState('DECISION').map((s) => s.state)).toEqual(['done', 'done', 'current', 'todo', 'todo', 'todo']);
    expect(nextStep('SUIVI')).toBe('CLOTURE');
    expect(nextStep('CLOTURE')).toBeNull();
  });
  it('pairs a decision with its step', () => {
    expect(targetForDecision('ACCORDE')).toBe('DECAISSEMENT');
    expect(targetForDecision('REFUSE')).toBe('CLOTURE');
    expect(targetForDecision('AJOURNE')).toBe('DECISION');
  });
  it('disables the pass while blockers remain, hides it without the right', () => {
    const rights = { read: true, create: true, edit: true, validate: true };
    expect(passStepState({ step: 'DEMANDE', blockers: ['Statuts'], rights })).toMatchObject({ available: true, enabled: false, blockers: ['Statuts'] });
    expect(passStepState({ step: 'DEMANDE', blockers: [], rights })).toMatchObject({ enabled: true, next: 'INSTRUCTION' });
    expect(passStepState({ step: 'DEMANDE', blockers: [], rights: { ...rights, validate: false } }).available).toBe(false);
    expect(passStepState({ step: 'CLOTURE', blockers: [], rights }).available).toBe(false);
    expect(passStepState({ step: 'DECISION', blockers: [], rights }).needsDecision).toBe(true);
  });
});

describe('checklist', () => {
  it('groups by step, ordered, hiding deactivated items without documents', () => {
    const groups = groupChecklist([
      line({ id: 'a', step: 'INSTRUCTION', sort: 2, label: 'B' }),
      line({ id: 'b', step: 'DEMANDE', sort: 2, label: 'Z' }, 'VALIDEE', 1),
      line({ id: 'c', step: 'DEMANDE', sort: 1, label: 'Y' }, 'DEPOSEE', 1),
      line({ id: 'd', step: 'DEMANDE', sort: 3, active: false }),
      line({ id: 'e', step: 'DECISION', active: false }, 'VALIDEE', 1),
    ]);
    expect(groups.map((g) => g.step)).toEqual(['DEMANDE', 'INSTRUCTION', 'DECISION']);
    expect(groups[0].lines.map((l) => l.requirement.id)).toEqual(['c', 'b']);
    expect(groups[0]).toMatchObject({ required: 2, provided: 2 });
  });
  it('groups the requirements and swaps with the neighbour', () => {
    const items = [req({ id: 'a', sort: 1 }), req({ id: 'b', sort: 2 }), req({ id: 'c', step: 'DECISION', sort: 1 })];
    const g = groupRequirements(items);
    expect(g.map((x) => x.step)).toEqual(['DEMANDE', 'DECISION']);
    expect(moveRequirement(g[0].items, 'a', 1)).toEqual([
      { id: 'a', sort: 2 },
      { id: 'b', sort: 1 },
    ]);
    expect(moveRequirement(g[0].items, 'a', -1)).toBeNull();
    // never ordered: equal sorts still swap
    const flat = [req({ id: 'a', sort: 0 }), req({ id: 'b', sort: 0 })];
    expect(moveRequirement(flat, 'b', -1)).toEqual([
      { id: 'b', sort: 0 },
      { id: 'a', sort: 1 },
    ]);
  });
});

describe('filters', () => {
  it('round-trips the URL and builds the server query', () => {
    const f = parseFileFilters(new URLSearchParams('etape=SUIVI&classe=IMPAYE&province=G1&q= Ngoma &page=3&dossier=x'));
    expect(f).toEqual({ step: 'SUIVI', claimClass: 'IMPAYE', province: 'G1', q: 'Ngoma', page: 3 });
    expect(filesQuery(f, 25)).toBe('?step=SUIVI&claimClass=IMPAYE&province=G1&q=Ngoma&page=3&pageSize=25');
    expect(fileFilterParams(f, new URLSearchParams('dossier=x')).get('dossier')).toBe('x');
    expect(fileFilterParams({ ...f, page: 1, q: '' }).toString()).not.toMatch(/page|q=/);
  });
  it('drops unknown values', () => {
    expect(parseFileFilters(new URLSearchParams('etape=ZZ&classe=NOPE&page=-2'))).toMatchObject({ step: '', claimClass: '', page: 1 });
  });
  it('writes the range', () => {
    expect(pageRange(2, 25, 112)).toBe('26–50 sur 112');
    expect(pageRange(1, 25, 0)).toBe('0 résultat');
  });
});

describe('numbers and labels', () => {
  it('compacts amounts in French', () => {
    expect(fcfaCompact(250_500_000)).toBe('250,5 M FCFA');
    expect(fcfaCompact(1_250_000_000)).toBe('1,25 Md FCFA');
    expect(fcfaCompact(null)).toBe('—');
    expect(fcfaCompact(900, false)).toBe('900');
  });
  it('labels months, with the year on January', () => {
    expect(monthLabel('2026-03')).toBe('mars');
    expect(monthLabel('2026-01')).toBe('janv. 26');
  });
  it('orders claim classes by severity', () => {
    expect(sortClassBuckets([{ key: 'IMPAYE' }, { key: 'SAIN' }, { key: 'X' }, { key: 'SOLDE' }]).map((b) => b.key)).toEqual(['SAIN', 'IMPAYE', 'SOLDE', 'X']);
  });
  it('parses a percent typed with a comma', () => {
    expect(parsePct('8,5')).toBe(8.5);
    expect(parsePct('')).toBeNull();
    expect(parsePct('120')).toBeUndefined();
  });
  it('explains each perimeter', () => {
    expect(perimeterText('CONSENTEMENT').meaning).toMatch(/retrait/);
    expect(perimeterText('PROGRAMME').title).toMatch(/programme/);
  });
});

describe('schedule', () => {
  const i = (over: Partial<Instalment>): Instalment => ({
    id: 'i',
    number: 1,
    dueDate: '2026-01-01',
    principalFcfa: 100,
    interestFcfa: 10,
    dueFcfa: 110,
    paidFcfa: 0,
    status: 'A_VENIR',
    daysLate: 0,
    ...over,
  });
  it('totals and finds the next instalment', () => {
    const rows = [
      i({ number: 1, dueDate: '2026-01-01', status: 'PAYEE', paidFcfa: 110 }),
      i({ number: 2, dueDate: '2026-02-01', status: 'EN_RETARD', paidFcfa: 10 }),
      i({ number: 3, dueDate: '2026-03-01' }),
    ];
    expect(scheduleTotals(rows)).toEqual({ principal: 300, interest: 30, due: 330, paid: 120, remaining: 210, late: 100 });
    expect(nextInstalment(rows)?.number).toBe(2);
    expect(nextInstalment([])).toBeNull();
  });
});

describe('consent template', () => {
  const clauses: ConsentClause[] = [
    { code: 'A', label: 'Finalité', legalBasis: 'art. 1' },
    { code: 'B', label: 'Durée', legalBasis: 'art. 2' },
  ];
  it('needs every mention ticked', () => {
    expect(allClausesTicked(clauses, ['A'])).toBe(false);
    expect(allClausesTicked(clauses, ['A', 'B'])).toBe(true);
    expect(allClausesTicked([], [])).toBe(false);
  });
  it('says what is missing, in order', () => {
    const d = { title: 'T', purpose: 'P', retention: 'R', dataCategories: ['x'], confirmedClauses: ['A', 'B'], hasFile: true };
    expect(templateError(d, clauses)).toBeNull();
    expect(templateError({ ...d, hasFile: false }, clauses)).toMatch(/PDF/);
    expect(templateError({ ...d, confirmedClauses: ['A'] }, clauses)).toMatch(/mentions/);
    expect(templateError({ ...d, dataCategories: [] }, clauses)).toMatch(/catégorie/);
  });
  it('adds a category once, ignoring case and spacing', () => {
    expect(addCategory(['Production'], ' production ')).toEqual(['Production']);
    expect(addCategory(['Production'], 'Ventes  et   achats')).toEqual(['Production', 'Ventes et achats']);
    expect(addCategory([], '  ')).toEqual([]);
  });
});

describe('termsPatch', () => {
  it('keeps only what changed, empty text clears', () => {
    const file = { purpose: 'A', grantedFcfa: 100, ratePct: null, guarantees: 'G' } as never;
    expect(termsPatch(file, { purpose: 'A', grantedFcfa: 200, ratePct: null, guarantees: '' })).toEqual({ grantedFcfa: 200, guarantees: null });
  });
});
