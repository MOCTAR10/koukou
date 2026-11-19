import { useState } from 'react';
import { Banknote, CheckCircle2, ExternalLink, FileWarning, ShieldCheck } from 'lucide-react';
import { ApiError } from '../api/client';
import { FINANCING_STEP_LABELS, type FarmFinancingView } from '../api/types-financing';
import { useAuth } from '../auth/AuthContext';
import { useFarm } from '../app/FarmContext';
import { PageNotOpen } from '../components/access/PageNotOpen';
import { ConfirmModal } from '../components/financing/Dialogs';
import { STEP_HINTS, INSTALMENT_LABELS, INSTALMENT_TONES, nextInstalment } from '../components/financing/financingLogic';
import { openFile, useFarmFinancing, useGiveFarmConsent, useWithdrawFarmConsent } from '../components/financing/queries';
import { FarmerDocuments, FilingBanner } from '../components/financing/FarmerDocuments';
import type { FarmerFile } from '../components/financing/documentsLogic';
import { Fact } from '../components/financing/shared';
import { Button, ErrorNote, Field, inputCls } from '../components/form';
import { Card, DataTable, EmptyState, IconTile, Loading, PageHeader, StatusBadge, Td, Th } from '../components/ui';
import { dateFr, fcfa } from '../lib/format';

/** Reads the bank's template in a new tab; its error stays under the link. */
function TemplateLink({ farmId, fileName }: { farmId: string; fileName: string }) {
  const [error, setError] = useState<unknown>(null);
  return (
    <div>
      <button
        type="button"
        className="inline-flex min-h-11 items-center gap-2 rounded-lg px-1 text-base font-semibold text-brand-700 underline-offset-2 hover:underline"
        onClick={() => openFile(`/farms/${farmId}/financing/consent-template/file`).catch(setError)}
      >
        <ExternalLink className="h-5 w-5" /> Lire le modèle de consentement
        <span className="sr-only"> ({fileName}), s’ouvre dans un nouvel onglet</span>
      </button>
      <ErrorNote error={error} />
    </div>
  );
}

