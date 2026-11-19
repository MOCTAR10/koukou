import { useState } from 'react';
import { Link } from 'react-router-dom';
import { CalendarClock, Download, FileCheck2, FilePlus2, FileSignature, ListChecks, Wallet } from 'lucide-react';
import { api } from '../../api/client';
import type { PortfolioView } from '../../api/types-financing';
import { useMenuAccess } from '../../app/useMenuAccess';
import { GroupedBarChart, HorizontalBars, StackedShare } from '../../components/Charts';
import { documentsSplit } from '../../components/financing/documentsLogic';
import { Button, ErrorNote } from '../../components/form';
import {
  FINANCING_CONSENTS_PATH,
  FINANCING_FILES_PATH,
  FINANCING_FRAMEWORK_PATH,
  farm360Path,
  filePath,
} from '../../components/financing/financingAccess';
import {
  claimClassColor,
  claimClassLabel,
  daysLateText,
  fcfaCompact,
  monthLabel,
  pctText,
  perimeterText,
  sharePct,
  sortClassBuckets,
} from '../../components/financing/financingLogic';
import { exportUrl, usePortfolio } from '../../components/financing/queries';
import { ClaimClassBadge, FarmLink } from '../../components/financing/shared';
import { Card, DataTable, EmptyState, PageHeader, Skeleton, SkeletonTiles, StatTile, Td, Th } from '../../components/ui';
import { dateFr, fcfa, plural } from '../../lib/format';
import { FINANCING_STEP_LABELS, type FinancingStep } from '../../api/types-financing';

const STEP_COLORS = ['#a8cbdf', '#7badc6', '#4f94be', '#2a789f', '#1b4f6b', '#94a3b8'];

function Panel({ title, note, children, className }: { title: string; note?: string; children: React.ReactNode; className?: string }) {
  return (
    <Card className={`p-4 sm:p-5 ${className ?? ''}`}>
      <h2 className="text-sm font-semibold text-slate-800">{title}</h2>
      {note ? <p className="mt-0.5 text-xs text-slate-500">{note}</p> : null}
      <div className="mt-3">{children}</div>
    </Card>
  );
}

function Progress({ label, value, total, color }: { label: string; value: number; total: number; color: string }) {
  const pct = sharePct(value, total);
  return (
    <div>
      <div className="flex items-baseline justify-between gap-3 text-sm">
        <span className="text-slate-700">{label}</span>
        <span className="tabular-nums text-slate-600">
          <span className="font-semibold text-slate-900">{value.toLocaleString('fr-FR')}</span> sur {total.toLocaleString('fr-FR')} · {pctText(pct, 0)}
        </span>
      </div>
      <div className="mt-1 h-2.5 rounded bg-slate-100" role="progressbar" aria-label={label} aria-valuenow={Math.round(pct)} aria-valuemin={0} aria-valuemax={100}>
        <div className="h-full rounded" style={{ width: `${pct}%`, background: color }} />
      </div>
    </div>
  );
}

