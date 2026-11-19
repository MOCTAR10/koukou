import { useState } from 'react';
import { CalendarPlus, Plus, Undo2 } from 'lucide-react';
import type { Disbursement, FinancingFile, Repayment } from '../../api/types-financing';
import { dateFr, fcfa, num } from '../../lib/format';
import { Button, DateInput, ErrorNote, Field, Modal, inputCls, todayIso } from '../form';
import { DataTable, StatusBadge, Td, Th } from '../ui';
import { ConfirmModal, ReasonModal } from './Dialogs';
import {
  DISBURSEMENT_LABELS,
  DISBURSEMENT_TONES,
  INSTALMENT_LABELS,
  INSTALMENT_TONES,
  METHOD_LABELS,
  daysLateText,
  scheduleTotals,
} from './financingLogic';
import { useFileAction, useFileVisits } from './queries';
import { NO_VISIT_TEXT, visitLabel } from './visitsLogic';
import { FcfaInput, Fact, SectionTitle } from './shared';

// ── Disbursements ──────────────────────────────────────────────────────────

function ReleaseModal({ file, tranche, onClose }: { file: FinancingFile; tranche: Disbursement; onClose: () => void }) {
  const action = useFileAction(file.id);
  const [releasedOn, setReleasedOn] = useState(todayIso());
  const [visitId, setVisitId] = useState('');
  const visits = useFileVisits(file.id);
  const [note, setNote] = useState('');
  return (
    <Modal title={`Débloquer la tranche ${tranche.number}`} onClose={onClose}>
      <form
        className="space-y-4"
        onSubmit={(e) => {
          e.preventDefault();
          action.mutate(
            { path: `disbursements/${tranche.id}/release`, body: { releasedOn, visitId: visitId || null, note: note.trim() || null } },
            { onSuccess: onClose },
          );
        }}
      >
        <p className="text-sm text-slate-700">
          Montant débloqué : <span className="font-semibold">{fcfa(tranche.amountFcfa)}</span>.
          {tranche.condition ? ` Condition : ${tranche.condition}` : ''}
        </p>
        <Field label="Date de déblocage">
          <DateInput value={releasedOn} onChange={(e) => setReleasedOn(e.target.value)} max={todayIso()} required />
        </Field>
        <Field label="Visite de terrain (facultatif)" hint="Visite technique qui a servi de contrôle sur place.">
          <select className={inputCls} value={visitId} onChange={(e) => setVisitId(e.target.value)} disabled={visits.isLoading || (visits.data?.length ?? 0) === 0}>
            <option value="">{visits.isLoading ? 'Chargement des visites' : visits.data?.length === 0 ? NO_VISIT_TEXT : 'Aucune visite choisie'}</option>
            {(visits.data ?? []).map((v) => (
              <option key={v.id} value={v.id}>
                {visitLabel(v)}
              </option>
            ))}
          </select>
          {visits.isError ? <span className="mt-1 block text-xs text-slate-500">Les visites de cette ferme ne sont pas consultables avec votre accès.</span> : null}
        </Field>
        <Field label="Note (facultatif)">
          <input className={inputCls} value={note} onChange={(e) => setNote(e.target.value)} maxLength={300} />
        </Field>
        <ErrorNote error={action.error} />
        <div className="flex justify-end gap-2">
          <Button tone="secondary" onClick={onClose}>
            Annuler
          </Button>
          <Button type="submit" busy={action.isPending} disabled={!releasedOn}>
            Débloquer la tranche
          </Button>
        </div>
      </form>
    </Modal>
  );
}

