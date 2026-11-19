import { useState } from 'react';
import { Link } from 'react-router-dom';
import { ArrowRight, Check, ScanEye } from 'lucide-react';
import { FINANCING_STEP_LABELS, type FinancingDecision, type FinancingFile } from '../../api/types-financing';
import { classNames, dateFr, fcfa } from '../../lib/format';
import { Button, DateInput, ErrorNote, Field, Modal, inputCls, todayIso } from '../form';
import { Loading } from '../ui';
import { FileConsentTab } from './FileConsentTab';
import { FileDocumentsTab } from './FileDocumentsTab';
import { FileDisbursementsTab, FileRepaymentsTab, FileScheduleTab } from './FileMoneyTabs';
import { FileSummaryTab } from './FileSummaryTab';
import { farm360Path } from './financingAccess';
import { DECISION_LABELS, STEP_HINTS, passStepState, stepperState, targetForDecision } from './financingLogic';
import { useFileAction, useFinancingFile } from './queries';
import { ClaimClassBadge, ConsentBadge, Tabs } from './shared';

function Stepper({ file }: { file: FinancingFile }) {
  const items = stepperState(file.step);
  return (
    <>
    <ol className="grid grid-cols-6 gap-1" aria-label="Étapes du dossier">
      {items.map((s, i) => (
        <li key={s.step} aria-current={s.state === 'current' ? 'step' : undefined} className="min-w-0">
          <div className="flex items-center">
            <span
              className={classNames(
                'flex h-6 w-6 shrink-0 items-center justify-center rounded-full text-[11px] font-bold ring-2 ring-white',
                s.state === 'done' && 'bg-emerald-600 text-white',
                s.state === 'current' && 'bg-brand-600 text-white',
                s.state === 'todo' && 'bg-slate-200 text-slate-600',
              )}
            >
              {s.state === 'done' ? <Check className="h-3.5 w-3.5" aria-label="Étape passée" /> : i + 1}
            </span>
            {i < items.length - 1 ? <span aria-hidden className={classNames('h-0.5 flex-1', s.state === 'done' ? 'bg-emerald-600' : 'bg-slate-200')} /> : null}
          </div>
          <p className={classNames('mt-1 hidden pr-1 text-xs leading-tight sm:block', s.state === 'current' ? 'font-semibold text-brand-700' : 'text-slate-600')}>
            {s.label}
          </p>
        </li>
      ))}
    </ol>
    <p className="text-sm font-semibold text-brand-700 sm:hidden">
      Étape {items.findIndex((s) => s.state === 'current') + 1} sur {items.length} : {items.find((s) => s.state === 'current')?.label}
    </p>
    </>
  );
}

function PassStepModal({ file, onClose }: { file: FinancingFile; onClose: () => void }) {
  const action = useFileAction(file.id);
  const state = passStepState(file);
  const [decision, setDecision] = useState<FinancingDecision>('ACCORDE');
  const [date, setDate] = useState(todayIso());
  const [note, setNote] = useState('');
  const to = state.needsDecision ? targetForDecision(decision) : state.next;
  if (!to) return null;
  return (
    <Modal title={state.needsDecision ? 'Décision du dossier' : `Passer à l’étape « ${FINANCING_STEP_LABELS[to]} »`} onClose={onClose}>
      <form
        className="space-y-4"
        onSubmit={(e) => {
          e.preventDefault();
          action.mutate(
            { path: 'step', body: { to, ...(state.needsDecision ? { decision, decisionDate: date } : {}), note: note.trim() || undefined } },
            { onSuccess: onClose },
          );
        }}
      >
        {state.needsDecision ? (
          <>
            <fieldset>
              <legend className="mb-1 text-xs font-medium text-slate-600">Décision</legend>
              <div className="grid gap-2 sm:grid-cols-3">
                {(['ACCORDE', 'REFUSE', 'AJOURNE'] as const).map((d) => (
                  <label
                    key={d}
                    className={classNames(
                      'flex cursor-pointer items-center gap-2 rounded-lg border px-3 py-2 text-sm',
                      decision === d ? 'border-brand-500 bg-brand-50 font-semibold text-brand-800' : 'border-slate-300 text-slate-700',
                    )}
                  >
                    <input type="radio" name="decision" className="accent-[#206080]" checked={decision === d} onChange={() => setDecision(d)} />
                    {DECISION_LABELS[d]}
                  </label>
                ))}
              </div>
              <p className="mt-2 text-xs text-slate-500">
                {decision === 'ACCORDE'
                  ? `Le dossier passe au décaissement. Montant accordé : ${fcfa(file.amounts.grantedFcfa)}.`
                  : decision === 'REFUSE'
                    ? 'Le dossier est clos.'
                    : 'Le dossier reste à l’étape Décision.'}
              </p>
            </fieldset>
            <Field label="Date de la décision">
              <DateInput value={date} onChange={(e) => setDate(e.target.value)} max={todayIso()} required />
            </Field>
          </>
        ) : (
          <p className="text-sm text-slate-700">{STEP_HINTS[to]}</p>
        )}
        <Field label="Note (facultatif)">
          <textarea className={inputCls} rows={2} value={note} onChange={(e) => setNote(e.target.value)} maxLength={500} />
        </Field>
        <ErrorNote error={action.error} />
        <div className="flex justify-end gap-2">
          <Button tone="secondary" onClick={onClose}>
            Annuler
          </Button>
          <Button type="submit" busy={action.isPending}>
            {state.needsDecision ? 'Enregistrer la décision' : 'Passer à l’étape suivante'}
          </Button>
        </div>
      </form>
    </Modal>
  );
}