/** The three first steps of a bank that has nothing in the tool yet. */
function FirstSteps({ canCreate, canValidate }: { canCreate: boolean; canValidate: boolean }) {
  const steps = [
    {
      icon: <FileSignature className="h-5 w-5" />,
      title: 'Déposer le modèle de consentement',
      text: 'Le document que l’exploitant signe pour que la BCEG lise les données de sa ferme.',
      to: FINANCING_CONSENTS_PATH,
      label: 'Ouvrir les consentements',
      show: true,
    },
    {
      icon: <ListChecks className="h-5 w-5" />,
      title: 'Vérifier la liste des pièces',
      text: 'Les pièces demandées à chaque étape du dossier : vous les ajustez à vos règles.',
      to: FINANCING_FRAMEWORK_PATH,
      label: 'Voir la liste des pièces',
      show: true,
    },
    {
      icon: <FilePlus2 className="h-5 w-5" />,
      title: 'Ouvrir un premier dossier',
      text: 'Choisissez la ferme, l’objet du financement et le montant demandé.',
      to: `${FINANCING_FILES_PATH}?nouveau=1`,
      label: 'Ouvrir un dossier',
      show: canCreate,
    },
  ];
  return (
    <div className="space-y-4">
      <EmptyState
        icon={<Wallet className="h-6 w-6" />}
        title="Aucun dossier de financement pour l’instant"
        message="Le portefeuille se remplit dès le premier dossier. Trois choses à faire pour démarrer, dans cet ordre."
      />
      <ol className="grid gap-3 md:grid-cols-3">
        {steps.map((s, i) => (
          <li key={s.title}>
            <Card className="flex h-full flex-col gap-2 p-4">
              <div className="flex items-center gap-2 text-brand-700">
                <span className="flex h-7 w-7 items-center justify-center rounded-full bg-brand-50 text-sm font-bold">{i + 1}</span>
                {s.icon}
              </div>
              <p className="font-semibold text-slate-900">{s.title}</p>
              <p className="flex-1 text-sm text-slate-600">{s.text}</p>
              {s.show ? (
                <Link to={s.to} className="text-sm font-semibold text-brand-700 hover:underline">
                  {s.label}
                </Link>
              ) : (
                <p className="text-xs text-slate-500">Réservé aux profils qui peuvent créer des dossiers.</p>
              )}
            </Card>
          </li>
        ))}
      </ol>
      {!canValidate ? <p className="text-xs text-slate-500">Le dépôt du modèle de consentement et la liste des pièces se règlent avec le droit « Valider » du domaine Financement.</p> : null}
    </div>
  );
}

