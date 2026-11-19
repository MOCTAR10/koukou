import { useRef, useState } from 'react';
import { AlertCircle, Camera, CheckCircle2, Clock, Download, FileText, Hourglass, Loader2, UserCheck } from 'lucide-react';
import { api } from '../../api/client';
import type { FarmerChecklistLine } from '../../api/types-financing';
import { useFarm } from '../../app/FarmContext';
import { useFarmProfile } from '../../app/useFarmProfile';
import { classNames, dateFr } from '../../lib/format';
import { ErrorNote } from '../form';
import {
  SOURCE_LABELS,
  acceptAttr,
  captureHint,
  farmerProgress,
  farmerRemainingText,
  farmerStateText,
  farmerTone,
  sortFarmerChecklist,
  type FarmerFile,
  type FarmerTone,
} from './documentsLogic';
import { farmerDocumentUrl, farmerTemplateUrl, openFile, useFarmerUpload } from './queries';

const TONE_STYLE: Record<FarmerTone, { ring: string; icon: string; text: string }> = {
  todo: { ring: 'border-slate-300', icon: 'bg-slate-100 text-slate-600', text: 'text-slate-800' },
  wait: { ring: 'border-sky-200', icon: 'bg-sky-100 text-sky-700', text: 'text-sky-900' },
  ok: { ring: 'border-emerald-200', icon: 'bg-emerald-100 text-emerald-700', text: 'text-emerald-800' },
  bad: { ring: 'border-red-300', icon: 'bg-red-100 text-red-700', text: 'text-red-800' },
};

function StateIcon({ line }: { line: FarmerChecklistLine }) {
  const cls = 'h-6 w-6';
  if (line.state === 'VALIDEE') return <CheckCircle2 className={cls} aria-hidden />;
  if (line.state === 'DEPOSEE') return <Clock className={cls} aria-hidden />;
  if (line.state === 'EXPIREE') return <Hourglass className={cls} aria-hidden />;
  if (line.state === 'REJETEE') return <AlertCircle className={cls} aria-hidden />;
  return <FileText className={cls} aria-hidden />;
}

/** Banner of a technical agent filing for the farmer: same wording family as the delegated entry. */
export function FilingBanner() {
  const { farm } = useFarm();
  const { isInstitution } = useFarmProfile();
  if (!isInstitution) return null;
  return (
    <div className="flex items-start gap-3 rounded-xl border border-sky-200 bg-sky-50 px-4 py-3 text-base text-sky-900" role="note">
      <UserCheck className="mt-0.5 h-5 w-5 shrink-0" aria-hidden />
      <span>
        Vous déposez pour le compte de <strong>{farm?.name ?? 'la ferme'}</strong>. Le dépôt sera marqué comme fait par vous (agent du programme) et journalisé.
      </span>
    </div>
  );
}

