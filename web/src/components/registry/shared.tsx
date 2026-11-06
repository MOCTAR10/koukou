import { AlertTriangle, EyeOff, ShieldAlert } from 'lucide-react';
import type { DuplicateCandidate, HiddenDuplicate, RegistryStatus } from '../../api/types-programme';
import type { Tone } from '../flock/shared';
import { StatusBadge } from '../ui';
import { Button } from '../form';
import { PREPARATION_FAMILY, SUSPENDED_FAMILY } from '../programme/farmStatus';
import { candidateProvince, candidateTitle, reasonsLabel, scoreLabel, type DuplicateConflict } from './duplicates';

export function statusTone(status: Pick<RegistryStatus, 'family'> | null | undefined, active = true): Tone {
  if (!active || status?.family === SUSPENDED_FAMILY) return 'red';
  if (!status || status.family === PREPARATION_FAMILY) return 'amber';
  return 'emerald';
}

export function RegistryStatusPill({ status, active = true }: { status: RegistryStatus | null; active?: boolean }) {
  const tone = statusTone(status, active);
  return <StatusBadge tone={tone === 'red' ? 'danger' : tone === 'amber' ? 'warning' : 'ok'} label={status?.label ?? 'Sans statut'} />;
}

/** Probable duplicates of a 409, with the confirmation when the caller may give it. */
export function DuplicateNotice({
  conflict,
  busy,
  onConfirm,
  confirmLabel,
}: {
  conflict: DuplicateConflict;
  busy: boolean;
  onConfirm: () => void;
  confirmLabel: string;
}) {
  const all: Array<DuplicateCandidate | HiddenDuplicate> = [...conflict.visible, ...conflict.hidden];
  return (
    <div className="space-y-3 rounded-xl bg-amber-50 p-4 text-sm text-amber-900 ring-1 ring-amber-200">
      <p className="flex items-start gap-2 font-semibold">
        <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" />
        {all.length > 1 ? `${all.length} fermes ressemblent à cette fiche` : 'Une ferme ressemble à cette fiche'}
      </p>
      <ul className="space-y-2">
        {all.map((d, i) => (
          <li key={'code' in d && d.code ? d.code : `h${i}`} className="rounded-lg bg-white/70 px-3 py-2 ring-1 ring-amber-200">
            <div className="flex flex-wrap items-baseline justify-between gap-2">
              <span className="flex items-center gap-1.5 font-medium text-slate-900">
                {'hidden' in d ? <EyeOff className="h-3.5 w-3.5 text-slate-400" /> : null}
                {candidateTitle(d)}
              </span>
              <span className="text-xs font-semibold tabular-nums text-amber-800">Ressemblance {scoreLabel(d.score)}</span>
            </div>
            <p className="mt-0.5 text-xs text-slate-600">
              {[candidateProvince(d) ? `Province : ${candidateProvince(d)}` : null, reasonsLabel(d.reasons)].filter(Boolean).join(' · ')}
            </p>
          </li>
        ))}
      </ul>
      {conflict.canConfirm ? (
        <>
          <p className="text-xs">
            Vérifiez qu’il ne s’agit pas de la même exploitation. Si ce sont bien deux fermes distinctes, enregistrez quand même :
            la confirmation est conservée sur la fiche.
          </p>
          <div className="flex justify-end">
            <Button tone="danger" busy={busy} onClick={onConfirm}>
              {confirmLabel}
            </Button>
          </div>
        </>
      ) : (
        <p className="flex items-start gap-2 text-xs">
          <ShieldAlert className="mt-0.5 h-4 w-4 shrink-0" />
          Une ferme hors de votre périmètre ressemble à cette fiche : seul un administrateur national du programme peut confirmer
          l’enregistrement. Transmettez-lui la fiche.
        </p>
      )}
    </div>
  );
}
