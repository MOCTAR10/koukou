import { RotateCcw } from 'lucide-react';
import { useInstitutionAccess } from '../../app/useInstitutionAccess';
import { classNames } from '../../lib/format';
import { Field, inputCls, DateInput } from '../form';
import { useFarmStatusItems } from '../programme/FarmStatusModal';
import { useProgrammeList, useProvinces } from '../registry/queries';
import { Card } from '../ui';
import { defaultPeriod, periodError, type PilotageFilters } from './filters';

/**
 * Period, provinces (several), cohort and status. A provincial profile only
 * gets its own provinces to pick (another one is a 403 on the server).
 * `withPeriod: false` for the objective, which counts since the programme start.
 */
export function PilotageFiltersBar({
  filters,
  onChange,
  withPeriod = true,
}: {
  filters: PilotageFilters;
  onChange: (next: PilotageFilters) => void;
  withPeriod?: boolean;
}) {
  const provinces = useProvinces();
  const cohorts = useProgrammeList('COHORTE');
  const statuses = useFarmStatusItems();
  const { access } = useInstitutionAccess();
  const own = access?.profile.scopeKind === 'PROVINCES' ? access.provinceCodes : null;
  const choices = (provinces.data ?? []).filter((p) => !own || own.includes(p.code));
  const error = withPeriod ? periodError(filters) : null;
  const toggle = (code: string) =>
    onChange({
      ...filters,
      provinces: filters.provinces.includes(code) ? filters.provinces.filter((c) => c !== code) : [...filters.provinces, code],
    });
  const def = defaultPeriod();
  const isDefault =
    filters.from === def.from && filters.to === def.to && filters.provinces.length === 0 && !filters.cohort && !filters.status;

  return (
    <Card className="space-y-3 p-4">
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        {withPeriod ? (
          <>
            <Field label="Du">
              <DateInput className={inputCls} value={filters.from} max={filters.to} onChange={(e) => e.target.value && onChange({ ...filters, from: e.target.value })} />
            </Field>
            <Field label="Au">
              <DateInput className={inputCls} value={filters.to} min={filters.from} onChange={(e) => e.target.value && onChange({ ...filters, to: e.target.value })} />
            </Field>
          </>
        ) : null}
        <Field label="Cohorte">
          <select className={inputCls} value={filters.cohort} onChange={(e) => onChange({ ...filters, cohort: e.target.value })}>
            <option value="">Toutes les cohortes</option>
            {(cohorts.data ?? []).map((c) => (
              <option key={c.code} value={c.code}>
                {c.label}
              </option>
            ))}
          </select>
        </Field>
        <Field label="Statut de la ferme">
          <select className={inputCls} value={filters.status} onChange={(e) => onChange({ ...filters, status: e.target.value })}>
            <option value="">Tous les statuts</option>
            {(statuses.data ?? []).map((s) => (
              <option key={s.code} value={s.code}>
                {s.label}
              </option>
            ))}
          </select>
        </Field>
      </div>
      <div className="flex flex-wrap items-center gap-1.5" role="group" aria-label="Provinces">
        <span className="mr-1 text-xs font-medium text-slate-600">Provinces :</span>
        <button
          type="button"
          aria-pressed={filters.provinces.length === 0}
          onClick={() => onChange({ ...filters, provinces: [] })}
          className={chipCls(filters.provinces.length === 0)}
        >
          {own ? 'Toutes mes provinces' : 'Toutes'}
        </button>
        {choices.map((p) => (
          <button key={p.code} type="button" aria-pressed={filters.provinces.includes(p.code)} onClick={() => toggle(p.code)} className={chipCls(filters.provinces.includes(p.code))} title={p.name}>
            {p.code} · {p.name}
          </button>
        ))}
        {!isDefault ? (
          <button
            type="button"
            onClick={() => onChange({ ...def, provinces: [], cohort: '', status: '' })}
            className="ml-auto inline-flex items-center gap-1 text-xs font-medium text-brand-700 hover:underline"
          >
            <RotateCcw className="h-3.5 w-3.5" /> Réinitialiser (30 derniers jours)
          </button>
        ) : null}
      </div>
      {error ? <p className="text-sm text-red-700">{error}</p> : null}
    </Card>
  );
}

function chipCls(on: boolean): string {
  return classNames(
    'rounded-full px-2.5 py-1 text-xs font-medium ring-1 transition',
    on ? 'bg-brand-600 text-white ring-brand-600' : 'bg-white text-slate-600 ring-slate-200 hover:bg-slate-50',
  );
}