function Dashboard({ p }: { p: PortfolioView }) {
  const t = p.totals;
  const riskTone = p.totals.atRiskPct == null ? 'default' : p.totals.atRiskPct >= 10 ? 'bad' : p.totals.atRiskPct > 0 ? 'warn' : 'good';
  const rateTone = t.repaymentRatePct == null ? 'default' : t.repaymentRatePct >= 90 ? 'good' : t.repaymentRatePct >= 70 ? 'warn' : 'bad';
  const classes = sortClassBuckets(p.byClaimClass);
  const totalClassFiles = classes.reduce((n, b) => n + b.files, 0);
  const consentTotal = p.consent.farms;
  const split = documentsSplit(p.documents);
  return (
    <div className="space-y-4">
      <section aria-label="Chiffres clés" className="grid grid-cols-2 gap-3 md:grid-cols-4">
        <StatTile label="Dossiers" value={t.files.toLocaleString('fr-FR')} hint={`${plural(p.farms.withFile, 'ferme')} concernée${p.farms.withFile > 1 ? 's' : ''}`} />
        <StatTile label="Montant accordé" value={fcfaCompact(t.grantedFcfa)} hint={`Demandé : ${fcfaCompact(t.requestedFcfa)}`} />
        <StatTile label="Décaissé" value={fcfaCompact(t.disbursedFcfa)} hint={`${pctText(sharePct(t.disbursedFcfa, t.grantedFcfa), 0)} de l’accordé`} />
        <StatTile label="Encours" value={fcfaCompact(t.outstandingFcfa)} hint="Capital décaissé non remboursé" />
        <StatTile label="Remboursé" value={fcfaCompact(t.repaidFcfa)} tone="good" />
        <StatTile label="Impayés" value={fcfaCompact(t.overdueFcfa)} tone={t.overdueFcfa > 0 ? 'bad' : 'good'} hint={`${p.late.length} dossier${p.late.length > 1 ? 's' : ''} en retard`} />
        <StatTile label="Taux de remboursement" value={pctText(t.repaymentRatePct)} tone={rateTone} hint="Remboursé sur dû à ce jour" />
        <StatTile label="Part à risque" value={pctText(t.atRiskPct)} tone={riskTone} hint="Encours impayé ou douteux sur encours total" />
      </section>

      <div className="grid gap-4 xl:grid-cols-2">
        <Panel title="Dossiers par étape" note="Du dépôt de la demande à la clôture.">
          <HorizontalBars
            rows={p.bySteps.map((b, i) => ({
              key: b.key,
              label: FINANCING_STEP_LABELS[b.key as FinancingStep] ?? b.label,
              value: b.files,
              display: plural(b.files, 'dossier'),
              detail: fcfaCompact(b.amountFcfa),
              color: STEP_COLORS[i % STEP_COLORS.length],
            }))}
          />
        </Panel>
        <Panel title="Dossiers par classe de créance" note="Classement inspiré de la réglementation bancaire de la CEMAC (COBAC R-2018/01).">
          <StackedShare
            ariaLabel="Répartition des dossiers par classe de créance"
            total={totalClassFiles}
            parts={classes.map((b) => ({
              key: b.key,
              label: claimClassLabel(b.key),
              value: b.files,
              color: claimClassColor(b.key),
              detail: `${fcfaCompact(b.amountFcfa)} · ${pctText(sharePct(b.files, totalClassFiles), 0)}`,
            }))}
          />
        </Panel>
      </div>

      <div className="grid gap-4 xl:grid-cols-[minmax(0,3fr)_minmax(0,2fr)]">
        <Panel title="Décaissé, remboursé et échu, sur 12 mois" note="Montants du mois, en FCFA.">
          <GroupedBarChart
            valueFmt={(v) => fcfaCompact(v, false)}
            series={[
              { key: 'disbursed', label: 'Décaissé', color: '#206080' },
              { key: 'repaid', label: 'Remboursé', color: '#059669' },
              { key: 'due', label: 'Échu', color: '#d97706', outline: true },
            ]}
            rows={p.monthly.map((m) => ({
              label: monthLabel(m.month),
              values: { disbursed: m.disbursedFcfa, repaid: m.repaidFcfa, due: m.dueFcfa },
            }))}
          />
        </Panel>
        <Panel title="Par province" note="Nombre de dossiers et montant accordé.">
          <HorizontalBars
            rows={[...p.byProvince]
              .sort((a, b) => b.files - a.files)
              .map((b) => ({ key: b.key, label: b.label, value: b.files, display: plural(b.files, 'dossier'), detail: fcfaCompact(b.amountFcfa) }))}
          />
        </Panel>
      </div>

      <div className="grid items-start gap-4 xl:grid-cols-[minmax(0,3fr)_minmax(0,2fr)]">
        <Card className="overflow-hidden">
          <div className="flex items-center justify-between gap-2 px-4 pt-4 sm:px-5">
            <h2 className="text-sm font-semibold text-slate-800">Dossiers en retard</h2>
            <Link to={`${FINANCING_FILES_PATH}?classe=IMPAYE`} className="text-xs font-semibold text-brand-700 hover:underline">
              Voir les impayés
            </Link>
          </div>
          {p.late.length === 0 ? (
            <p className="px-5 py-8 text-center text-sm text-slate-500">Aucun dossier en retard à cette date.</p>
          ) : (
            <DataTable>
              <thead>
                <tr>
                  <Th>Dossier</Th>
                  <Th className="text-right">Retard</Th>
                  <Th className="text-right">Montant échu</Th>
                  <Th>Classe</Th>
                </tr>
              </thead>
              <tbody>
                {p.late.map((f) => (
                  <tr key={f.id}>
                    <Td>
                      <Link to={filePath(f.id)} className="font-medium text-brand-700 hover:underline">
                        {f.reference}
                      </Link>
                      <span className="block text-xs text-slate-500">
                        {f.farmName}
                        {f.provinceName ? ` · ${f.provinceName}` : ''}
                      </span>
                    </Td>
                    <Td label="Retard" className="text-right tabular-nums">
                      {daysLateText(f.daysLate)}
                    </Td>
                    <Td label="Montant échu" className="text-right font-medium tabular-nums text-red-700">
                      {fcfa(f.amounts.overdueFcfa)}
                    </Td>
                    <Td label="Classe">
                      <ClaimClassBadge value={f.claimClass} />
                    </Td>
                  </tr>
                ))}
              </tbody>
            </DataTable>
          )}
        </Card>

        <div className="space-y-4">
          <Panel title="Échéances à venir">
            {p.upcoming.length === 0 ? (
              <p className="text-sm text-slate-500">Aucune échéance à venir.</p>
            ) : (
              <ul className="divide-y divide-slate-100">
                {p.upcoming.slice(0, 6).map((u, i) => (
                  <li key={`${u.fileId}-${u.dueDate}-${i}`} className="flex items-center gap-3 py-2 text-sm">
                    <CalendarClock className="h-4 w-4 shrink-0 text-slate-400" aria-hidden />
                    <span className="min-w-0 flex-1">
                      <Link to={filePath(u.fileId)} className="font-medium text-slate-800 hover:text-brand-700 hover:underline">
                        {u.farmName}
                      </Link>
                      <span className="block text-xs text-slate-500">{u.reference}</span>
                    </span>
                    <span className="shrink-0 text-right tabular-nums">
                      <span className="block font-medium text-slate-900">{fcfa(u.dueFcfa)}</span>
                      <span className="block text-xs text-slate-500">{dateFr(u.dueDate)}</span>
                    </span>
                  </li>
                ))}
              </ul>
            )}
          </Panel>
          <Panel title="Tranches à débloquer">
            {p.pendingDisbursements.length === 0 ? (
              <p className="text-sm text-slate-500">Aucune tranche en attente.</p>
            ) : (
              <ul className="divide-y divide-slate-100">
                {p.pendingDisbursements.slice(0, 6).map((d) => (
                  <li key={`${d.fileId}-${d.number}`} className="flex items-center gap-3 py-2 text-sm">
                    <span className="min-w-0 flex-1">
                      <Link to={filePath(d.fileId)} className="font-medium text-slate-800 hover:text-brand-700 hover:underline">
                        {d.farmName}
                      </Link>
                      <span className="block text-xs text-slate-500">
                        {d.reference} · tranche {d.number}
                      </span>
                    </span>
                    <span className="shrink-0 text-right tabular-nums">
                      <span className="block font-medium text-slate-900">{fcfa(d.amountFcfa)}</span>
                      <span className="block text-xs text-slate-500">{d.plannedDate ? `prévue le ${dateFr(d.plannedDate)}` : 'sans date'}</span>
                    </span>
                  </li>
                ))}
              </ul>
            )}
          </Panel>
        </div>
      </div>

      <div className="grid gap-4 xl:grid-cols-3">
        <Panel title="Pièces des dossiers" note="Pièces attendues aux étapes atteintes.">
          <div className="space-y-4">
            <Progress label="Pièces fournies" value={p.documents.provided} total={p.documents.expected} color="#2a789f" />
            <Progress label="Pièces validées" value={p.documents.validated} total={p.documents.expected} color="#059669" />
            <dl className="grid grid-cols-2 gap-3 text-sm">
              <div>
                <dt className="text-xs text-slate-500">En attente de l’exploitant</dt>
                <dd className="font-semibold tabular-nums text-slate-900">{plural(split.waitingFarmer, 'pièce')}</dd>
              </div>
              <div>
                <dt className="text-xs text-slate-500">À valider par la BCEG</dt>
                <dd className="font-semibold tabular-nums text-slate-900">{plural(split.toValidate, 'pièce')}</dd>
              </div>
            </dl>
          </div>
        </Panel>
        <Panel title="Consentement des exploitants" note={`${plural(consentTotal, 'ferme')} dans le périmètre.`}>
          <StackedShare
            ariaLabel="Couverture du consentement"
            total={consentTotal}
            parts={[
              { key: 'active', label: 'Consentement donné', value: p.consent.active, color: '#059669', detail: pctText(sharePct(p.consent.active, consentTotal), 0) },
              { key: 'withdrawn', label: 'Consentement retiré', value: p.consent.withdrawn, color: '#d97706', detail: pctText(sharePct(p.consent.withdrawn, consentTotal), 0) },
              { key: 'none', label: 'Non recueilli', value: p.consent.none, color: '#cbd5e1', detail: pctText(sharePct(p.consent.none, consentTotal), 0) },
            ]}
          />
          <Link to={FINANCING_CONSENTS_PATH} className="mt-3 inline-block text-xs font-semibold text-brand-700 hover:underline">
            Gérer les consentements
          </Link>
        </Panel>
        <Panel title="Fermes à surveiller" note="Signaux techniques ou économiques des fermes financées.">
          {p.watchlist.length === 0 ? (
            <p className="flex items-center gap-2 text-sm text-slate-600">
              <FileCheck2 className="h-4 w-4 text-emerald-600" aria-hidden /> Aucune ferme financée ne présente de signal.
            </p>
          ) : (
            <ul className="divide-y divide-slate-100">
              {p.watchlist.slice(0, 6).map((w) => (
                <li key={w.farmId} className="py-2 text-sm">
                  <FarmLink to={farm360Path(w.farmId)}>{w.farmName}</FarmLink>
                  {w.reference ? <span className="ml-2 text-xs text-slate-500">{w.reference}</span> : null}
                  <ul className="mt-0.5 list-disc pl-5 text-xs text-slate-600">
                    {w.reasons.map((r) => (
                      <li key={r}>{r}</li>
                    ))}
                  </ul>
                </li>
              ))}
            </ul>
          )}
        </Panel>
      </div>
    </div>
  );
}

