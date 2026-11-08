import { useQuery } from '@tanstack/react-query';
import { ChevronDown, ChevronUp, Lock, Scale } from 'lucide-react';
import { useState } from 'react';
import { api } from '../../api/client';
import type { ReferenceConstant } from '../../api/types';
import { num } from '../../lib/format';
import { ErrorNote } from '../form';
import { Card, IconTile, Loading } from '../ui';

/** Theme and unit of each seeded key. The wording itself comes from the server. */
const GROUPS: Array<{ label: string; units: Record<string, string> }> = [
  {
    label: 'Densité et bâtiments',
    units: {
      standard_module: 'sujets',
      density_warn_per_m2: 'oiseaux/m²',
      density_critical_per_m2: 'oiseaux/m²',
      building_density_warn_per_m2: 'oiseaux/m²',
      building_density_critical_per_m2: 'oiseaux/m²',
      age_gap_max_weeks: 'semaines',
    },
  },
  {
    label: 'Mortalité et performances',
    units: {
      mortality_warn_pct: '%',
      mortality_critical_pct: '%',
      mortality_dev_warn_pct: '%',
      mortality_dev_critical_pct: '%',
      mortality_expected_week1_pct: '%',
      mortality_expected_growth_week_pct: '% / semaine',
      mortality_expected_cap_pct: '%',
      ipe_deviation_warn_pct: '%',
      gmq_deviation_warn_pct: '%',
    },
  },
  {
    label: 'Eau',
    units: {
      water_drop_warn_pct: '%',
      water_drop_critical_pct: '%',
      water_window_days: 'jours',
      water_per_bird_l_day: 'L',
      water_norm_deviation_warn_pct: '%',
    },
  },
  {
    label: 'Aliment et provende',
    units: {
      default_sac_kg: 'kg',
      feed_drop_warn_pct: '%',
      feed_stock_warn_days: 'jours',
      feed_stock_critical_days: 'jours',
      feed_order_target_days: 'jours',
    },
  },
  {
    label: 'Sanitaire',
    units: {
      vide_sanitaire_min_days: 'jours',
      vide_sanitaire_max_days: 'jours',
      prophylaxie_retard_warn_days: 'jours',
      calendar_lead_days: 'jours',
    },
  },
  {
    label: 'Ventes et rentabilité',
    units: {
      rentabilite_marge_min_pct: '%',
      vente_invendu_days: 'jours',
      egg_stock_warn_alveoles: 'alvéoles',
      vente_age_min_days: 'jours',
      vente_fcr_dev_max_pct: '%',
      reforme_lay_rate_fall_pct: '%',
    },
  },
  {
    label: 'Segments clients',
    units: {
      customer_segment_top_min_visits: 'visites',
      customer_segment_top_min_fcfa: 'FCFA',
      customer_segment_regular_min_visits: 'visites',
    },
  },
];

const KNOWN_KEYS = new Set(GROUPS.flatMap((g) => Object.keys(g.units)));
/** One constant per customer type: the list follows the server. */
const isCreditLimit = (key: string) => key.startsWith('customer_credit_limit_');

export function ReferenceConstants() {
  const [open, setOpen] = useState(false);
  const constants = useQuery({
    queryKey: ['reference-constants'],
    queryFn: () => api.get<ReferenceConstant[]>('/reference-constants'),
  });
  const list = constants.data ?? [];

  const groups = [
    ...GROUPS.map((g) => ({ ...g, rows: list.filter((c) => c.key in g.units) })),
    {
      label: 'Plafonds de crédit clients',
      units: Object.fromEntries(list.filter((c) => isCreditLimit(c.key)).map((c) => [c.key, 'FCFA'])),
      rows: list.filter((c) => isCreditLimit(c.key)),
    },
    // A constant added on the server later must still show, without its raw key.
    {
      label: 'Autres repères',
      units: {} as Record<string, string>,
      rows: list.filter((c) => !KNOWN_KEYS.has(c.key) && !isCreditLimit(c.key)),
    },
  ].filter((g) => g.rows.length > 0);

  return (
    <Card className="overflow-hidden">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        aria-expanded={open}
        className="flex w-full items-center gap-3 px-4 py-3 text-left hover:bg-slate-50"
      >
        <IconTile icon={<Scale className="h-4 w-4" />} size="sm" />
        <span className="min-w-0 flex-1">
          <span className="block text-sm font-semibold text-slate-800">Seuils & repères</span>
          <span className="block text-xs text-slate-500">
            Seuils d’alertes, vide sanitaire et autonomie provende, en vigueur sur cette ferme.
          </span>
        </span>
        <span className="inline-flex items-center gap-1 whitespace-nowrap text-xs font-semibold text-brand-600">
          {open ? 'Réduire' : `Afficher les ${list.length}`}
          {open ? <ChevronUp className="h-4 w-4" /> : <ChevronDown className="h-4 w-4" />}
        </span>
      </button>

      {constants.isLoading ? (
        <div className="border-t border-slate-100 p-4">
          <Loading label="Lecture des constantes…" />
        </div>
      ) : null}
      {constants.error ? (
        <div className="border-t border-slate-100 p-4">
          <ErrorNote error={constants.error} />
        </div>
      ) : null}

      {open ? (
        <div className="gap-x-8 border-t border-slate-100 p-4 lg:columns-2">
          {groups.map((group) => (
            <div key={group.label} className="mb-5 break-inside-avoid">
              <h3 className="mb-1 text-xs font-semibold uppercase tracking-wide text-slate-500">{group.label}</h3>
              <ul className="divide-y divide-slate-100">
                {group.rows.map((c) => (
                  <li key={c.key} className="flex items-start justify-between gap-4 py-2 text-sm">
                    <span className="text-slate-600">{c.description ?? 'Seuil de référence'}</span>
                    <span className="whitespace-nowrap font-semibold tabular-nums text-brand-700">
                      {num(c.value, 2)} {c.value <= 1 && group.units[c.key] === 'jours' ? 'jour' : (group.units[c.key] ?? '')}
                    </span>
                  </li>
                ))}
              </ul>
            </div>
          ))}
        </div>
      ) : null}

      <p className="flex items-center gap-1.5 border-t border-slate-100 px-4 py-2 text-xs text-slate-500">
        <Lock className="h-3.5 w-3.5" /> Constantes globales, modifiables uniquement par la plateforme.
      </p>
    </Card>
  );
}
