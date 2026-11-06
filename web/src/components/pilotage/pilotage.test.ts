import { describe, expect, it } from 'vitest';
import type { MyAccess } from '../../api/types-access';
import type { PilotageMap, ReportTemplate } from '../../api/types-pilotage';
import {
  defaultPeriod,
  exportFilename,
  exportKindsFor,
  exportPath,
  objectiveQueryString,
  parsePilotageParams,
  parseProvinceCodes,
  periodError,
  pilotageParamsOf,
  pilotageQueryString,
  type PilotageFilters,
} from './filters';
import {
  bytesLabel,
  headsLabel,
  hiddenWeeks,
  pctLabel,
  shownFigure,
  suppressedLabel,
  tonnesLabel,
  weekLabel,
  weightLabel,
} from './format';
import { clusterRadius, colourOf, legendFor, levelOn, parseColourKey } from './mapKeys';
import { canCorrectClosedBand, pilotageRights } from './pilotageAccess';
import {
  generateBody,
  generateFormError,
  namesFarms,
  parseProfileCodes,
  recipientsSummary,
  runsQueryString,
  templateForm,
  templateFormError,
  templatePatch,
} from './reports';

/** Spaces of `toLocaleString('fr-FR')` (narrow no-break) made plain, for readable expectations. */
const plain = (s: string) => s.replace(/[  ]/g, ' ');

const TODAY = '2026-11-06';
const p = (scopeKind: MyAccess['profile']['scopeKind'], matrix: MyAccess['profile']['matrix']) => ({ scopeKind, matrix });

describe('pilotageRights', () => {
  it('gives the platform admin everything', () => {
    expect(pilotageRights('PLATFORM_ADMIN')).toEqual({
      view: true,
      aggregateOnly: false,
      farmRows: true,
      editTemplates: true,
      generate: true,
      runs: true,
    });
  });

  it('reads the matrix of an institution', () => {
    const dge = pilotageRights('INSTITUTION', p('ALL', { PILOTAGE: ['CONSULTER'] }));
    expect(dge).toMatchObject({ view: true, aggregateOnly: false, farmRows: true, editTemplates: false, generate: false, runs: true });
    const maedr = pilotageRights('INSTITUTION', p('AGGREGATE', { PILOTAGE: ['CONSULTER', 'VALIDER'] }));
    expect(maedr).toMatchObject({ view: true, aggregateOnly: true, farmRows: false });
    const admin = pilotageRights('INSTITUTION', p('PROVINCES', { PILOTAGE: ['CONSULTER', 'CREER', 'ADMINISTRER'] }));
    expect(admin).toMatchObject({ view: true, editTemplates: true, generate: true });
  });

  it('refuses an institution without PILOTAGE, the audit scope and unreadable access', () => {
    expect(pilotageRights('INSTITUTION', p('FARMS', { TECHNIQUE: ['CONSULTER'] })).view).toBe(false);
    expect(pilotageRights('INSTITUTION', p('AUDIT', { PILOTAGE: ['CONSULTER'] })).view).toBe(false);
    expect(pilotageRights('INSTITUTION', null).runs).toBe(false);
  });

  it('lets a farm account read only its bands’ reports', () => {
    expect(pilotageRights('PROPRIETAIRE')).toMatchObject({ view: false, runs: true, generate: false });
    expect(pilotageRights('ELEVEUR').runs).toBe(true);
    expect(pilotageRights('ACHETEUR').runs).toBe(false);
  });
});

describe('canCorrectClosedBand', () => {
  it('needs the platform admin or TECHNIQUE + ADMINISTRER', () => {
    expect(canCorrectClosedBand('PLATFORM_ADMIN')).toBe(true);
    expect(canCorrectClosedBand('PROPRIETAIRE')).toBe(false);
    expect(canCorrectClosedBand('INSTITUTION', p('ALL', { TECHNIQUE: ['CONSULTER'] }))).toBe(false);
    expect(canCorrectClosedBand('INSTITUTION', p('PROVINCES', { TECHNIQUE: ['CONSULTER', 'ADMINISTRER'] }))).toBe(true);
    expect(canCorrectClosedBand('INSTITUTION', p('ALL', { ADMINISTRATION: ['ADMINISTRER'] }))).toBe(false);
  });
});

