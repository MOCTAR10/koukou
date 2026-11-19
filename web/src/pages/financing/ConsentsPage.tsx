import { useEffect, useState } from 'react';
import { FileSignature, Info, Search, Upload } from 'lucide-react';
import { CONSENT_STATUS_LABELS, type ConsentStatus, type ConsentTemplate } from '../../api/types-financing';
import { useMenuAccess } from '../../app/useMenuAccess';
import { PaperConsentModal, WithdrawConsentModal } from '../../components/financing/ConsentModals';
import { TemplateModal } from '../../components/financing/TemplateModal';
import { farm360Path } from '../../components/financing/financingAccess';
import { currentTemplate, formatBytes, pctText, perimeterText, sharePct, templateHistory } from '../../components/financing/financingLogic';
import { proofUrl, templateFileUrl, useConsentTemplates, useConsents, type ConsentFilters } from '../../components/financing/queries';
import { ConsentBadge, Fact, FarmLink, OpenFileButton, SectionTitle } from '../../components/financing/shared';
import { Button, ErrorNote, inputCls } from '../../components/form';
import { Card, DataTable, EmptyState, PageHeader, SkeletonRows, StatTile, Td, Th } from '../../components/ui';
import { classNames, dateFr } from '../../lib/format';

function TemplateCard({ t, current }: { t: ConsentTemplate; current: boolean }) {
  return (
    <Card className={classNames('p-4 sm:p-5', current && 'ring-1 ring-emerald-200')}>
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">{current ? 'Modèle en vigueur' : `Version ${t.version}`}</p>
          <h3 className="text-base font-bold text-slate-900">
            {t.title} <span className="font-normal text-slate-500">· version {t.version}</span>
          </h3>
          <p className="text-xs text-slate-500">
            Déposé le {dateFr(t.createdAt)}
            {t.createdByName ? ` par ${t.createdByName}` : ''} · {t.fileName} ({formatBytes(t.sizeBytes)})
          </p>
        </div>
        <OpenFileButton path={templateFileUrl(t.id)} label="Lire le document" />
      </div>
      <dl className="mt-4 grid gap-x-6 gap-y-3 sm:grid-cols-2">
        <Fact label="Finalité annoncée à l’exploitant" className="sm:col-span-2">
          {t.purpose}
        </Fact>
        <Fact label="Catégories de données">
          <ul className="mt-1 flex flex-wrap gap-1.5">
            {t.dataCategories.map((c) => (
              <li key={c} className="rounded-full bg-slate-100 px-2.5 py-0.5 text-xs text-slate-800 ring-1 ring-slate-200">
                {c}
              </li>
            ))}
          </ul>
        </Fact>
        <Fact label="Durée de conservation">{t.retention}</Fact>
        <Fact label="Consentements donnés avec cette version">{t.consentCount.toLocaleString('fr-FR')}</Fact>
      </dl>
    </Card>
  );
}

