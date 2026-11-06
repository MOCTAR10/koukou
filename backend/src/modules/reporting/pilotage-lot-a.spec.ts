import { describe, expect, it } from 'vitest';
import { AccessScopeKind } from '../../common/enums/access-scope-kind.enum.js';
import {
  NotificationAudience,
  NotificationChannel,
  NotificationEvent,
} from '../../common/enums/notification.enum.js';
import {
  ReportLevel,
  ReportPeriodicity,
  ReportSection,
} from '../../common/enums/report.enum.js';
import { isPeriodIndicator } from '../indicators/formula/formula-catalog.js';
import {
  evaluateOfficialIndicators,
  formulasInForce,
  type FormulaVersionSource,
} from '../indicators/official-indicators.js';
import { DEFAULT_NOTIFICATION_RULES } from '../notify/data/default-rules.js';
import { ruleProblem } from '../notify/notify-rules.js';
import {
  checkConductAlertKinds,
  checkEligibleBandTypes,
  checkParameterValue,
  parameterDefinition,
} from '../programme/parameter-catalog.js';
import { comparisonValues } from './band-comparison.service.js';
import {
  DEFAULT_REPORT_TEMPLATES,
  SECTIONS_BY_LEVEL,
  checkTemplate,
  matrixReadsRun,
} from './data/default-report-templates.js';
import { inputPeriodTotals } from './input-reconciliation.js';
import { emptyFacts, metricsOf } from './pilotage-metrics.js';
import {
  bandMortalityPct,
  conductAlertKinds,
  eligibleBandKeys,
  eligibleBandSql,
  isEligibleBand,
  mortalityOf,
  periodMortalityPct,
  pilotageRulesAt,
  type ParameterValueSource,
} from './pilotage-programme.js';
import { inputsRows, type InputsSection } from './report-pdf.js';

/** Parameters as stored: `key → value` (no version: catalog defaults). */
function source(values: Record<string, unknown> = {}): ParameterValueSource {
  const version: FormulaVersionSource['version'] = (key) =>
    key in values
      ? { id: `v-${key}`, value: values[key], validFrom: new Date(0) }
      : null;
  return {
    version,
    value: <T>(key: string) =>
      (key in values
        ? values[key]
        : parameterDefinition(key)!.defaultValue) as T,
  };
}

const defaults = formulasInForce(source(), new Date());

describe('POUFA lot A — programme perimeter (F2)', () => {
  it('counts broiler chicken by default', () => {
    expect(eligibleBandKeys(parameterDefinition('BANDE_TYPES_ELIGIBLES')!.defaultValue)).toEqual(['POULET:CHAIR']);
    expect(isEligibleBand({ species: 'POULET', type: 'CHAIR' }, ['POULET:CHAIR'])).toBe(true);
    expect(isEligibleBand({ species: 'POULET', type: 'PONDEUSE' }, ['POULET:CHAIR'])).toBe(false);
    expect(isEligibleBand({ species: 'CANARD', type: 'CHAIR' }, ['POULET:CHAIR'])).toBe(false);
  });

  it('falls back on the default when a stored value is malformed', () => {
    expect(eligibleBandKeys('nope')).toEqual(['POULET:CHAIR']);
    expect(
      eligibleBandKeys([
        { species: 'POULET', type: 'CHAIR' },
        { species: 'PINTADE', type: 'CHAIR' },
      ]),
    ).toEqual(['POULET:CHAIR', 'PINTADE:CHAIR']);
  });

  it('checks the parameter value (French errors)', () => {
    expect(checkEligibleBandTypes([{ species: 'POULET', type: 'CHAIR' }])).toBeNull();
    expect(checkEligibleBandTypes([])).toMatch(/Types de bandes éligibles/);
    expect(checkEligibleBandTypes([{ species: 'LAPIN', type: 'CHAIR' }])).toMatch(/Espèce inconnue/);
    expect(checkEligibleBandTypes([{ species: 'POULET', type: 'X' }])).toMatch(/Type de bande inconnu/);
    expect(
      checkEligibleBandTypes([
        { species: 'POULET', type: 'CHAIR' },
        { species: 'POULET', type: 'CHAIR' },
      ]),
    ).toMatch(/en double/);
    const def = parameterDefinition('BANDE_TYPES_ELIGIBLES')!;
    expect(def.ownerProfile).toBe('DGE');
    expect(checkParameterValue(def, [{ species: 'POULET', type: 'Z' }]).ok).toBe(false);
    expect(checkParameterValue(def, [{ species: 'POULET', type: 'CHAIR' }]).ok).toBe(true);
  });

  it('builds the SQL condition on a band alias', () => {
    expect(eligibleBandSql('b', '$3')).toBe(
      "(b.species::text || ':' || b.type::text) = ANY($3::text[])",
    );
  });
});