function AddTrancheModal({ file, onClose }: { file: FinancingFile; onClose: () => void }) {
  const action = useFileAction(file.id);
  const [amount, setAmount] = useState<number | null>(null);
  const [plannedDate, setPlannedDate] = useState('');
  const [condition, setCondition] = useState('');
  const [note, setNote] = useState('');
  return (
    <Modal title="Nouvelle tranche" onClose={onClose}>
      <form
        className="space-y-4"
        onSubmit={(e) => {
          e.preventDefault();
          if (amount == null) return;
          action.mutate(
            { path: 'disbursements', body: { amountFcfa: amount, plannedDate: plannedDate || null, condition: condition.trim() || null, note: note.trim() || null } },
            { onSuccess: onClose },
          );
        }}
      >
        <Field label="Montant de la tranche">
          <FcfaInput value={amount} onChange={setAmount} required />
        </Field>
        <Field label="Date prévue (facultatif)">
          <DateInput value={plannedDate} onChange={(e) => setPlannedDate(e.target.value)} />
        </Field>
        <Field label="Condition de déblocage" hint="Par exemple : contrôle sur place fait, apport de l’exploitant versé.">
          <input className={inputCls} value={condition} onChange={(e) => setCondition(e.target.value)} maxLength={300} />
        </Field>
        <Field label="Note (facultatif)">
          <input className={inputCls} value={note} onChange={(e) => setNote(e.target.value)} maxLength={300} />
        </Field>
        <ErrorNote error={action.error} />
        <div className="flex justify-end gap-2">
          <Button tone="secondary" onClick={onClose}>
            Annuler
          </Button>
          <Button type="submit" busy={action.isPending} disabled={!amount}>
            Ajouter la tranche
          </Button>
        </div>
      </form>
    </Modal>
  );
}

export function FileDisbursementsTab({ file }: { file: FinancingFile }) {
  const [adding, setAdding] = useState(false);
  const [releasing, setReleasing] = useState<Disbursement | null>(null);
  const [cancelling, setCancelling] = useState<Disbursement | null>(null);
  const cancel = useFileAction(file.id);
  const live = file.disbursements.filter((d) => d.status !== 'ANNULEE');
  const planned = live.reduce((n, d) => n + d.amountFcfa, 0);
  const granted = file.amounts.grantedFcfa;
  return (
    <div className="space-y-4">
      <dl className="grid grid-cols-3 gap-3">
        <Fact label="Accordé">{fcfa(granted)}</Fact>
        <Fact label="Tranches prévues">{fcfa(planned)}</Fact>
        <Fact label="Décaissé">{fcfa(file.amounts.disbursedFcfa)}</Fact>
      </dl>
      {granted != null && planned > granted ? <p className="rounded-lg bg-amber-50 px-3 py-2 text-sm text-amber-800 ring-1 ring-amber-200">Les tranches prévues dépassent le montant accordé.</p> : null}
      <SectionTitle
        action={
          file.rights.edit ? (
            <Button tone="secondary" onClick={() => setAdding(true)}>
              <Plus className="h-4 w-4" /> Ajouter une tranche
            </Button>
          ) : null
        }
      >
        Tranches
      </SectionTitle>
      {file.disbursements.length === 0 ? (
        <p className="text-sm text-slate-500">Aucune tranche prévue.</p>
      ) : (
        <div className="rounded-xl border border-slate-200">
          <DataTable>
            <thead>
              <tr>
                <Th>N°</Th>
                <Th>Prévue le</Th>
                <Th className="text-right">Montant</Th>
                <Th>Statut</Th>
                <Th>Actions</Th>
              </tr>
            </thead>
            <tbody>
              {file.disbursements.map((d) => (
                <tr key={d.id} className={d.status === 'ANNULEE' ? 'opacity-60' : undefined}>
                  <Td>
                    <span className="font-semibold">Tranche {d.number}</span>
                    {d.condition ? <span className="block text-xs text-slate-500">{d.condition}</span> : null}
                    {d.note ? <span className="block text-xs text-slate-500">{d.note}</span> : null}
                  </Td>
                  <Td label="Prévue le" className="whitespace-nowrap">{dateFr(d.plannedDate)}</Td>
                  <Td label="Montant" className="whitespace-nowrap text-right tabular-nums">
                    {fcfa(d.amountFcfa)}
                  </Td>
                  <Td label="Statut">
                    <StatusBadge tone={DISBURSEMENT_TONES[d.status]} label={DISBURSEMENT_LABELS[d.status]} />
                    {d.releasedOn ? <span className="mt-0.5 block text-xs text-slate-500">le {dateFr(d.releasedOn)}</span> : null}
                    {d.visit ? <span className="block text-xs text-slate-500">Visite de terrain : {visitLabel(d.visit)}</span> : d.visitId ? <span className="block text-xs text-slate-500">Visite de terrain liée</span> : null}
                  </Td>
                  <Td label="Actions">
                    {d.status === 'PREVUE' && file.rights.validate ? (
                      <span className="flex flex-wrap gap-2">
                        <Button onClick={() => setReleasing(d)}>Débloquer</Button>
                        <Button tone="secondary" onClick={() => setCancelling(d)}>
                          Annuler
                        </Button>
                      </span>
                    ) : null}
                  </Td>
                </tr>
              ))}
            </tbody>
          </DataTable>
        </div>
      )}
      {adding ? <AddTrancheModal file={file} onClose={() => setAdding(false)} /> : null}
      {releasing ? <ReleaseModal file={file} tranche={releasing} onClose={() => setReleasing(null)} /> : null}
      {cancelling ? (
        <ConfirmModal
          title={`Annuler la tranche ${cancelling.number}`}
          confirm="Annuler la tranche"
          tone="danger"
          busy={cancel.isPending}
          error={cancel.error}
          onConfirm={() => cancel.mutate({ path: `disbursements/${cancelling.id}/cancel` }, { onSuccess: () => setCancelling(null) })}
          onClose={() => setCancelling(null)}
        >
          La tranche de {fcfa(cancelling.amountFcfa)} ne sera pas débloquée. Elle reste visible dans la liste, marquée annulée.
        </ConfirmModal>
      ) : null}
    </div>
  );
}

