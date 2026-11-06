import { useReducer, useState } from 'react';
import { AlertTriangle, Check, Copy, EyeOff, KeyRound, ShieldAlert } from 'lucide-react';
import type { DuplicateCandidate, HiddenDuplicate, RegistryStatus } from '../../api/types-programme';
import { Pill, type Tone } from '../flock/shared';
import { Button, Modal } from '../form';
import { PREPARATION_FAMILY, SUSPENDED_FAMILY } from '../programme/farmStatus';
import { candidateProvince, candidateTitle, reasonsLabel, scoreLabel, type DuplicateConflict } from './duplicates';
import { dismissNeedsConfirm, formatLoginCode, NO_CODE, oneTimeCodeReducer, type OneTimeCodeAction, type OneTimeCodeState } from './oneTimeCode';

export function statusTone(status: Pick<RegistryStatus, 'family'> | null | undefined, active = true): Tone {
  if (!active || status?.family === SUSPENDED_FAMILY) return 'red';
  if (!status || status.family === PREPARATION_FAMILY) return 'amber';
  return 'emerald';
}

export function RegistryStatusPill({ status, active = true }: { status: RegistryStatus | null; active?: boolean }) {
  return <Pill tone={statusTone(status, active)}>{status?.label ?? 'Sans statut'}</Pill>;
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

/** The one-time code state of a screen (activation, regeneration). */
export function useOneTimeCode(): [OneTimeCodeState, (a: OneTimeCodeAction) => void] {
  return useReducer(oneTimeCodeReducer, NO_CODE);
}

/**
 * Shows a login code the server will never give again: copy button, « noté »
 * box, and a confirmation before closing when neither was used.
 */
export function OneTimeCodeModal({ state, dispatch }: { state: OneTimeCodeState; dispatch: (a: OneTimeCodeAction) => void }) {
  const [copyFailed, setCopyFailed] = useState(false);
  if (state.status !== 'shown') return null;

  const close = () => {
    if (dismissNeedsConfirm(state) && !window.confirm('Ce code ne sera plus affiché. Fermer sans l’avoir noté ?')) return;
    setCopyFailed(false);
    dispatch({ type: 'dismiss' });
  };
  const copy = async () => {
    try {
      await navigator.clipboard.writeText(state.code);
      setCopyFailed(false);
      dispatch({ type: 'copied' });
    } catch {
      setCopyFailed(true);
    }
  };

  return (
    <Modal title={state.reason === 'activation' ? 'Compte de l’exploitant activé' : 'Nouveau code de connexion'} onClose={close}>
      <div className="space-y-4">
        <p className="text-sm text-slate-600">
          Code de connexion de <span className="font-semibold text-slate-900">{state.holder.fullName}</span> (téléphone{' '}
          <span className="font-mono">{state.holder.phone}</span>)
          {state.reason === 'regeneration' ? ' ; l’ancien code ne fonctionne plus.' : '.'}
        </p>
        <div className="flex items-center justify-between gap-3 rounded-xl bg-slate-900 px-4 py-4 text-white">
          <span className="flex items-center gap-2">
            <KeyRound className="h-5 w-5 text-emerald-300" />
            <span className="select-all font-mono text-2xl font-bold tracking-widest" aria-label={`Code ${state.code.split('').join(' ')}`}>
              {formatLoginCode(state.code)}
            </span>
          </span>
          <Button tone="secondary" onClick={() => void copy()}>
            {state.copied ? <Check className="h-4 w-4" /> : <Copy className="h-4 w-4" />}
            {state.copied ? 'Copié' : 'Copier'}
          </Button>
        </div>
        {copyFailed ? <p className="text-xs text-red-600">La copie a échoué : sélectionnez le code et notez-le.</p> : null}
        <div className="flex items-start gap-2 rounded-lg bg-amber-50 px-3 py-2 text-sm text-amber-900 ring-1 ring-amber-200">
          <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" />
          <span>
            <b>Notez ce code maintenant : il ne sera plus affiché.</b> Remettez-le à l’exploitant en main propre ; il se connecte avec son
            téléphone et ce code. En cas de perte, générez-en un nouveau depuis la fiche.
          </span>
        </div>
        <label className="flex items-center gap-2 text-sm text-slate-700">
          <input type="checkbox" checked={state.noted} onChange={(e) => dispatch({ type: 'noted', value: e.target.checked })} />
          J’ai noté le code
        </label>
        <div className="flex justify-end">
          <Button onClick={close}>Terminer</Button>
        </div>
      </div>
    </Modal>
  );
}
