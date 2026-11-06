import { useReducer, useState } from 'react';
import { AlertTriangle, Check, Copy, KeyRound } from 'lucide-react';
import { Button, Modal } from '../form';
import { dismissNeedsConfirm, formatLoginCode, NO_CODE, oneTimeCodeReducer, type OneTimeCodeAction, type OneTimeCodeState } from './oneTimeCode';

/** The one-time code state of a screen. */
export function useOneTimeCode(): [OneTimeCodeState, (a: OneTimeCodeAction) => void] {
  return useReducer(oneTimeCodeReducer, NO_CODE);
}

/**
 * Mutation options for a write whose answer carries a login code: the
 * mutation is dropped from the cache as soon as nothing observes it, so the
 * code lives only in the dialog's state. Call `reset()` in `onSuccess` once the
 * code is handed to `dispatch`.
 */
export const ONE_TIME_CODE_MUTATION = { gcTime: 0 } as const;

/**
 * The only dialog that shows a login code the server will never give again
 * (registry and institutional accounts): copy button, « J’ai noté le code »
 * box, and a confirmation before closing when neither was used.
 */
export function OneTimeCodeModal({
  state,
  dispatch,
  recoveryHint = 'En cas de perte, un nouveau code peut être généré : l’ancien cessera alors de fonctionner.',
}: {
  state: OneTimeCodeState;
  dispatch: (a: OneTimeCodeAction) => void;
  /** Where a lost code is replaced (« depuis la fiche de la ferme »…). */
  recoveryHint?: string;
}) {
  const [copyFailed, setCopyFailed] = useState(false);
  if (state.status !== 'shown') return null;

  const close = () => {
    if (dismissNeedsConfirm(state) && !window.confirm('Ce code ne sera plus jamais affiché. Fermer sans l’avoir copié ni noté ?')) return;
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
    <Modal title={state.title} onClose={close}>
      <div className="space-y-4">
        <p className="text-sm text-slate-600">
          Code de connexion de <span className="font-semibold text-slate-900">{state.holder.fullName}</span>, à utiliser avec le numéro{' '}
          <span className="whitespace-nowrap font-mono">{state.holder.phone}</span>
          {state.regenerated ? ' ; l’ancien code ne fonctionne plus.' : '.'}
        </p>
        <div className="flex items-center justify-between gap-3 rounded-xl bg-slate-900 px-4 py-4 text-white">
          <span className="flex min-w-0 items-center gap-2">
            <KeyRound className="h-5 w-5 shrink-0 text-emerald-300" />
            <span className="select-all break-all font-mono text-2xl font-bold tracking-widest" aria-label={`Code ${state.code.split('').join(' ')}`}>
              {formatLoginCode(state.code)}
            </span>
          </span>
          <Button tone="secondary" className="shrink-0" onClick={() => void copy()}>
            {state.copied ? <Check className="h-4 w-4 text-emerald-600" /> : <Copy className="h-4 w-4" />}
            {state.copied ? 'Copié' : 'Copier'}
          </Button>
        </div>
        {copyFailed ? <p className="text-xs text-red-600">La copie automatique n’est pas possible ici : sélectionnez le code et notez-le.</p> : null}
        <div className="flex items-start gap-2 rounded-lg bg-amber-50 px-3 py-2.5 text-sm text-amber-900 ring-1 ring-amber-200">
          <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" />
          <span>
            <b>Notez ce code maintenant : il ne sera plus jamais affiché.</b> Remettez-le à la personne en main propre ou par un canal sûr
            (jamais par un groupe de discussion) ; elle se connecte avec son téléphone et ce code. {recoveryHint}
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