// ── Schedule ───────────────────────────────────────────────────────────────

function ScheduleModal({ file, onClose }: { file: FinancingFile; onClose: () => void }) {
  const action = useFileAction(file.id);
  const [firstDueDate, setFirst] = useState('');
  return (
    <Modal title="Générer l’échéancier" onClose={onClose}>
      <form
        className="space-y-4"
        onSubmit={(e) => {
          e.preventDefault();
          action.mutate({ path: 'schedule', body: { firstDueDate } }, { onSuccess: onClose });
        }}
      >
        <p className="text-sm text-slate-600">
          L’échéancier se calcule à partir des conditions du dossier (montant accordé, taux, durée, différé, périodicité). Les échéances suivantes tombent selon la périodicité.
        </p>
        {file.instalments.length > 0 ? (
          <p className="rounded-lg bg-amber-50 px-3 py-2 text-sm text-amber-800 ring-1 ring-amber-200">Un échéancier existe déjà : le régénérer le remplace si le serveur l’accepte.</p>
        ) : null}
        <Field label="Date de la première échéance">
          <DateInput value={firstDueDate} onChange={(e) => setFirst(e.target.value)} required />
        </Field>
        <ErrorNote error={action.error} />
        <div className="flex justify-end gap-2">
          <Button tone="secondary" onClick={onClose}>
            Annuler
          </Button>
          <Button type="submit" busy={action.isPending} disabled={!firstDueDate}>
            Générer l’échéancier
          </Button>
        </div>
      </form>
    </Modal>
  );
}

