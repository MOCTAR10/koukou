import { useMemo, useState } from 'react';
import { Save } from 'lucide-react';
import { FINANCING_STEP_LABELS, type ClaimFlag, type FinancingFile, type FinancingStep, type Periodicity, type UpdateFinancingFileBody } from '../../api/types-financing';
import { useMenuAccess } from '../../app/useMenuAccess';
import { dateFr, dateTimeFr, fcfa } from '../../lib/format';
import { Button, ErrorNote, Field, inputCls } from '../form';
import { StatusBadge } from '../ui';
import { FinancialHealthCard } from './FinancialsBlock';
import { farm360Path } from './financingAccess';
import { CLAIM_FLAG_LABELS, DECISION_LABELS, PERIODICITY_LABELS, daysLateText, parseCount, parsePct, termsPatch } from './financingLogic';
import { useUpdateFile } from './queries';
import { ClaimClassBadge, Fact, FcfaInput, SectionTitle } from './shared';

const stepName = (s: FinancingStep) => FINANCING_STEP_LABELS[s] ?? s;
const numText = (n: number | null) => (n == null ? '' : String(n).replace('.', ','));

/** Terms, guarantees, claim flag and the history of the file. */
export function FileSummaryTab({ file }: { file: FinancingFile }) {
  const update = useUpdateFile(file.id);
  const canEdit = file.rights.edit;
  const { financing } = useMenuAccess();
  const [draft, setDraft] = useState(() => ({
    purpose: file.purpose,
    requestedFcfa: file.amounts.requestedFcfa,
    grantedFcfa: file.amounts.grantedFcfa,
    amountNote: file.amountNote ?? '',
    rate: numText(file.ratePct),
    duration: numText(file.durationMonths),
    grace: numText(file.graceMonths),
    periodicity: (file.periodicity ?? '') as Periodicity | '',
    guarantees: file.guarantees ?? '',
    guaranteeFund: file.guaranteeFund ?? '',
    guaranteePct: numText(file.guaranteePct),
    claimFlag: (file.claimFlag ?? '') as Exclude<ClaimFlag, null> | '',
    claimFlagNote: file.claimFlagNote ?? '',
    notes: file.notes ?? '',
  }));
  const set = <K extends keyof typeof draft>(key: K, value: (typeof draft)[K]) => setDraft((d) => ({ ...d, [key]: value }));

  const parsed = useMemo(() => {
    const rate = parsePct(draft.rate);
    const guaranteePct = parsePct(draft.guaranteePct);
    const duration = parseCount(draft.duration);
    const grace = parseCount(draft.grace);
    const invalid =
      rate === undefined
        ? 'Le taux est un pourcentage entre 0 et 100.'
        : guaranteePct === undefined
          ? 'La part garantie est un pourcentage entre 0 et 100.'
          : duration === undefined || grace === undefined
            ? 'La durée et le différé se comptent en mois entiers.'
            : null;
    const body: UpdateFinancingFileBody = {
      purpose: draft.purpose.trim(),
      requestedFcfa: draft.requestedFcfa,
      grantedFcfa: draft.grantedFcfa,
      amountNote: draft.amountNote,
      ratePct: rate ?? null,
      durationMonths: duration ?? null,
      graceMonths: grace ?? null,
      periodicity: draft.periodicity || null,
      guarantees: draft.guarantees,
      guaranteeFund: draft.guaranteeFund,
      guaranteePct: guaranteePct ?? null,
      claimFlag: draft.claimFlag || null,
      claimFlagNote: draft.claimFlagNote,
      notes: draft.notes,
    };
    return { invalid, patch: termsPatch(file, { ...body, requestedFcfa: body.requestedFcfa ?? null }) };
  }, [draft, file]);

  const changed = Object.keys(parsed.patch).length > 0;
  const a = file.amounts;

  return (
    <div className="space-y-6">
      <section aria-label="Situation du dossier">
        <dl className="grid grid-cols-2 gap-x-4 gap-y-3 sm:grid-cols-3">
          <Fact label="Demandé">{fcfa(a.requestedFcfa)}</Fact>
          <Fact label="Accordé">{fcfa(a.grantedFcfa)}</Fact>
          <Fact label="Décaissé">{fcfa(a.disbursedFcfa)}</Fact>
          <Fact label="Remboursé">{fcfa(a.repaidFcfa)}</Fact>
          <Fact label="Encours">{fcfa(a.outstandingFcfa)}</Fact>
          <Fact label="Échu non payé">
            <span className={a.overdueFcfa > 0 ? 'font-semibold text-red-700' : undefined}>{fcfa(a.overdueFcfa)}</span>
          </Fact>
          <Fact label="Classe de créance">
            <ClaimClassBadge value={file.claimClass} />
          </Fact>
          <Fact label="Retard">{daysLateText(file.daysLate)}</Fact>
          <Fact label="Décision">
            {file.decision ? (
              <span>
                {DECISION_LABELS[file.decision]}
                {file.decisionDate ? ` le ${dateFr(file.decisionDate)}` : ''}
              </span>
            ) : null}
          </Fact>
        </dl>
        {file.decisionNote ? <p className="mt-2 rounded-lg bg-slate-50 px-3 py-2 text-sm text-slate-700">{file.decisionNote}</p> : null}
      </section>

      {financing.financials ? <FinancialHealthCard farmId={file.farmId} to={`${farm360Path(file.farmId)}#etats-financiers`} /> : null}

      <form
        className="space-y-5"
        onSubmit={(e) => {
          e.preventDefault();
          if (!parsed.invalid && changed) update.mutate(parsed.patch);
        }}
      >
        <fieldset disabled={!canEdit} className="min-w-0 space-y-5">
          <div>
            <SectionTitle>Conditions du financement</SectionTitle>
            <div className="grid gap-3 sm:grid-cols-2">
              <Field label="Objet" className="sm:col-span-2">
                <input className={inputCls} value={draft.purpose} onChange={(e) => set('purpose', e.target.value)} maxLength={200} />
              </Field>
              <Field label="Montant demandé">
                <FcfaInput value={draft.requestedFcfa} onChange={(n) => set('requestedFcfa', n)} />
              </Field>
              <Field label="Montant accordé">
                <FcfaInput value={draft.grantedFcfa} onChange={(n) => set('grantedFcfa', n)} />
              </Field>
              <Field label="Taux annuel (%)" hint="Deux décimales au plus.">
                <input className={inputCls} inputMode="decimal" value={draft.rate} onChange={(e) => set('rate', e.target.value)} />
              </Field>
              <Field label="Périodicité">
                <select className={inputCls} value={draft.periodicity} onChange={(e) => set('periodicity', e.target.value as Periodicity | '')}>
                  <option value="">Non précisée</option>
                  {(Object.keys(PERIODICITY_LABELS) as Periodicity[]).map((p) => (
                    <option key={p} value={p}>
                      {PERIODICITY_LABELS[p]}
                    </option>
                  ))}
                </select>
              </Field>
              <Field label="Durée (mois)">
                <input className={inputCls} inputMode="numeric" value={draft.duration} onChange={(e) => set('duration', e.target.value)} />
              </Field>
              <Field label="Différé (mois)">
                <input className={inputCls} inputMode="numeric" value={draft.grace} onChange={(e) => set('grace', e.target.value)} />
              </Field>
              <Field label="Précision sur le montant" className="sm:col-span-2">
                <input className={inputCls} value={draft.amountNote} onChange={(e) => set('amountNote', e.target.value)} maxLength={300} />
              </Field>
            </div>
          </div>

          <div>
            <SectionTitle>Garanties</SectionTitle>
            <div className="grid gap-3 sm:grid-cols-2">
              <Field label="Sûretés prises" hint="Cautionnement, gage de matériel, gage de stocks…" className="sm:col-span-2">
                <textarea className={inputCls} rows={2} value={draft.guarantees} onChange={(e) => set('guarantees', e.target.value)} maxLength={1000} />
              </Field>
              <Field label="Fonds de garantie">
                <input className={inputCls} value={draft.guaranteeFund} onChange={(e) => set('guaranteeFund', e.target.value)} maxLength={120} />
              </Field>
              <Field label="Part garantie (%)">
                <input className={inputCls} inputMode="decimal" value={draft.guaranteePct} onChange={(e) => set('guaranteePct', e.target.value)} />
              </Field>
            </div>
          </div>

          <div>
            <SectionTitle>Classement de la créance</SectionTitle>
            <p className="mb-2 text-xs text-slate-500">
              La classe saine, impayée ou douteuse se calcule seule à partir de l’échéance impayée la plus ancienne. Un classement manuel de la BCEG la remplace.
            </p>
            <div className="grid gap-3 sm:grid-cols-2">
              <Field label="Classement manuel">
                <select className={inputCls} value={draft.claimFlag} onChange={(e) => set('claimFlag', e.target.value as typeof draft.claimFlag)}>
                  <option value="">Aucun (classe calculée)</option>
                  {(Object.keys(CLAIM_FLAG_LABELS) as Array<Exclude<ClaimFlag, null>>).map((c) => (
                    <option key={c} value={c}>
                      {CLAIM_FLAG_LABELS[c]}
                    </option>
                  ))}
                </select>
              </Field>
              <Field label="Note sur le classement">
                <input className={inputCls} value={draft.claimFlagNote} onChange={(e) => set('claimFlagNote', e.target.value)} maxLength={300} />
              </Field>
            </div>
          </div>

          <Field label="Notes du dossier">
            <textarea className={inputCls} rows={3} value={draft.notes} onChange={(e) => set('notes', e.target.value)} maxLength={2000} />
          </Field>
        </fieldset>

        {parsed.invalid ? <p className="text-sm text-red-700">{parsed.invalid}</p> : null}
        <ErrorNote error={update.error} />
        {canEdit ? (
          <div className="flex items-center justify-end gap-3">
            {update.isSuccess && !changed ? <span className="text-sm text-emerald-700">Enregistré.</span> : null}
            <Button type="submit" busy={update.isPending} disabled={!changed || !!parsed.invalid}>
              <Save className="h-4 w-4" /> Enregistrer les conditions
            </Button>
          </div>
        ) : null}
      </form>

      <section aria-label="Historique du dossier">
        <SectionTitle>Historique</SectionTitle>
        {file.history.length === 0 ? (
          <p className="text-sm text-slate-500">Aucun mouvement pour l’instant.</p>
        ) : (
          <ol className="relative space-y-4 border-l-2 border-slate-200 pl-5">
            {[...file.history].reverse().map((h) => (
              <li key={h.id} className="relative">
                <span aria-hidden className="absolute -left-[1.6rem] top-1.5 h-2.5 w-2.5 rounded-full bg-brand-600 ring-4 ring-white" />
                <p className="text-sm font-medium text-slate-900">
                  {h.from ? 'Passage à l’étape' : 'Ouverture à l’étape'} <StatusBadge tone="info" label={stepName(h.to)} />
                  {h.decision ? <span className="ml-2 text-slate-600">· {DECISION_LABELS[h.decision]}</span> : null}
                </p>
                {h.note ? <p className="mt-0.5 text-sm text-slate-600">{h.note}</p> : null}
                <p className="text-xs text-slate-500">
                  {dateTimeFr(h.at)}
                  {h.byName ? ` · ${h.byName}` : ''}
                </p>
              </li>
            ))}
          </ol>
        )}
      </section>
    </div>
  );
}
