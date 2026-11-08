import { Lock } from 'lucide-react';
import { isFermiaGrantableDomain, type AccessCatalog, type ScopeKind } from '../../api/types-access';
import { classNames } from '../../lib/format';
import { actionLockReason, cellKey, domainLockReason, setDomain, toggleCell, type MatrixCells } from './matrix';

/**
 * Domains × actions grid of an access profile (labels from the server's
 * catalogue). A computer gets a table; a phone, one block per domain with its
 * actions as chips. Rows the scope kind can't hold are locked (the journal
 * belongs to an AUDIT scope profile only). The Fermia modules (cash, Market,
 * accounting, HR) come last under their own heading, « Consulter » only.
 */
export function MatrixEditor({
  catalog,
  cells,
  scopeKind,
  readOnly = false,
  onChange,
}: {
  catalog: AccessCatalog;
  cells: MatrixCells;
  scopeKind: ScopeKind;
  readOnly?: boolean;
  onChange: (cells: Set<string>) => void;
}) {
  // Static class (Tailwind scans the source): the catalogue has five actions.
  const cols = 'md:grid-cols-[minmax(11rem,1fr)_repeat(5,minmax(5.5rem,auto))]';
  return (
    <div className="rounded-xl border border-slate-200" role="group" aria-label="Matrice des droits">
      <div className={classNames('hidden border-b border-slate-200 bg-slate-50 px-3 py-2 md:grid', cols)}>
        <span className="text-xs font-semibold uppercase tracking-wide text-slate-500">Domaine</span>
        {catalog.actions.map((a) => (
          <span key={a.code} className="text-center text-xs font-semibold uppercase tracking-wide text-slate-500">
            {a.label}
          </span>
        ))}
      </div>
      {catalog.domains.map((d, index) => {
        const lock = domainLockReason(d.code, scopeKind);
        // POUFA lot A droits: a Fermia domain opens in consultation only.
        const fermia = d.fermia ?? isFermiaGrantableDomain(d.code);
        const cellLock = (action: (typeof catalog.actions)[number]['code']) =>
          d.actions ? (d.actions.includes(action) ? null : 'Module Fermia : consultation seule pour un profil institutionnel.') : actionLockReason(d.code, action);
        const open = catalog.actions.filter((a) => !cellLock(a.code));
        const rowCells = open.filter((a) => cells.has(cellKey(d.code, a.code)));
        const full = rowCells.length === open.length;
        const prev = catalog.domains[index - 1];
        const firstFermia = fermia && !(prev && (prev.fermia ?? isFermiaGrantableDomain(prev.code)));
        return (
          <div key={d.code} className="contents">
          {firstFermia ? (
            <div className="border-b border-slate-200 bg-amber-50/60 px-3 py-2 text-xs font-semibold uppercase tracking-wide text-amber-800">
              Modules Fermia (consultation seule)
              <span className="mt-0.5 block text-xs font-normal normal-case tracking-normal text-amber-700">
                Ventes et caisse, Market, comptabilité, équipe et salaires des fermes du périmètre. Chaque consultation est journalisée.
              </span>
            </div>
          ) : null}
          <div
            className={classNames(
              'border-b border-slate-100 px-3 py-2.5 last:border-b-0 md:grid md:items-center',
              cols,
              lock ? 'bg-slate-50/70' : 'hover:bg-slate-50/60',
            )}
          >
            <div className="mb-2 flex items-center gap-2 md:mb-0">
              <span className={classNames('min-w-0 text-sm font-medium', lock ? 'text-slate-500' : 'text-slate-800')}>
                {d.label}
                {lock ? (
                  <span className="mt-0.5 flex items-center gap-1 text-xs font-normal text-slate-500">
                    <Lock className="h-3 w-3 shrink-0" /> {lock}
                  </span>
                ) : null}
              </span>
              {!lock && !readOnly ? (
                <button
                  type="button"
                  className="ml-auto shrink-0 rounded px-1.5 py-0.5 text-xs font-medium text-brand-700 hover:bg-brand-50 md:ml-1"
                  onClick={() => onChange(setDomain(cells, d.code, !full))}
                  aria-label={`${full ? 'Retirer' : 'Accorder'} toutes les actions : ${d.label}`}
                >
                  {full ? 'Aucune' : 'Toutes'}
                </button>
              ) : null}
            </div>
            <div className="flex flex-wrap gap-1.5 md:contents">
              {catalog.actions.map((a) => {
                const locked = lock ?? cellLock(a.code);
                const on = !locked && cells.has(cellKey(d.code, a.code));
                return (
                  <label
                    key={a.code}
                    className={classNames(
                      'flex items-center gap-1.5 rounded-lg border px-2 py-1 text-xs md:justify-center md:border-0 md:px-0 md:py-0',
                      on ? 'border-brand-300 bg-brand-50 text-brand-800 md:bg-transparent' : 'border-slate-200 text-slate-600',
                      locked || readOnly ? 'cursor-not-allowed opacity-60' : 'cursor-pointer',
                    )}
                  >
                    <input
                      type="checkbox"
                      className="h-4 w-4 shrink-0 accent-brand-600"
                      checked={on}
                      disabled={!!locked || readOnly}
                      title={locked ?? undefined}
                      onChange={() => onChange(toggleCell(cells, d.code, a.code))}
                      aria-label={`${d.label} : ${a.label}`}
                    />
                    <span className="md:sr-only">{a.label}</span>
                  </label>
                );
              })}
            </div>
          </div>
          </div>
        );
      })}
    </div>
  );
}