export function FileScheduleTab({ file }: { file: FinancingFile }) {
  const [generating, setGenerating] = useState(false);
  const t = scheduleTotals(file.instalments);
  return (
    <div className="space-y-4">
      <SectionTitle
        action={
          file.rights.edit ? (
            <Button tone="secondary" onClick={() => setGenerating(true)}>
              <CalendarPlus className="h-4 w-4" /> {file.instalments.length ? 'Régénérer' : 'Générer l’échéancier'}
            </Button>
          ) : null
        }
      >
        Échéancier
      </SectionTitle>
      {file.instalments.length === 0 ? (
        <p className="text-sm text-slate-500">
          Pas d’échéancier. Renseignez les conditions du dossier (montant accordé, taux, durée, périodicité) dans l’onglet Synthèse, puis générez-le à partir de la première échéance.
        </p>
      ) : (
        <>
          <dl className="grid grid-cols-2 gap-3 sm:grid-cols-4">
            <Fact label="Total dû">{fcfa(t.due)}</Fact>
            <Fact label="Dont intérêts">{fcfa(t.interest)}</Fact>
            <Fact label="Payé">{fcfa(t.paid)}</Fact>
            <Fact label="Reste à payer">{fcfa(t.remaining)}</Fact>
          </dl>
          <p className="text-xs text-slate-500">Montants en FCFA.</p>
          <div className="rounded-xl border border-slate-200">
            <DataTable>
              <thead>
                <tr>
                  <Th>N°</Th>
                  <Th>Échéance</Th>
                  <Th className="text-right">Capital</Th>
                  <Th className="text-right">Intérêts</Th>
                  <Th className="text-right">À payer</Th>
                  <Th className="text-right">Payé</Th>
                  <Th>Statut</Th>
                </tr>
              </thead>
              <tbody>
                {file.instalments.map((i) => (
                  <tr key={i.id}>
                    <Td>{i.number}</Td>
                    <Td label="Échéance" className="whitespace-nowrap">{dateFr(i.dueDate)}</Td>
                    <Td label="Capital" className="whitespace-nowrap text-right tabular-nums">
                      {num(i.principalFcfa, 0)}
                    </Td>
                    <Td label="Intérêts" className="whitespace-nowrap text-right tabular-nums">
                      {num(i.interestFcfa, 0)}
                    </Td>
                    <Td label="À payer" className="whitespace-nowrap text-right font-medium tabular-nums">
                      {num(i.dueFcfa, 0)}
                    </Td>
                    <Td label="Payé" className="whitespace-nowrap text-right tabular-nums">
                      {num(i.paidFcfa, 0)}
                    </Td>
                    <Td label="Statut" className="whitespace-nowrap">
                      <StatusBadge tone={INSTALMENT_TONES[i.status]} label={INSTALMENT_LABELS[i.status]} />
                      {i.status === 'EN_RETARD' ? <span className="ml-1 text-xs text-red-700">{daysLateText(i.daysLate)}</span> : null}
                    </Td>
                  </tr>
                ))}
              </tbody>
            </DataTable>
          </div>
        </>
      )}
      {generating ? <ScheduleModal file={file} onClose={() => setGenerating(false)} /> : null}
    </div>
  );
}

// ── Repayments ─────────────────────────────────────────────────────────────

function RepaymentModal({ file, onClose }: { file: FinancingFile; onClose: () => void }) {
  const action = useFileAction(file.id);
  const [paidOn, setPaidOn] = useState(todayIso());
  const [amount, setAmount] = useState<number | null>(null);
  const [method, setMethod] = useState<Repayment['method']>('VIREMENT');
  const [reference, setReference] = useState('');
  const [note, setNote] = useState('');
  return (
    <Modal title="Enregistrer un remboursement" onClose={onClose}>
      <form
        className="space-y-4"
        onSubmit={(e) => {
          e.preventDefault();
          if (amount == null) return;
          action.mutate(
            { path: 'repayments', body: { paidOn, amountFcfa: amount, method, reference: reference.trim() || null, note: note.trim() || null } },
            { onSuccess: onClose },
          );
        }}
      >
        <div className="grid gap-3 sm:grid-cols-2">
          <Field label="Date du paiement">
            <DateInput value={paidOn} onChange={(e) => setPaidOn(e.target.value)} max={todayIso()} required />
          </Field>
          <Field label="Montant reçu">
            <FcfaInput value={amount} onChange={setAmount} required />
          </Field>
          <Field label="Moyen de paiement">
            <select className={inputCls} value={method} onChange={(e) => setMethod(e.target.value as Repayment['method'])}>
              {(Object.keys(METHOD_LABELS) as Array<Repayment['method']>).map((m) => (
                <option key={m} value={m}>
                  {METHOD_LABELS[m]}
                </option>
              ))}
            </select>
          </Field>
          <Field label="Référence (facultatif)">
            <input className={inputCls} value={reference} onChange={(e) => setReference(e.target.value)} maxLength={80} />
          </Field>
        </div>
        <Field label="Note (facultatif)">
          <input className={inputCls} value={note} onChange={(e) => setNote(e.target.value)} maxLength={300} />
        </Field>
        <ErrorNote error={action.error} />
        <div className="flex justify-end gap-2">
          <Button tone="secondary" onClick={onClose}>
            Annuler
          </Button>
          <Button type="submit" busy={action.isPending} disabled={!amount || !paidOn}>
            Enregistrer
          </Button>
        </div>
      </form>
    </Modal>
  );
}