describe('filters ↔ URL', () => {
  it('defaults to the last 30 days, today included', () => {
    expect(defaultPeriod(TODAY)).toEqual({ from: '2026-10-08', to: TODAY });
    expect(parsePilotageParams(new URLSearchParams(''), TODAY)).toEqual({
      from: '2026-10-08',
      to: TODAY,
      provinces: [],
      cohort: '',
      status: '',
    });
  });

  it('reads the filters and drops malformed values', () => {
    const f = parsePilotageParams(new URLSearchParams('from=2026-01-01&to=2026-03-31&province=g1, G2,g1,bad code&cohort=COHORTE_1&status=x y'), TODAY);
    expect(f).toEqual({ from: '2026-01-01', to: '2026-03-31', provinces: ['G1', 'G2'], cohort: 'COHORTE_1', status: '' });
    expect(parsePilotageParams(new URLSearchParams('to=2026-02-10&from=nope'), TODAY).from).toBe('2026-01-12');
    expect(parseProvinceCodes('')).toEqual([]);
  });

  it('writes only what differs from the default and keeps other parameters', () => {
    const base = new URLSearchParams('key=alert&province=G9');
    const def = parsePilotageParams(new URLSearchParams(''), TODAY);
    expect(pilotageParamsOf(def, base, TODAY).toString()).toBe('key=alert');
    const f: PilotageFilters = { from: '2026-09-01', to: '2026-09-30', provinces: ['G1', 'G3'], cohort: 'C1', status: 'OPERATIONNELLE' };
    const out = pilotageParamsOf(f, base, TODAY);
    expect(parsePilotageParams(out, TODAY)).toEqual(f);
    expect(out.get('key')).toBe('alert');
  });

  it('checks the period like the server', () => {
    expect(periodError({ from: '2026-01-01', to: '2026-01-31' })).toBeNull();
    expect(periodError({ from: '2026-02-01', to: '2026-01-31' })).toMatch(/précéder/);
    expect(periodError({ from: '2020-01-01', to: '2026-01-31' })).toMatch(/trois ans/);
    expect(periodError({ from: '2026-13-01', to: '2026-01-31' })).toMatch(/début invalide/);
  });

  it('builds the API and export query strings', () => {
    const f: PilotageFilters = { from: '2026-10-01', to: '2026-10-31', provinces: ['G1', 'G2'], cohort: '', status: 'OPERATIONNELLE' };
    expect(pilotageQueryString(f)).toBe('?from=2026-10-01&to=2026-10-31&province=G1%2CG2&status=OPERATIONNELLE');
    expect(objectiveQueryString(f)).toBe('?province=G1%2CG2&status=OPERATIONNELLE');
    expect(objectiveQueryString({ ...f, provinces: [], status: '' })).toBe('');
    expect(exportPath('farms', 'xlsx', f)).toBe('/pilotage/exports/farms.xlsx?from=2026-10-01&to=2026-10-31&province=G1%2CG2&status=OPERATIONNELLE');
    expect(exportFilename('farms', 'csv', f)).toBe('pilotage-fermes-2026-10-01_2026-10-31.csv');
    expect(exportFilename('bandes', 'xlsx', f)).toBe('pilotage-bandes-2026-10-01_2026-10-31.xlsx');
  });

  it('never offers farm or band rows to an aggregate-only view', () => {
    expect(exportKindsFor(true)).toEqual(['provinces']);
    expect(exportKindsFor(false)).toEqual(['provinces', 'farms', 'bandes']);
  });
});

describe('number formatting', () => {
  it('formats tonnes, kg and heads', () => {
    expect(plain(tonnesLabel(1.23456))).toBe('1,235 t');
    expect(plain(tonnesLabel(12345.67))).toBe('12 345,7 t');
    expect(tonnesLabel(null)).toBe('—');
    expect(plain(weightLabel(850.25))).toBe('850,3 kg');
    expect(plain(weightLabel(2500))).toBe('2,5 t');
    expect(plain(weightLabel(125000))).toBe('125 t');
    expect(headsLabel(1)).toBe('1 tête');
    expect(plain(headsLabel(12500))).toBe('12 500 têtes');
    expect(pctLabel(4.25)).toBe('4,3 %');
    expect(pctLabel(undefined)).toBe('—');
    expect(bytesLabel(512)).toBe('512 o');
    expect(bytesLabel(20480)).toBe('20 Ko');
    expect(weekLabel('2026-11-02')).toBe('02/11');
  });
});

describe('suppressed figures', () => {
  const metrics = { headcount: 1200, mortalityPct: null as number | null };
  it('says why a hidden group shows nothing', () => {
    expect(shownFigure({ suppressed: true, metrics: null }, (m: typeof metrics) => m.headcount, headsLabel, 5)).toEqual({
      text: 'masqué, moins de 5 fermes',
      suppressed: true,
    });
    expect(suppressedLabel(3)).toBe('masqué, moins de 3 fermes');
  });

  it('shows a visible group, a dash for an empty value', () => {
    expect(plain(shownFigure({ suppressed: false, metrics }, (m) => m.headcount, headsLabel, 5).text)).toBe('1 200 têtes');
    expect(shownFigure({ suppressed: false, metrics }, (m) => m.mortalityPct, pctLabel, 5).text).toBe('—');
  });

  it('counts the hidden weeks', () => {
    expect(hiddenWeeks([{ suppressed: true }, { suppressed: false }, { suppressed: true }])).toBe(2);
  });
});