function ConsentCard({ farmId, view }: { farmId: string; view: FarmFinancingView }) {
  const { user } = useAuth();
  const give = useGiveFarmConsent(farmId);
  const withdraw = useWithdrawFarmConsent(farmId);
  const [accepted, setAccepted] = useState(false);
  const [signerName, setSignerName] = useState(user?.fullName ?? '');
  const [signerQuality, setSignerQuality] = useState('');
  const [confirming, setConfirming] = useState(false);
  const t = view.template;
  const c = view.consent;
  const active = c?.status === 'ACTIF';

  return (
    <Card className="p-5 sm:p-6">
      <div className="flex items-start gap-4">
        <IconTile icon={<ShieldCheck />} tone={active ? 'green' : 'brand'} size="lg" />
        <div className="min-w-0 flex-1">
          <h2 className="text-lg font-bold text-slate-900">Partager les données de votre ferme avec {view.recipient}</h2>
          <p className="mt-1 text-base text-slate-600">C’est ce qui permet à {view.recipient} d’étudier et de suivre un financement pour votre ferme.</p>
        </div>
      </div>

      {t ? (
        <dl className="mt-5 grid gap-4 text-base sm:grid-cols-2">
          <Fact label="Qui reçoit les données" className="sm:col-span-2">
            {view.recipient}
          </Fact>
          <Fact label="À quoi elles servent" className="sm:col-span-2">
            {t.purpose}
          </Fact>
          <Fact label="Les données concernées" className="sm:col-span-2">
            <ul className="mt-1 list-disc space-y-0.5 pl-5">
              {t.dataCategories.map((d) => (
                <li key={d}>{d}</li>
              ))}
            </ul>
          </Fact>
          <Fact label="Combien de temps elles sont gardées" className="sm:col-span-2">
            {t.retention}
          </Fact>
        </dl>
      ) : null}

      {!t ? (
        <p className="mt-5 flex items-start gap-3 rounded-xl bg-slate-50 px-4 py-3 text-base text-slate-700 ring-1 ring-slate-200">
          <FileWarning className="mt-0.5 h-5 w-5 shrink-0 text-slate-500" aria-hidden />
          {view.recipient} n’a pas encore déposé son modèle de consentement. Vous pourrez donner votre accord dès qu’il sera disponible.
        </p>
      ) : active ? (
        <div className="mt-5 space-y-4">
          <p className="flex items-start gap-3 rounded-xl bg-emerald-50 px-4 py-3 text-base text-emerald-900 ring-1 ring-emerald-200">
            <CheckCircle2 className="mt-0.5 h-5 w-5 shrink-0" aria-hidden />
            <span>
              Vous avez donné votre consentement le <strong>{dateFr(c?.grantedAt)}</strong>
              {c?.templateVersion != null ? ` (modèle, version ${c.templateVersion})` : ''}
              {c?.signerName ? `, signé par ${c.signerName}` : ''}.
            </span>
          </p>
          <TemplateLink farmId={farmId} fileName={t.fileName} />
          {view.canConsent ? (
            <Button tone="secondary" className="min-h-12 px-5 text-base" onClick={() => setConfirming(true)}>
              Retirer mon consentement
            </Button>
          ) : null}
        </div>
      ) : (
        <form
          className="mt-5 space-y-5"
          onSubmit={(e) => {
            e.preventDefault();
            if (!accepted) return;
            give.mutate({ templateId: t.id, signerName: signerName.trim(), signerQuality: signerQuality.trim(), accepted: true });
          }}
        >
          {c?.status === 'RETIRE' ? (
            <p className="rounded-xl bg-amber-50 px-4 py-3 text-base text-amber-900 ring-1 ring-amber-200">
              Vous avez retiré votre consentement le {dateFr(c.withdrawnAt)}. Vous pouvez en donner un nouveau quand vous voulez.
            </p>
          ) : null}
          <TemplateLink farmId={farmId} fileName={t.fileName} />
          {view.canConsent ? (
            <>
              <label className="flex cursor-pointer items-start gap-4 rounded-xl border-2 border-slate-300 bg-white p-4 has-[:checked]:border-brand-600 has-[:checked]:bg-brand-50/40">
                <input type="checkbox" className="mt-1 h-6 w-6 shrink-0 accent-[#206080]" checked={accepted} onChange={(e) => setAccepted(e.target.checked)} />
                <span className="text-base text-slate-900">
                  J’accepte que les données de ma ferme soient partagées avec <strong>{view.recipient}</strong> dans le but suivant :
                  <span className="mt-1 block font-medium">«&nbsp;{t.purpose.trim()}&nbsp;»</span>
                </span>
              </label>
              <div className="grid gap-4 sm:grid-cols-2">
                <Field label="Votre nom">
                  <input className={`${inputCls} min-h-12 text-base`} value={signerName} onChange={(e) => setSignerName(e.target.value)} required maxLength={120} autoComplete="name" />
                </Field>
                <Field label="Votre qualité" hint="Par exemple : propriétaire, gérant.">
                  <input className={`${inputCls} min-h-12 text-base`} value={signerQuality} onChange={(e) => setSignerQuality(e.target.value)} required maxLength={80} />
                </Field>
              </div>
              <ErrorNote error={give.error} />
              <Button type="submit" className="min-h-12 px-6 text-base" busy={give.isPending} disabled={!accepted || !signerName.trim() || !signerQuality.trim()}>
                Donner mon consentement
              </Button>
            </>
          ) : (
            <p className="text-base text-slate-600">Seul le propriétaire ou le gérant de la ferme peut donner ou retirer ce consentement.</p>
          )}
        </form>
      )}
      {active && !view.canConsent ? <p className="mt-3 text-base text-slate-600">Seul le propriétaire ou le gérant de la ferme peut retirer ce consentement.</p> : null}

      {confirming ? (
        <ConfirmModal
          title="Retirer mon consentement ?"
          confirm="Oui, retirer mon consentement"
          tone="danger"
          busy={withdraw.isPending}
          error={withdraw.error}
          onConfirm={() => withdraw.mutate('', { onSuccess: () => setConfirming(false) })}
          onClose={() => setConfirming(false)}
        >
          <ul className="list-disc space-y-2 pl-5 text-base">
            <li>À partir de maintenant, {view.recipient} ne peut plus consulter les données de votre ferme.</li>
            <li>Les documents que vous avez déjà remis pour votre dossier de crédit restent chez {view.recipient}.</li>
            <li>Vous pourrez donner votre consentement de nouveau plus tard.</li>
          </ul>
        </ConfirmModal>
      ) : null}
    </Card>
  );
}