type TabKey = 'synthese' | 'pieces' | 'decaissements' | 'echeancier' | 'remboursements' | 'consentement';

/** The wide side panel of a file: stepper, step action, then one tab per aspect of the file. */
export function FilePanel({ fileId, onClose }: { fileId: string; onClose: () => void }) {
  const query = useFinancingFile(fileId);
  const [tab, setTab] = useState<TabKey>('synthese');
  const [passing, setPassing] = useState(false);
  const file = query.data;

  return (
    <Modal side wide title={file ? `Dossier ${file.reference}` : 'Dossier de financement'} onClose={onClose}>
      {query.isLoading ? (
        <Loading label="Chargement du dossier…" />
      ) : !file ? (
        <ErrorNote error={query.error ?? 'Dossier introuvable.'} onRetry={() => void query.refetch()} />
      ) : (
        <div className="space-y-5">
          <div className="flex flex-wrap items-start justify-between gap-3">
            <div className="min-w-0">
              <p className="font-mono text-xs font-semibold text-slate-500">{file.reference}</p>
              <p className="text-lg font-bold text-slate-900">{file.purpose}</p>
              <p className="text-sm text-slate-600">
                {file.farmName} <span className="font-mono text-xs text-slate-500">{file.farmCode}</span>
                {file.provinceName ? ` · ${file.provinceName}` : ''}
                {file.exploitantName ? ` · ${file.exploitantName}` : ''}
              </p>
              <p className="mt-1 flex flex-wrap items-center gap-2 text-xs text-slate-500">
                <ClaimClassBadge value={file.claimClass} /> <ConsentBadge value={file.consent} /> Mis à jour le {dateFr(file.updatedAt)}
              </p>
            </div>
            <Link
              to={farm360Path(file.farmId)}
              className="inline-flex items-center gap-1.5 rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm font-semibold text-slate-700 hover:bg-slate-50"
            >
              <ScanEye className="h-4 w-4" /> Vue 360°
            </Link>
          </div>

          <Stepper file={file} />

          {(() => {
            const pass = passStepState(file);
            if (!pass.available) return null;
            return (
              <div className="rounded-xl border border-slate-200 bg-slate-50 p-3">
                <div className="flex flex-wrap items-center gap-3">
                  <p className="min-w-0 basis-full text-sm text-slate-700 sm:basis-0 sm:flex-1">{STEP_HINTS[file.step]}</p>
                  <Button disabled={!pass.enabled} onClick={() => setPassing(true)}>
                    {pass.needsDecision ? 'Enregistrer la décision' : 'Passer à l’étape suivante'} <ArrowRight className="h-4 w-4" />
                  </Button>
                </div>
                {pass.blockers.length > 0 ? (
                  <div className="mt-3 rounded-lg bg-amber-50 px-3 py-2 text-sm text-amber-900 ring-1 ring-amber-200">
                    <p className="font-semibold">Pour passer à l’étape suivante, il manque :</p>
                    <ul className="mt-1 list-disc pl-5">
                      {pass.blockers.map((b) => (
                        <li key={b}>{b}</li>
                      ))}
                    </ul>
                  </div>
                ) : null}
              </div>
            );
          })()}

          <Tabs<TabKey>
            label="Contenu du dossier"
            value={tab}
            onChange={setTab}
            tabs={[
              { key: 'synthese', label: 'Synthèse' },
              { key: 'pieces', label: 'Pièces' },
              { key: 'decaissements', label: 'Décaissements' },
              { key: 'echeancier', label: 'Échéancier' },
              { key: 'remboursements', label: 'Remboursements' },
              { key: 'consentement', label: 'Consentement' },
            ]}
          />
          <div role="tabpanel" id={`panel-${tab}`} aria-labelledby={`tab-${tab}`}>
            {tab === 'synthese' ? <FileSummaryTab key={`${file.id}-${file.updatedAt}`} file={file} /> : null}
            {tab === 'pieces' ? <FileDocumentsTab file={file} /> : null}
            {tab === 'decaissements' ? <FileDisbursementsTab file={file} /> : null}
            {tab === 'echeancier' ? <FileScheduleTab file={file} /> : null}
            {tab === 'remboursements' ? <FileRepaymentsTab file={file} /> : null}
            {tab === 'consentement' ? <FileConsentTab file={file} /> : null}
          </div>
          {passing ? <PassStepModal file={file} onClose={() => setPassing(false)} /> : null}
        </div>
      )}
    </Modal>
  );
}