/** The bank's portfolio: what is granted, disbursed, repaid and late, and what to do next. */
export function PortfolioPage() {
  const { financing } = useMenuAccess();
  const query = usePortfolio(financing.view);
  const [exporting, setExporting] = useState(false);
  const [exportError, setExportError] = useState<unknown>(null);
  const p = query.data;

  const exportFile = () => {
    setExporting(true);
    setExportError(null);
    api
      .download(exportUrl, `portefeuille-financement-${p?.asOf ?? 'export'}.xlsx`)
      .catch(setExportError)
      .finally(() => setExporting(false));
  };

  const perimeter = p ? perimeterText(p.perimeter) : null;

  return (
    <div className="space-y-4">
      <PageHeader
        title="Portefeuille de financement"
        icon={<Wallet className="h-6 w-6" />}
        subtitle={p ? `Situation au ${dateFr(p.asOf)}` : undefined}
        actions={
          p && p.totals.files > 0 ? (
            <Button tone="secondary" busy={exporting} onClick={exportFile}>
              <Download className="h-4 w-4" /> Exporter en Excel
            </Button>
          ) : null
        }
      />
      <ErrorNote error={exportError} />
      {query.isLoading ? (
        <div className="space-y-4">
          <SkeletonTiles count={8} />
          <div className="grid gap-4 xl:grid-cols-2">
            <Skeleton className="h-56" />
            <Skeleton className="h-56" />
          </div>
        </div>
      ) : !p ? (
        <ErrorNote error={query.error ?? 'Portefeuille indisponible.'} onRetry={() => void query.refetch()} />
      ) : (
        <>
          {perimeter ? (
            <p className="rounded-lg bg-slate-100/70 px-3 py-2 text-xs text-slate-600">
              <span className="font-semibold text-slate-700">Périmètre : {perimeter.title}.</span> {perimeter.meaning} {plural(p.farms.inScope, 'ferme')} dans le périmètre, dont {p.farms.withFile.toLocaleString('fr-FR')} avec un dossier et {p.farms.financed.toLocaleString('fr-FR')} financée{p.farms.financed > 1 ? 's' : ''}.
            </p>
          ) : null}
          {p.totals.files === 0 ? <FirstSteps canCreate={financing.create} canValidate={financing.validate} /> : <Dashboard p={p} />}
        </>
      )}
    </div>
  );
}