function TemplatesBlock() {
  const { financing } = useMenuAccess();
  const view = useConsentTemplates(financing.view);
  const [adding, setAdding] = useState(false);
  const data = view.data;
  const now = data ? currentTemplate(data.templates) : null;
  const history = data ? templateHistory(data.templates).filter((t) => t.id !== now?.id) : [];
  return (
    <section aria-label="Modèle de consentement" className="space-y-3">
      <SectionTitle
        action={
          financing.validate && data ? (
            <Button onClick={() => setAdding(true)}>
              <Upload className="h-4 w-4" /> Déposer un nouveau modèle
            </Button>
          ) : null
        }
      >
        Modèle de consentement
      </SectionTitle>
      {view.isLoading ? (
        <Card>
          <SkeletonRows rows={4} />
        </Card>
      ) : !data ? (
        <ErrorNote error={view.error} onRetry={() => void view.refetch()} />
      ) : (
        <>
          {now ? (
            <TemplateCard t={now} current />
          ) : (
            <EmptyState
              icon={<FileSignature className="h-6 w-6" />}
              title="Aucun modèle de consentement déposé"
              message="L’exploitant ne peut pas consentir tant que la BCEG n’a pas déposé son modèle : le document qu’il lit et signe pour que la BCEG lise les données de sa ferme."
              action={financing.validate ? <Button onClick={() => setAdding(true)}>Déposer le modèle</Button> : undefined}
            />
          )}
          {history.length > 0 ? (
            <Card className="overflow-hidden">
              <h3 className="px-4 pb-3 pt-4 text-sm font-semibold text-slate-800 sm:px-5">Versions précédentes</h3>
              <DataTable>
                <thead>
                  <tr>
                    <Th>Version</Th>
                    <Th>Déposée le</Th>
                    <Th className="text-right">Consentements</Th>
                    <Th>Document</Th>
                  </tr>
                </thead>
                <tbody>
                  {history.map((t) => (
                    <tr key={t.id}>
                      <Td>
                        Version {t.version} <span className="text-slate-500">· {t.title}</span>
                      </Td>
                      <Td label="Déposée le">{dateFr(t.createdAt)}</Td>
                      <Td label="Consentements" className="text-right tabular-nums">
                        {t.consentCount.toLocaleString('fr-FR')}
                      </Td>
                      <Td label="Document">
                        <OpenFileButton path={templateFileUrl(t.id)} label="Lire" />
                      </Td>
                    </tr>
                  ))}
                </tbody>
              </DataTable>
            </Card>
          ) : null}
        </>
      )}
      {adding && data ? <TemplateModal clauses={data.clauses} onClose={() => setAdding(false)} /> : null}
    </section>
  );
}