describe('POUFA lot A — conduct alerts (F1)', () => {
  it('default list holds no sanitary or economic kind', () => {
    const kinds = conductAlertKinds(parameterDefinition('PILOTAGE_ALERTES_CONDUITE_TYPES')!.defaultValue);
    for (const k of ['MALADIE', 'MORTALITE', 'PROPHYLAXIE', 'DELAI_ATTENTE', 'RENTABILITE']) {
      expect(kinds).not.toContain(k);
    }
    expect(kinds).toContain('EAU');
  });

  it('refuses a sanitary kind in the list, accepts an empty list', () => {
    expect(checkConductAlertKinds(['EAU', 'MALADIE'])).toMatch(/pas des alertes de conduite/);
    expect(checkConductAlertKinds(['INCONNU'])).toMatch(/inconnu/);
    expect(checkConductAlertKinds(['EAU', 'EAU'])).toMatch(/double/);
    expect(checkConductAlertKinds([])).toBeNull();
    expect(conductAlertKinds([])).toEqual([]);
    // Even a malformed list never lets a sanitary kind through.
    expect(conductAlertKinds(['MORTALITE'])).not.toContain('MORTALITE');
  });
});

describe('POUFA lot A — formulas on the aggregates (n° 44)', () => {
  it('period mortality goes through FORMULE_MORTALITE_PERIODE_PCT', () => {
    expect(periodMortalityPct(defaults, 23, 1600)).toBe(1.4);
    expect(periodMortalityPct(defaults, 1, 0)).toBeNull();
    const custom = formulasInForce(
      source({ FORMULE_MORTALITE_PERIODE_PCT: 'morts_periode / effectif_expose * 1000' }),
      new Date(),
    );
    expect(periodMortalityPct(custom, 23, 1600)).toBe(14.4);
    // metricsOf takes the formula, sums before dividing.
    const f = { ...emptyFacts(), exposed: 1000, deaths: 19 };
    expect(metricsOf(f, mortalityOf(custom)).mortalityPct).toBe(19);
    expect(metricsOf(f).mortalityPct).toBe(1.9);
  });

  it('band mortality goes through FORMULE_TAUX_MORTALITE', () => {
    expect(bandMortalityPct(defaults, 15, 1000)).toBe(1.5);
    const custom = formulasInForce(
      source({ FORMULE_TAUX_MORTALITE: 'morts_cumules / mis_en_place * 50' }),
      new Date(),
    );
    expect(bandMortalityPct(custom, 15, 1000)).toBe(0.8);
  });

  it('keeps the period formula out of a band’s own indicators', () => {
    expect(isPeriodIndicator('mortalite_periode_pct')).toBe(true);
    expect(isPeriodIndicator('taux_mortalite')).toBe(false);
    const ind = evaluateOfficialIndicators(defaults, { morts_periode: 1, effectif_expose: 10 });
    expect(ind.find((i) => i.key === 'mortalite_periode_pct')?.value).toBe(10);
  });

  it('comparison values use the official IC, GMQ and mortality', () => {
    const row = {
      quantity_at_start: 1000,
      deaths_cumulative: 15,
      w0: 40,
      a0: 0,
      lw_age: 7,
      last_weight_g: 300,
      present: 985,
      removals_cumulative: 0,
      feed_cumulative_kg: 350,
    };
    const v = comparisonValues(defaults, row);
    expect(v.mortalityPct).toBe(1.5);
    // (300 − 40) / 7
    expect(v.gmqG).toBeCloseTo(37.142857, 5);
    // 350 / (985 × 0.3 − 1000 × 0.04) = 350 / 255.5
    expect(v.fcr).toBeCloseTo(1.369863, 5);
    const custom = formulasInForce(
      source({ FORMULE_GMQ_G_J: 'poids_moyen_g / jours_elevage' }),
      new Date(),
    );
    expect(comparisonValues(custom, row).gmqG).toBeCloseTo(300 / 7, 5);
    // No weighing that week: no IC nor GMQ, the mortality stays.
    const unweighed = comparisonValues(defaults, { ...row, lw_age: null, last_weight_g: null });
    expect(unweighed).toMatchObject({ fcr: null, gmqG: null, mortalityPct: 1.5 });
  });

  it('reads every rule at the end of the given day', () => {
    const rules = pilotageRulesAt(source(), '2026-01-31');
    expect(rules.eligibleBandKeys).toEqual(['POULET:CHAIR']);
    expect(rules.conductAlertKinds.length).toBeGreaterThan(0);
    expect(rules.formulas.some((f) => f.key === 'mortalite_periode_pct')).toBe(true);
  });
});