describe('map colour keys', () => {
  const legend: PilotageMap['legend'] = {
    mortality: { jaune: 5, rouge: 10, unit: '%', description: '' },
    completeness: { jaune: 80, rouge: 50, unit: '%', description: '' },
    alert: { description: '' },
  };

  it('builds each legend from the served thresholds', () => {
    expect(legendFor('mortality', legend).map((i) => i.label)).toEqual([
      'moins de 5 %',
      '5 % à moins de 10 %',
      '10 % ou plus',
      'pas de donnée sur la période',
    ]);
    expect(legendFor('completeness', legend).map((i) => [i.level, i.label])).toEqual([
      ['VERT', '80 % ou plus'],
      ['JAUNE', '50 % à moins de 80 %'],
      ['ROUGE', 'moins de 50 %'],
      ['NONE', 'pas de donnée sur la période'],
    ]);
    expect(legendFor('alert', legend)).toHaveLength(3);
  });

  it('colours a point on the chosen key, grey without data or when hidden', () => {
    const colours = { mortality: 'ROUGE' as const, completeness: null, alert: 'VERT' as const };
    expect(levelOn(colours, 'mortality')).toBe('ROUGE');
    expect(colourOf(levelOn(colours, 'completeness'))).toBe('#94a3b8');
    expect(colourOf(levelOn(null, 'alert'))).toBe('#94a3b8');
    expect(parseColourKey('alert')).toBe('alert');
    expect(parseColourKey('nope')).toBe('mortality');
    expect(clusterRadius(0)).toBe(12);
    expect(clusterRadius(10_000)).toBe(34);
  });
});

describe('report templates and runs', () => {
  const template: ReportTemplate = {
    id: 't1',
    code: 'HEBDOMADAIRE',
    label: 'Rapport hebdomadaire de la province',
    periodicity: 'HEBDOMADAIRE',
    level: 'PROVINCE',
    sections: [
      { code: 'SYNTHESE', label: 'Synthèse' },
      { code: 'FERMES_A_SUIVRE', label: 'Fermes à suivre' },
    ],
    audience: { scopeKinds: ['PROVINCES'], profileCodes: [], farmOwners: false },
    active: true,
    hasFarmRows: true,
    updatedAt: '2026-11-01T00:00:00Z',
  };

  it('sends only what changed', () => {
    const form = templateForm(template);
    expect(templatePatch(template, form)).toEqual({});
    const next = { ...form, periodicity: 'MENSUEL' as const, sections: ['FERMES_A_SUIVRE', 'SYNTHESE', 'ALERTES'] as typeof form.sections, profileCodes: 'dge, dge maedr', active: false };
    expect(templatePatch(template, next)).toEqual({
      periodicity: 'MENSUEL',
      sections: ['SYNTHESE', 'ALERTES', 'FERMES_A_SUIVRE'],
      audience: { profileCodes: ['DGE', 'MAEDR'] },
      active: false,
    });
  });

  it('checks the template like the server', () => {
    const form = templateForm(template);
    expect(templateFormError('PROVINCE', form)).toBeNull();
    expect(templateFormError('PROVINCE', { ...form, sections: [] })).toMatch(/au moins une section/);
    expect(templateFormError('PROVINCE', { ...form, sections: ['OBJECTIF'] })).toMatch(/Objectif national/);
    expect(templateFormError('BANDE', { ...form, periodicity: 'MENSUEL', sections: ['BILAN'] })).toMatch(/Périodicité/);
    expect(namesFarms('NATIONAL', ['SYNTHESE'])).toBe(false);
    expect(namesFarms('NATIONAL', ['FERMES_A_SUIVRE'])).toBe(true);
    expect(namesFarms('BANDE', ['BILAN'])).toBe(true);
    expect(parseProfileCodes(' a;b  a ')).toEqual(['A', 'B']);
  });

  it('builds the manual run payload', () => {
    expect(generateFormError('PROVINCE', { periodStart: '', provinceCode: '' })).toMatch(/province/);
    expect(generateFormError('BANDE', { periodStart: '', provinceCode: '' })).toMatch(/fiche de la bande/);
    expect(generateFormError('NATIONAL', { periodStart: '', provinceCode: '' })).toBeNull();
    expect(generateBody('NATIONAL', { periodStart: '', provinceCode: 'G1' })).toEqual({});
    expect(generateBody('PROVINCE', { periodStart: '2026-10-05', provinceCode: 'g1 ' })).toEqual({ periodStart: '2026-10-05', provinceCode: 'G1' });
  });

  it('summarises the runs', () => {
    expect(recipientsSummary({ recipients: [] })).toBe('Aucun destinataire');
    expect(
      recipientsSummary({
        recipients: [
          { userId: 'a', kind: 'MEMBER', profileCode: 'DGE' },
          { userId: 'b', kind: 'MEMBER', profileCode: 'DGE' },
          { userId: 'c', kind: 'OWNER', profileCode: null },
        ],
      }),
    ).toBe('2 comptes institutionnels · 1 exploitant');
    expect(runsQueryString({})).toBe('');
    expect(runsQueryString({ level: 'BANDE', from: '2026-01-01' })).toBe('?level=BANDE&from=2026-01-01');
  });
});