export function FileRepaymentsTab({ file }: { file: FinancingFile }) {
  const [adding, setAdding] = useState(false);
  const [cancelling, setCancelling] = useState<Repayment | null>(null);
  const cancel = useFileAction<{ reason: string }>(file.id);
  const total = file.repayments.filter((r) => !r.cancelledAt).reduce((n, r) => n + r.amountFcfa, 0);
  return (
    <div className="space-y-4">
      <SectionTitle
        action={
          file.rights.create ? (
            <Button tone="secondary" onClick={() => setAdding(true)}>
              <Plus className="h-4 w-4" /> Enregistrer un remboursement
            </Button>
          ) : null
        }
      >
        Remboursements reçus : {fcfa(total)}
      </SectionTitle>
      {file.repayments.length === 0 ? (
        <p className="text-sm text-slate-500">Aucun remboursement enregistré.</p>
      ) : (
        <div className="rounded-xl border border-slate-200">
          <DataTable>
            <thead>
              <tr>
                <Th>Date</Th>
                <Th className="text-right">Montant</Th>
                <Th>Moyen</Th>
                <Th>Saisi par</Th>
                <Th>Actions</Th>
              </tr>
            </thead>
            <tbody>
              {file.repayments.map((r) => (
                <tr key={r.id} className={r.cancelledAt ? 'text-slate-400' : undefined}>
                  <Td className="whitespace-nowrap">
                    <span className={r.cancelledAt ? 'line-through' : 'font-medium'}>{dateFr(r.paidOn)}</span>
                    {r.reference ? <span className="block text-xs text-slate-500">Réf. {r.reference}</span> : null}
                    {r.note ? <span className="block text-xs text-slate-500">{r.note}</span> : null}
                  </Td>
                  <Td label="Montant" className="whitespace-nowrap text-right tabular-nums">
                    <span className={r.cancelledAt ? 'line-through' : undefined}>{fcfa(r.amountFcfa)}</span>
                  </Td>
                  <Td label="Moyen" className="whitespace-nowrap">{METHOD_LABELS[r.method]}</Td>
                  <Td label="Saisi par">{r.recordedByName ?? '—'}</Td>
                  <Td label="Actions">
                    {r.cancelledAt ? (
                      <span className="text-xs text-slate-600">
                        <StatusBadge tone="neutral" label="Annulé" /> {r.cancelReason ?? ''}
                      </span>
                    ) : file.rights.validate ? (
                      <Button tone="secondary" onClick={() => setCancelling(r)}>
                        <Undo2 className="h-4 w-4" /> Annuler
                      </Button>
                    ) : null}
                  </Td>
                </tr>
              ))}
            </tbody>
          </DataTable>
        </div>
      )}
      {adding ? <RepaymentModal file={file} onClose={() => setAdding(false)} /> : null}
      {cancelling ? (
        <ReasonModal
          title="Annuler le remboursement"
          intro={`Remboursement de ${fcfa(cancelling.amountFcfa)} du ${dateFr(cancelling.paidOn)}. Il reste visible, marqué annulé, avec son motif.`}
          label="Motif de l’annulation"
          confirm="Annuler le remboursement"
          tone="danger"
          busy={cancel.isPending}
          error={cancel.error}
          onSubmit={(reason) => cancel.mutate({ path: `repayments/${cancelling.id}/cancel`, body: { reason } }, { onSuccess: () => setCancelling(null) })}
          onClose={() => setCancelling(null)}
        />
      ) : null}
    </div>
  );
}