function FileCard({ f, farmId, canFile }: { f: FarmerFile; farmId: string; canFile: boolean }) {
  const next = nextInstalment(f.instalments);
  return (
    <Card className="p-5 sm:p-6">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="font-mono text-xs font-semibold text-slate-500">{f.reference}</p>
          <h3 className="text-lg font-bold text-slate-900">{f.purpose}</h3>
        </div>
        <StatusBadge tone={f.step === 'CLOTURE' ? 'neutral' : 'info'} label={FINANCING_STEP_LABELS[f.step]} />
      </div>
      <p className="mt-1 text-base text-slate-600">{STEP_HINTS[f.step]}</p>

      <dl className="mt-4 grid grid-cols-2 gap-4 text-base sm:grid-cols-4">
        <Fact label="Montant accordé">{fcfa(f.amounts.grantedFcfa)}</Fact>
        <Fact label="Déjà reçu">{fcfa(f.amounts.disbursedFcfa)}</Fact>
        <Fact label="Déjà remboursé">{fcfa(f.amounts.repaidFcfa)}</Fact>
        <Fact label="Reste à rembourser">{fcfa(f.amounts.outstandingFcfa)}</Fact>
      </dl>

      {f.amounts.overdueFcfa > 0 ? (
        <p className="mt-4 rounded-xl bg-red-50 px-4 py-3 text-base text-red-800 ring-1 ring-red-200">
          Un retard de paiement de <strong>{fcfa(f.amounts.overdueFcfa)}</strong> est à régler.
        </p>
      ) : next ? (
        <p className="mt-4 rounded-xl bg-slate-50 px-4 py-3 text-base text-slate-800 ring-1 ring-slate-200">
          Prochaine échéance : <strong>{dateFr(next.dueDate)}</strong>, {fcfa(Math.max(0, next.dueFcfa - next.paidFcfa))} à payer.
        </p>
      ) : null}

      <FarmerDocuments farmId={farmId} file={f} canFile={canFile} />

      {!f.checklist && f.missingDocuments.length > 0 ? (
        <div className="mt-4 rounded-xl bg-amber-50 px-4 py-3 text-base text-amber-900 ring-1 ring-amber-200">
          <p className="font-semibold">Documents à fournir</p>
          <ul className="mt-1 list-disc space-y-0.5 pl-5">
            {f.missingDocuments.map((m) => (
              <li key={m}>{m}</li>
            ))}
          </ul>
        </div>
      ) : null}

      {f.instalments.length > 0 ? (
        <div className="mt-4">
          <h4 className="mb-2 text-base font-semibold text-slate-800">Échéancier</h4>
          <div className="rounded-xl border border-slate-200">
            <DataTable>
              <thead>
                <tr>
                  <Th>Date</Th>
                  <Th className="text-right">À payer</Th>
                  <Th className="text-right">Déjà payé</Th>
                  <Th>État</Th>
                </tr>
              </thead>
              <tbody>
                {f.instalments.map((i) => (
                  <tr key={i.id}>
                    <Td>{dateFr(i.dueDate)}</Td>
                    <Td label="À payer" className="text-right tabular-nums">
                      {fcfa(i.dueFcfa)}
                    </Td>
                    <Td label="Déjà payé" className="text-right tabular-nums">
                      {fcfa(i.paidFcfa)}
                    </Td>
                    <Td label="État">
                      <StatusBadge tone={INSTALMENT_TONES[i.status]} label={INSTALMENT_LABELS[i.status]} />
                    </Td>
                  </tr>
                ))}
              </tbody>
            </DataTable>
          </div>
        </div>
      ) : null}
    </Card>
  );
}

/** The farmer's side of the bank: the consent to share the farm's data, and the credit files of the farm. */
export function FarmFinancingPage() {
  const { farmId, farm } = useFarm();
  const query = useFarmFinancing(farmId);
  const view = query.data;

  if (query.isLoading) return <Loading />;
  if (query.error instanceof ApiError && [401, 403, 404].includes(query.error.status)) return <PageNotOpen />;
  if (!view || !farmId) return <ErrorNote error={query.error ?? 'Financement indisponible.'} onRetry={() => void query.refetch()} />;

  return (
    <div className="mx-auto max-w-3xl space-y-6">
      <PageHeader title="Financement" icon={<Banknote className="h-6 w-6" />} subtitle={farm?.name} />
      <FilingBanner />
      <ConsentCard farmId={farmId} view={view} />
      <section aria-label="Mes dossiers" className="space-y-3">
        <h2 className="text-lg font-bold text-slate-900">Mes dossiers</h2>
        {view.files.length === 0 ? (
          <EmptyState message="Vous n’avez pas de dossier de financement pour le moment. Quand un dossier sera ouvert pour votre ferme, vous le suivrez ici." />
        ) : (
          (view.files as FarmerFile[]).map((f) => <FileCard key={f.id} f={f} farmId={farmId} canFile={(view as { canFile?: boolean }).canFile ?? false} />)
        )}
      </section>
    </div>
  );
}