function FarmsBlock() {
  const { financing } = useMenuAccess();
  const [status, setStatus] = useState<ConsentFilters['status']>('');
  const [q, setQ] = useState('');
  const [debounced, setDebounced] = useState('');
  useEffect(() => {
    const t = window.setTimeout(() => setDebounced(q.trim()), 300);
    return () => window.clearTimeout(t);
  }, [q]);
  const list = useConsents({ status, q: debounced }, financing.view);
  const [recording, setRecording] = useState<{ farmId: string; farmName: string } | null>(null);
  const [withdrawing, setWithdrawing] = useState<{ farmId: string; farmName: string } | null>(null);
  const cov = list.data?.coverage;

  return (
    <section aria-label="Consentements des exploitants" className="space-y-3">
      <SectionTitle>Consentements des exploitants</SectionTitle>
      {cov ? (
        <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
          <StatTile label="Fermes du périmètre" value={cov.farms.toLocaleString('fr-FR')} />
          <StatTile label="Consentement donné" value={cov.active.toLocaleString('fr-FR')} tone="good" hint={`${pctText(sharePct(cov.active, cov.farms))} des fermes`} />
          <StatTile label="Consentement retiré" value={cov.withdrawn.toLocaleString('fr-FR')} tone={cov.withdrawn > 0 ? 'warn' : 'default'} />
          <StatTile label="Non recueilli" value={cov.none.toLocaleString('fr-FR')} hint="Pas encore de réponse" />
        </div>
      ) : null}
      <Card className="overflow-hidden">
        <div className="grid gap-3 p-3 sm:grid-cols-[minmax(0,2fr)_minmax(0,1fr)] sm:p-4">
          <label className="relative block">
            <span className="sr-only">Rechercher une ferme</span>
            <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" aria-hidden />
            <input type="search" className={classNames(inputCls, 'pl-9')} placeholder="Code, nom de la ferme ou exploitant" value={q} onChange={(e) => setQ(e.target.value)} />
          </label>
          <label className="block">
            <span className="sr-only">État du consentement</span>
            <select className={inputCls} value={status} onChange={(e) => setStatus(e.target.value as ConsentFilters['status'])}>
              <option value="">Tous les états</option>
              {(Object.keys(CONSENT_STATUS_LABELS) as ConsentStatus[]).map((s) => (
                <option key={s} value={s}>
                  {CONSENT_STATUS_LABELS[s]}
                </option>
              ))}
            </select>
          </label>
        </div>
        {list.isLoading ? (
          <SkeletonRows rows={6} />
        ) : !list.data ? (
          <div className="p-4">
            <ErrorNote error={list.error} onRetry={() => void list.refetch()} />
          </div>
        ) : list.data.items.length === 0 ? (
          <div className="p-4">
            <EmptyState message="Aucune ferme ne correspond à cette recherche." />
          </div>
        ) : (
          <DataTable>
            <thead>
              <tr>
                <Th>Ferme</Th>
                <Th>État</Th>
                <Th className="hidden lg:table-cell">Signataire</Th>
                <Th className="hidden lg:table-cell">Donné le</Th>
                <Th className="hidden xl:table-cell">Version</Th>
                <Th>Actions</Th>
              </tr>
            </thead>
            <tbody>
              {list.data.items.map((c) => (
                <tr key={c.id}>
                  <Td>
                    <FarmLink to={farm360Path(c.farmId)}>{c.farmName}</FarmLink>
                    <span className="block font-mono text-xs text-slate-500">{c.farmCode}</span>
                  </Td>
                  <Td label="État">
                    <ConsentBadge value={c.status} />
                    {c.status === 'RETIRE' ? <span className="mt-0.5 block text-xs text-slate-500">le {dateFr(c.withdrawnAt)}</span> : null}
                  </Td>
                  <Td label="Signataire" className="md:max-lg:hidden">
                    {c.signerName ? (
                      <>
                        {c.signerName}
                        {c.signerQuality ? <span className="block text-xs text-slate-500">{c.signerQuality}</span> : null}
                      </>
                    ) : (
                      '—'
                    )}
                  </Td>
                  <Td label="Donné le" className="md:max-lg:hidden">
                    {dateFr(c.grantedAt)}
                    {c.method ? <span className="block text-xs text-slate-500">{c.method === 'EN_LIGNE' ? 'En ligne' : 'Papier'}</span> : null}
                  </Td>
                  <Td label="Version" className="md:max-xl:hidden">
                    {c.templateVersion != null ? `Version ${c.templateVersion}` : '—'}
                  </Td>
                  <Td label="Actions">
                    <span className="flex flex-wrap items-start gap-2">
                      {c.hasProof ? <OpenFileButton path={proofUrl(c.farmId)} label="Preuve" /> : null}
                      {financing.create && c.status !== 'ACTIF' ? (
                        <Button tone="secondary" onClick={() => setRecording({ farmId: c.farmId, farmName: c.farmName })}>
                          Enregistrer
                        </Button>
                      ) : null}
                      {financing.create && c.status === 'ACTIF' ? (
                        <Button tone="secondary" onClick={() => setWithdrawing({ farmId: c.farmId, farmName: c.farmName })}>
                          Retrait
                        </Button>
                      ) : null}
                    </span>
                  </Td>
                </tr>
              ))}
            </tbody>
          </DataTable>
        )}
      </Card>
      {recording ? <PaperConsentModal {...recording} onClose={() => setRecording(null)} /> : null}
      {withdrawing ? <WithdrawConsentModal {...withdrawing} onClose={() => setWithdrawing(null)} /> : null}
    </section>
  );
}

/** The bank's consent template and the consent state of every farm of its perimeter. */
export function ConsentsPage() {
  const { financing } = useMenuAccess();
  const templates = useConsentTemplates(financing.view);
  const perimeter = templates.data ? perimeterText(templates.data.perimeter) : null;
  return (
    <div className="space-y-6">
      <PageHeader
        title="Consentements des exploitants"
        icon={<FileSignature className="h-6 w-6" />}
        subtitle="Le modèle de la BCEG, et ce que chaque exploitant a accepté."
      />
      {perimeter ? (
        <p className="flex items-start gap-2 rounded-lg bg-slate-100/70 px-3 py-2 text-xs text-slate-600">
          <Info className="mt-0.5 h-3.5 w-3.5 shrink-0" aria-hidden />
          <span>
            <span className="font-semibold text-slate-700">Périmètre actuel : {perimeter.title}.</span> {perimeter.meaning} Il se règle dans les paramètres du programme.
          </span>
        </p>
      ) : null}
      <TemplatesBlock />
      <FarmsBlock />
    </div>
  );
}