function ItemCard({ farmId, fileId, line, canFile }: { farmId: string; fileId: string; line: FarmerChecklistLine; canFile: boolean }) {
  const upload = useFarmerUpload(farmId, fileId);
  const input = useRef<HTMLInputElement>(null);
  const [error, setError] = useState<unknown>(null);
  const tone = farmerTone(line.state);
  const style = TONE_STYLE[tone];
  const last = [...line.documents].sort((a, b) => b.uploadedAt.localeCompare(a.uploadedAt))[0];
  const mayFile = canFile && line.canFile;

  return (
    <li className={classNames('rounded-2xl border-2 bg-white p-4 sm:p-5', style.ring)}>
      <div className="flex items-start gap-3">
        <span className={classNames('flex h-11 w-11 shrink-0 items-center justify-center rounded-full', style.icon)}>
          <StateIcon line={line} />
        </span>
        <div className="min-w-0 flex-1">
          <h4 className="text-lg font-bold leading-snug text-slate-900">{line.label}</h4>
          {!line.required ? <p className="text-sm text-slate-500">Facultative</p> : null}
          {line.help ? <p className="mt-1 text-base text-slate-700">{line.help}</p> : null}
          <p className={classNames('mt-2 text-base font-semibold', style.text)}>{farmerStateText(line)}</p>
          {line.state === 'VALIDEE' && line.expiresOn ? <p className="text-sm text-slate-600">Valable jusqu’au {dateFr(line.expiresOn)}</p> : null}
        </div>
      </div>

      {line.templateFileName ? (
        <button
          type="button"
          className="mt-3 inline-flex min-h-11 items-center gap-2 rounded-lg px-1 text-base font-semibold text-brand-700 hover:underline"
          onClick={() => api.download(farmerTemplateUrl(farmId, line.requirementId), line.templateFileName ?? 'modele').catch(setError)}
        >
          <Download className="h-5 w-5 shrink-0" aria-hidden /> Télécharger le modèle
        </button>
      ) : null}

      {last ? (
        <div className="mt-3 flex flex-wrap items-center gap-x-3 gap-y-1 rounded-xl bg-slate-50 px-3 py-2 text-base text-slate-800">
          <FileText className="h-5 w-5 shrink-0 text-slate-500" aria-hidden />
          <span className="min-w-0 flex-1 break-all">{last.fileName}</span>
          <span className="text-sm text-slate-500">{last.source === 'EXPLOITANT' ? '' : SOURCE_LABELS[last.source]}</span>
          <button type="button" className="min-h-11 rounded-lg px-2 text-base font-semibold text-brand-700 hover:underline" onClick={() => openFile(farmerDocumentUrl(farmId, fileId, last.id)).catch(setError)}>
            Voir
          </button>
        </div>
      ) : null}

      {mayFile ? (
        <div className="mt-4">
          <input
            ref={input}
            type="file"
            accept={acceptAttr(line.formats)}
            capture={captureHint(line.formats)}
            className="sr-only"
            tabIndex={-1}
            aria-hidden
            onChange={(e) => {
              const f = e.target.files?.[0];
              e.target.value = '';
              if (!f) return;
              setError(null);
              const form = new FormData();
              form.append('file', f);
              form.append('requirementId', line.requirementId);
              upload.mutate(form, { onError: setError });
            }}
          />
          <button
            type="button"
            disabled={upload.isPending}
            onClick={() => input.current?.click()}
            className={classNames(
              'flex min-h-14 w-full items-center justify-center gap-3 rounded-xl px-4 py-3 text-lg font-bold transition disabled:opacity-70',
              tone === 'ok' || tone === 'wait' ? 'border-2 border-brand-600 bg-white text-brand-700 hover:bg-brand-50' : 'bg-brand-600 text-white hover:bg-brand-700',
            )}
          >
            {upload.isPending ? <Loader2 className="h-6 w-6 shrink-0 animate-spin" aria-hidden /> : <Camera className="h-6 w-6 shrink-0" aria-hidden />}
            {upload.isPending ? 'Envoi en cours…' : 'Prendre une photo ou choisir un fichier'}
          </button>
          {upload.isPending ? (
            <div className="mt-2 h-2 overflow-hidden rounded-full bg-slate-200" role="progressbar" aria-label="Envoi en cours">
              <div className="h-full w-1/3 animate-pulse rounded-full bg-brand-600" />
            </div>
          ) : null}
        </div>
      ) : null}
      <ErrorNote error={error ?? upload.error} />
    </li>
  );
}

/** « Pièces à fournir » of one file: what the BCEG asks the farmer, item by item, with one big action each. */
export function FarmerDocuments({ farmId, file, canFile }: { farmId: string; file: FarmerFile; canFile: boolean }) {
  const lines = file.checklist ?? [];
  if (lines.length === 0) return null;
  const progress = farmerProgress(lines);
  const toFile = file.toFile ?? 0;
  const sorted = sortFarmerChecklist(lines);
  return (
    <section aria-label="Pièces à fournir" className="mt-5">
      <h4 className="text-lg font-bold text-slate-900">Pièces à fournir</h4>
      <p className="mt-1 text-base font-semibold text-slate-800">{progress.text}</p>
      <div className="mt-2 h-3 overflow-hidden rounded-full bg-slate-200" role="progressbar" aria-valuemin={0} aria-valuemax={progress.total} aria-valuenow={progress.done} aria-label={progress.text}>
        <div className="h-full rounded-full bg-emerald-600" style={{ width: `${progress.total > 0 ? Math.round((progress.done / progress.total) * 100) : 0}%` }} />
      </div>
      <p className={classNames('mt-2 text-base', toFile > 0 ? 'font-semibold text-amber-800' : 'text-slate-600')}>{farmerRemainingText(toFile, progress.total, progress.done)}</p>
      <ul className="mt-3 space-y-3">
        {sorted.map((l) => (
          <ItemCard key={l.requirementId} farmId={farmId} fileId={file.id} line={l} canFile={canFile} />
        ))}
      </ul>
    </section>
  );
}
