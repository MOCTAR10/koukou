import { describe, expect, it } from 'vitest';
import { ReportSection } from '../../common/enums/report.enum.js';
import type { BandeSnapshot } from '../bandes/entities/bande-snapshot.entity.js';
import { POUFA_DEFAULT_FORMULAS } from '../indicators/formula/formula-catalog.js';
import { bandReport } from './report-pdf.js';

// POUFA lot A2 droits (F6): the end-of-band report also goes to the agent
// technique, so it carries no revenue, cost nor margin.
describe('end-of-band report', () => {
  const snapshot = {
    version: 1,
    asOf: '2026-10-30',
    durationDays: 45,
    ageDays: 45,
    completenessPct: 100,
    variables: { mis_en_place: 100, ca_fcfa: 900000, charges_fcfa: 600000 },
    indicators: POUFA_DEFAULT_FORMULAS.map((f) => ({
      key: f.key,
      label: f.label,
      unit: f.unit,
      expression: f.expression,
      value: 12,
      parameterKey: `FORMULE_${f.key.toUpperCase()}`,
      parameterVersionId: null,
      validFrom: null,
    })),
    revenueFcfa: 900000,
    chargesFcfa: 600000,
    marginFcfa: 300000,
  } as unknown as BandeSnapshot;

  it('lists the technical indicators and points to the profitability for the money', () => {
    const data = bandReport({
      title: 'Bilan de fin de bande',
      heading: 'G1-0001 Ferme',
      periodLabel: 'Du 15/09/2026 au 30/10/2026',
      sections: [ReportSection.BILAN],
      bandCode: 'G1-0001-B01',
      snapshot,
      comparison: null,
      generatedAt: new Date('2026-10-31T08:00:00Z'),
    });
    const labels = data.sections[0].rows.map((r) => String(r[0]));
    expect(labels).toContain('Taux de mortalité');
    for (const key of ['marge_fcfa', 'taux_marge', 'cout_production_kg']) {
      const label = POUFA_DEFAULT_FORMULAS.find((f) => f.key === key)!.label;
      expect(labels).not.toContain(label);
    }
    expect(labels).toContain('Indicateurs économiques');
  });
});
