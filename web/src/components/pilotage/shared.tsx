import type { ReactNode } from 'react';
import { EyeOff, Info } from 'lucide-react';
import type { PilotageScopeInfo } from '../../api/types-pilotage';
import { classNames, dateFr, dateTimeFr } from '../../lib/format';
import { suppressedLabel, type Shown } from './format';

const SCOPE_LABELS: Record<string, string> = {
  PLATEFORME: 'Administration de la plateforme : tout le programme',
  SYSTEME: 'Rapport automatique',
  ALL: 'Périmètre national',
  PROVINCES: 'Vos provinces',
  FARMS: 'Vos fermes',
  AGGREGATE: 'Données agrégées du programme',
  FINANCED: 'Fermes financées',
  OPERATOR: 'Opérateur',
  AUDIT: 'Audit',
};

/** Who the figures cover, and the suppression rule of an aggregate-only view (`scope.note`). */
export function ScopeBanner({ scope, period, generatedAt }: { scope: PilotageScopeInfo; period?: { from: string; to: string }; generatedAt?: string }) {
  return (
    <div className="space-y-2">
      <p className="text-xs text-slate-500">
        {SCOPE_LABELS[scope.kind] ?? scope.kind}
        {period ? ` · du ${dateFr(period.from)} au ${dateFr(period.to)}` : ''}
        {generatedAt ? ` · calculé le ${dateTimeFr(generatedAt)}` : ''}
      </p>
      {scope.note ? (
        <div className="flex items-start gap-2 rounded-lg bg-sky-50 px-3 py-2 text-sm text-sky-900 ring-1 ring-sky-200">
          <EyeOff className="mt-0.5 h-4 w-4 shrink-0" />
          <span>
            {scope.note} Les chiffres masqués portent la mention « {suppressedLabel(scope.minGroupSize)} ».
          </span>
        </div>
      ) : null}
    </div>
  );
}

/** A figure, or its « masqué » mention in muted italics. */
export function FigureText({ shown, className }: { shown: Shown; className?: string }) {
  return <span className={classNames(shown.suppressed ? 'text-xs font-normal italic text-slate-400' : undefined, className)}>{shown.text}</span>;
}

export function Suppressed({ k }: { k: number }) {
  return <span className="text-xs italic text-slate-400">{suppressedLabel(k)}</span>;
}

/** Methods served with the figures (`notes`, `method`). */
export function MethodNotes({ title = 'Méthode de calcul', notes }: { title?: string; notes: readonly string[] }) {
  if (notes.length === 0) return null;
  return (
    <details className="rounded-xl border border-slate-200 bg-white px-4 py-3 text-sm text-slate-600">
      <summary className="flex cursor-pointer items-center gap-2 font-medium text-slate-700">
        <Info className="h-4 w-4 text-slate-400" /> {title}
      </summary>
      <ul className="mt-2 list-disc space-y-1 pl-5">
        {notes.map((n) => (
          <li key={n}>{n}</li>
        ))}
      </ul>
    </details>
  );
}

/** A label / value line of a small figures card. */
export function FigureRow({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div className="flex items-baseline justify-between gap-3 border-b border-slate-100 py-1.5 text-sm last:border-0">
      <span className="text-slate-500">{label}</span>
      <span className="text-right font-medium tabular-nums text-slate-800">{children}</span>
    </div>
  );
}