describe('POUFA lot A — reports sent (n° 40)', () => {
  it('weekly report also reaches the ALL scope; both periodic ones list inputs', () => {
    const weekly = DEFAULT_REPORT_TEMPLATES.find((t) => t.code === 'HEBDOMADAIRE')!;
    expect(weekly.audience.scopeKinds).toEqual(expect.arrayContaining([AccessScopeKind.PROVINCES, AccessScopeKind.ALL]));
    expect(weekly.sections).toContain(ReportSection.INTRANTS);
    const monthly = DEFAULT_REPORT_TEMPLATES.find((t) => t.code === 'MENSUEL_NATIONAL')!;
    expect(monthly.sections).toContain(ReportSection.INTRANTS);
    expect(SECTIONS_BY_LEVEL[ReportLevel.BANDE]).not.toContain(ReportSection.INTRANTS);
    expect(
      checkTemplate({
        level: ReportLevel.NATIONAL,
        periodicity: ReportPeriodicity.MENSUEL,
        sections: [ReportSection.INTRANTS],
        audience: { scopeKinds: [], profileCodes: [], farmOwners: false },
      }),
    ).toEqual({ ok: true });
  });

  it('a technical agent reads end-of-band runs through TECHNIQUE:CONSULTER', () => {
    const agent = { TECHNIQUE: ['CONSULTER', 'VALIDER'] } as never;
    expect(matrixReadsRun(agent, ReportLevel.BANDE)).toBe(true);
    expect(matrixReadsRun(agent, ReportLevel.PROVINCE)).toBe(false);
    const dge = { PILOTAGE: ['CONSULTER'] } as never;
    expect(matrixReadsRun(dge, ReportLevel.NATIONAL)).toBe(true);
    expect(matrixReadsRun({} as never, ReportLevel.BANDE)).toBe(false);
  });

  it('seeds the REPORT_READY rule (in-app + push) and keeps its audience for reports', () => {
    const rule = DEFAULT_NOTIFICATION_RULES.find((r) => r.code === 'RAPPORT_DISPONIBLE')!;
    expect(rule).toMatchObject({
      event: NotificationEvent.REPORT_READY,
      audience: NotificationAudience.REPORT_RECIPIENTS,
    });
    expect(rule.channels).toEqual([NotificationChannel.IN_APP, NotificationChannel.PUSH]);
    const shape = {
      event: NotificationEvent.WEIGHING_LATE,
      audience: NotificationAudience.REPORT_RECIPIENTS,
      profileCode: null,
      channels: [NotificationChannel.IN_APP],
      escalateAfterMin: null,
    };
    expect(ruleProblem(shape, false)).toMatch(/rapport disponible/);
    expect(ruleProblem({ ...shape, event: NotificationEvent.REPORT_READY }, false)).toBeNull();
    expect(
      ruleProblem({ ...shape, event: NotificationEvent.REPORT_READY, audience: NotificationAudience.PROFILE, profileCode: 'DGE' }, false),
    ).toBeNull();
  });

  it('lays out « Intrants et ressources », small groups hidden', () => {
    const line = {
      inputCode: 'ALIMENT_DEMARRAGE',
      inputLabel: 'Aliment démarrage',
      unitCode: 'SAC_50',
      unitLabel: 'sac',
      deliveries: 2,
      farms: 2,
      shipped: 100,
      received: 95,
      pending: 0,
      valueFcfa: 1_500_000,
      subsidyFcfa: 750_000,
      linesWithGap: 1,
      suppressed: false,
    };
    const input: InputsSection = {
      available: true,
      thresholdPct: 10,
      lines: [line, { ...line, inputCode: 'X', inputLabel: 'Vaccin', valueFcfa: 10, subsidyFcfa: null, suppressed: true }],
      gaps: {
        farms: 2,
        deliveries: { pending: 1, confirmed: 2, cancelled: 0, withGap: 1 },
        stockLinesCounted: 3,
        stockLinesOverThreshold: 1,
        farmsWithStockGap: 1,
      },
      gapsSuppressed: false,
    };
    const t = inputsRows(input);
    expect(t.columns).toContain('Subvention (FCFA)');
    expect(t.rows[0]).toEqual(['Aliment démarrage', '2', '100,0 sac', '95,0 sac', '0,0 sac', '1 500 000', '750 000', '1']);
    expect(t.rows[1][1]).toBe('masqué');
    // The total skips the hidden line.
    expect(t.rows[2]).toEqual(['Total', '', '', '', '', '1 500 000', '750 000', '1']);
    expect(t.rows[3][0]).toMatch(/écart > 10,0 %/);
    expect(inputsRows({ ...input, available: false }).rows[0][0]).toMatch(/non branché/);
    expect(inputPeriodTotals([])).toEqual({ valueFcfa: null, subsidyFcfa: null, linesWithGap: 0 });
  });
});
