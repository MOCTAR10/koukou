import { AlertTriangle, Check, Copy, KeyRound } from 'lucide-react';
import { useState } from 'react';
import { Button, Modal } from '../form';

/**
 * A login code the server returns once (account creation, regeneration).
 * Never stored by the app: once this dialog closes, nobody can read it again.
 */
export function LoginCodeModal({
  title = 'Code de connexion',
  fullName,
  phone,
  code,
  onClose,
}: {
  title?: string;
  fullName: string;
  phone: string;
  code: string;
  onClose: () => void;
}) {
  const [copied, setCopied] = useState(false);
  const [copyFailed, setCopyFailed] = useState(false);

  async function copy() {
    try {
      await navigator.clipboard.writeText(code);
      setCopied(true);
      setCopyFailed(false);
    } catch {
      setCopyFailed(true);
    }
  }

  // Closing loses the code for good: ask when it was not even copied.
  const close = () => {
    if (copied || window.confirm('Ce code ne sera plus jamais affiché. Fermer quand même ?')) onClose();
  };

  return (
    <Modal title={title} onClose={close}>
      <div className="space-y-4">
        <p className="text-sm text-slate-600">
          Code de connexion de <b className="text-slate-900">{fullName}</b>, à utiliser avec le numéro{' '}
          <b className="whitespace-nowrap text-slate-900">{phone}</b>.
        </p>
        <div className="flex items-center gap-3 rounded-xl bg-slate-900 px-4 py-3 text-white">
          <KeyRound className="h-5 w-5 shrink-0 text-emerald-300" />
          <span className="min-w-0 flex-1 select-all break-all font-mono text-2xl font-bold tracking-[0.25em]" aria-label="Code de connexion">
            {code}
          </span>
          <Button tone="secondary" className="shrink-0 !py-1.5" onClick={() => void copy()}>
            {copied ? <Check className="h-4 w-4 text-emerald-600" /> : <Copy className="h-4 w-4" />}
            {copied ? 'Copié' : 'Copier'}
          </Button>
        </div>
        {copyFailed ? <p className="text-xs text-slate-500">La copie automatique n’est pas possible ici : sélectionnez le code et copiez-le.</p> : null}
        <div className="flex items-start gap-2 rounded-lg bg-amber-50 px-3 py-2.5 text-sm text-amber-800 ring-1 ring-amber-200">
          <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" />
          <span>
            <b>Ce code ne sera plus jamais affiché.</b> Transmettez-le maintenant à la personne, en main propre ou par un canal sûr
            (jamais par un groupe de discussion). En cas de perte, un nouveau code peut être généré : l’ancien cessera alors de fonctionner.
          </span>
        </div>
        <div className="flex justify-end">
          <Button onClick={onClose}>J’ai transmis le code</Button>
        </div>
      </div>
    </Modal>
  );
}
