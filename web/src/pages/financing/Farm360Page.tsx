import { lazy, Suspense, useEffect, type ReactNode } from 'react';
import { Link, useLocation, useParams } from 'react-router-dom';
import { ArrowLeft, Bird, FileSpreadsheet, HandCoins, ScanEye, ShieldAlert, Sprout, TrendingUp } from 'lucide-react';
import { ApiError } from '../../api/client';
import { useMenuAccess } from '../../app/useMenuAccess';
import { PageNotOpen } from '../../components/access/PageNotOpen';
import { GroupedBarChart, LineChart } from '../../components/Charts';
import { FinancialsBlock } from '../../components/financing/FinancialsBlock';
import { FINANCING_FILES_PATH, filePath } from '../../components/financing/financingAccess';
import { BAND_STATUS_TONES } from '../../components/financing/financialsLogic';
import { fcfaCompact, monthLabel, pctText, daysLateText } from '../../components/financing/financingLogic';
import { useFarm360 } from '../../components/financing/queries';
import { ClaimClassBadge, ConsentBadge, StepBadge } from '../../components/financing/shared';
import { ErrorNote } from '../../components/form';
import { AlertLevelBadge } from '../../components/sales/shared';
import { Card, DataTable, PageHeader, Skeleton, SkeletonTiles, StatTile, StatusBadge, Td, Th } from '../../components/ui';
import { dateFr, fcfa, num, plural, statusLabel } from '../../lib/format';

const FarmMiniMap = lazy(() => import('../../components/financing/FarmMiniMap'));

function Block({ title, icon, children, closed, id }: { title: string; icon: ReactNode; children?: ReactNode; closed?: boolean; id?: string }) {
  return (
    <section aria-label={title} id={id} className="scroll-mt-20 space-y-3">
      <h2 className="flex items-center gap-2 text-base font-semibold text-slate-900">
        <span className="text-brand-700" aria-hidden>
          {icon}
        </span>
        {title}
      </h2>
      {closed ? <p className="rounded-lg bg-slate-100/70 px-3 py-2 text-sm text-slate-600">Ce bloc n’est pas ouvert à votre profil.</p> : children}
    </section>
  );
}

/** One farm seen by the bank: identity, production, economy, support, alerts and its financing, block by block. */
export function Farm360Page() {
  const { farmId = '' } = useParams();
  const { financing } = useMenuAccess();
  const query = useFarm360(farmId);
  const d = query.data;
  const { hash } = useLocation();
  useEffect(() => {
    if (d && hash) document.getElementById(hash.slice(1))?.scrollIntoView({ block: 'start' });
  }, [d, hash]);

  if (!financing.view) return <PageNotOpen />;

  const denied = query.error instanceof ApiError && query.error.status === 403;
  if (denied) {
    return (
      <PageNotOpen
        title="Cette ferme n’est pas dans votre périmètre"
        reason={`${query.error instanceof ApiError ? query.error.message : ''} Vous ne consultez que les fermes que la BCEG finance, selon le périmètre réglé dans les paramètres du programme.`.trim()}
      />
    );
  }

  return (
    <div className="space-y-6">
      <Link to={FINANCING_FILES_PATH} className="inline-flex items-center gap-1 text-sm font-medium text-brand-700 hover:underline">
        <ArrowLeft className="h-4 w-4" /> Retour aux dossiers
      </Link>
      {query.isLoading ? (
        <div className="space-y-4">
          <Skeleton className="h-28" />
          <SkeletonTiles count={6} />
        </div>
      ) : !d ? (
        <ErrorNote error={query.error ?? 'Ferme introuvable.'} onRetry={() => void query.refetch()} />
      ) : (
        <>
          <Card className="p-4 sm:p-5">
            <div className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_20rem]">
              <div className="min-w-0">
                <PageHeader title={d.farm.name} icon={<ScanEye className="h-6 w-6" />} subtitle={`${d.farm.code}${d.farm.provinceName ? ` · ${d.farm.provinceName}` : ''}${d.farm.locality ? `, ${d.farm.locality}` : ''}`} />
                <dl className="grid grid-cols-2 gap-x-4 gap-y-3 sm:grid-cols-3">
                  <Item label="Exploitant">{d.farm.exploitantName}</Item>
                  <Item label="Téléphone">{d.farm.exploitantPhone}</Item>
                  <Item label="Statut">{d.farm.statusLabel ? <StatusBadge tone="ok" label={d.farm.statusLabel} /> : null}</Item>
                  <Item label="Classe de biosécurité">{d.farm.biosecurityClass}</Item>
                  <Item label="Capacité">{d.farm.capacityPlaces != null ? `${d.farm.capacityPlaces.toLocaleString('fr-FR')} places` : null}</Item>
                  <Item label="Dernière visite">{d.farm.lastVisitOn ? dateFr(d.farm.lastVisitOn) : null}</Item>
                  <Item label="Cohorte">{d.farm.cohortLabel}</Item>
                </dl>
              </div>
              {d.farm.latitude != null && d.farm.longitude != null ? (
                <Suspense fallback={<Skeleton className="h-44" />}>
                  <FarmMiniMap latitude={d.farm.latitude} longitude={d.farm.longitude} label={d.farm.name} />
                </Suspense>
              ) : null}
            </div>
          </Card>

          <Block title="Production" icon={<Bird className="h-5 w-5" />} closed={d.production === null}>
            {d.production ? (
              <div className="space-y-4">
                <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
                  <StatTile label="Bandes ouvertes" value={d.production.openBands.toLocaleString('fr-FR')} hint={`Dernière saisie : ${d.production.lastEntryOn ? dateFr(d.production.lastEntryOn) : '—'}`} />
                  <StatTile label="Oiseaux présents" value={d.production.birdsPresent.toLocaleString('fr-FR')} hint={`Occupation : ${pctText(d.production.occupancyPct, 0)}`} />
                  <StatTile label="Mortalité" value={pctText(d.production.mortalityPct)} tone={d.production.mortalityPct != null && d.production.mortalityPct >= 5 ? 'bad' : 'default'} />
                  <StatTile label="Indice de consommation" value={num(d.production.feedConversion, 2)} hint={`Poids moyen : ${d.production.avgWeightG != null ? `${num(d.production.avgWeightG, 0)} g` : '—'}`} />
                </div>
                <div className="grid gap-4 xl:grid-cols-[minmax(0,2fr)_minmax(0,3fr)]">
                  <Card className="p-4">
                    <h3 className="text-sm font-semibold text-slate-800">Mortalité par semaine</h3>
                    <p className="text-xs text-slate-500">12 dernières semaines, en %.</p>
                    <LineChart
                      data={d.production.mortalityTrend.map((p) => p.value)}
                      labels={d.production.mortalityTrend.map((p) => p.label)}
                      valueFmt={(v) => `${num(v, 1)} %`}
                      color="#dc2626"
                      height={170}
                    />
                  </Card>
                  <Card className="overflow-hidden">
                    <h3 className="px-4 pt-4 text-sm font-semibold text-slate-800">Bandes ouvertes</h3>
                    {d.production.bands.length === 0 ? (
                      <p className="px-4 py-6 text-sm text-slate-500">Aucune bande ouverte.</p>
                    ) : (
                      <DataTable>
                        <thead>
                          <tr>
                            <Th>Bande</Th>
                            <Th className="text-right">Âge</Th>
                            <Th className="text-right">Oiseaux</Th>
                            <Th className="text-right">Mortalité</Th>
                            <Th>Statut</Th>
                          </tr>
                        </thead>
                        <tbody>
                          {d.production.bands.map((b) => (
                            <tr key={b.id}>
                              <Td>
                                <span className="font-medium text-slate-900">{b.name}</span>
                                <span className="block text-xs text-slate-500">{b.type}</span>
                              </Td>
                              <Td label="Âge" className="text-right tabular-nums">
                                {b.ageDays} j
                              </Td>
                              <Td label="Oiseaux" className="text-right tabular-nums">
                                {b.birds.toLocaleString('fr-FR')}
                              </Td>
                              <Td label="Mortalité" className="text-right tabular-nums">
                                {pctText(b.mortalityPct)}
                              </Td>
                              <Td label="Statut">
                                <StatusBadge tone={BAND_STATUS_TONES[b.status] ?? 'neutral'} label={statusLabel(b.status)} />
                              </Td>
                            </tr>
                          ))}
                        </tbody>
                      </DataTable>
                    )}
                  </Card>
                </div>
              </div>
            ) : null}
          </Block>

          <Block title="Économie" icon={<TrendingUp className="h-5 w-5" />} closed={d.economics === null}>
            {d.economics ? (
              <div className="space-y-4">
                <div className="grid grid-cols-1 gap-3 min-[480px]:grid-cols-2 md:grid-cols-4">
                  <StatTile label="Ventes" value={fcfaCompact(d.economics.salesFcfa)} hint={d.economics.periodLabel} />
                  <StatTile label="Charges" value={fcfaCompact(d.economics.expensesFcfa)} hint={d.economics.periodLabel} />
                  <StatTile
                    label="Marge"
                    value={fcfaCompact(d.economics.marginFcfa)}
                    tone={d.economics.marginFcfa < 0 ? 'bad' : 'good'}
                    hint={`Taux de marge : ${pctText(d.economics.marginRatePct)}`}
                  />
                  <StatTile label="Créances clients" value={fcfaCompact(d.economics.receivablesFcfa)} hint={`Encaissé : ${fcfaCompact(d.economics.collectedFcfa)}`} />
                </div>
                <Card className="p-4">
                  <h3 className="text-sm font-semibold text-slate-800">Ventes et charges par mois</h3>
                  <div className="mt-2">
                    <GroupedBarChart
                      height={200}
                      valueFmt={(v) => fcfaCompact(v, false)}
                      series={[
                        { key: 'sales', label: 'Ventes', color: '#059669' },
                        { key: 'expenses', label: 'Charges', color: '#d97706', outline: true },
                      ]}
                      rows={d.economics.monthly.map((m) => ({ label: monthLabel(m.month), values: { sales: m.salesFcfa, expenses: m.expensesFcfa } }))}
                    />
                  </div>
                </Card>
              </div>
            ) : null}
          </Block>

          <Block id="etats-financiers" title="États financiers" icon={<FileSpreadsheet className="h-5 w-5" />} closed={!financing.financials}>
            <FinancialsBlock farmId={farmId} farmCode={d.farm.code} />
          </Block>

          <div className="grid gap-6 xl:grid-cols-2">
            <Block title="Appui du programme" icon={<Sprout className="h-5 w-5" />} closed={d.support === null}>
              {d.support ? (
                <div className="grid grid-cols-1 gap-3 min-[480px]:grid-cols-3">
                  <StatTile label="Livraisons reçues" value={d.support.deliveries.toLocaleString('fr-FR')} hint={`Dernière : ${d.support.lastDeliveryOn ? dateFr(d.support.lastDeliveryOn) : '—'}`} />
                  <StatTile label="Valeur" value={fcfaCompact(d.support.valueFcfa)} />
                  <StatTile label="Dont subvention" value={fcfaCompact(d.support.subsidyFcfa)} />
                </div>
              ) : null}
            </Block>
            <Block title="Alertes" icon={<ShieldAlert className="h-5 w-5" />} closed={d.alerts === null}>
              {d.alerts ? (
                d.alerts.items.length === 0 ? (
                  <p className="text-sm text-slate-600">Aucune alerte ouverte.</p>
                ) : (
                  <Card className="p-4">
                    <p className="mb-2 text-sm text-slate-600">
                      {plural(d.alerts.open, 'alerte ouverte', 'alertes ouvertes')}
                      {d.alerts.sanitaryOpen > 0 ? `, dont ${d.alerts.sanitaryOpen} sanitaire${d.alerts.sanitaryOpen > 1 ? 's' : ''}` : ''}.
                    </p>
                    <ul className="divide-y divide-slate-100">
                      {d.alerts.items.map((a, i) => (
                        <li key={`${a.label}-${i}`} className="flex items-center gap-3 py-2 text-sm">
                          <AlertLevelBadge level={a.level} />
                          <span className="min-w-0 flex-1 text-slate-800">{a.label}</span>
                          <span className="shrink-0 text-xs text-slate-500">depuis le {dateFr(a.since)}</span>
                        </li>
                      ))}
                    </ul>
                  </Card>
                )
              ) : null}
            </Block>
          </div>

          <Block title="Financement" icon={<HandCoins className="h-5 w-5" />}>
            <div className="space-y-3">
              <div className="flex flex-wrap items-center gap-3 text-sm text-slate-700">
                <span className="inline-flex items-center gap-2">
                  Consentement : <ConsentBadge value={d.financing.consent?.status ?? 'AUCUN'} />
                  {d.financing.consent?.grantedAt ? <span className="text-xs text-slate-500">donné le {dateFr(d.financing.consent.grantedAt)}</span> : null}
                </span>
              </div>
              {d.financing.debtServiceToMarginPct != null ? (
                <Card className="p-4">
                  <p className="text-sm font-semibold text-slate-800">Service de la dette sur marge</p>
                  <p className={`mt-1 text-2xl font-bold tabular-nums ${d.financing.debtServiceToMarginPct > 100 ? 'text-red-700' : 'text-slate-900'}`}>
                    {pctText(d.financing.debtServiceToMarginPct, 0)}
                  </p>
                  <p className="text-xs text-slate-500">
                    Remboursements de l’année rapportés à la marge de la période.{' '}
                    {d.financing.debtServiceToMarginPct > 100 ? 'La marge de la période ne couvre pas les échéances.' : 'La marge de la période couvre les échéances.'}
                  </p>
                </Card>
              ) : null}
              {d.financing.files.length === 0 ? (
                <p className="text-sm text-slate-600">Aucun dossier de financement pour cette ferme.</p>
              ) : (
                <Card className="overflow-hidden">
                  <DataTable>
                    <thead>
                      <tr>
                        <Th>Dossier</Th>
                        <Th>Étape</Th>
                        <Th>Classe</Th>
                        <Th className="text-right">Accordé</Th>
                        <Th className="text-right">Remboursé</Th>
                        <Th className="text-right">Encours</Th>
                        <Th className="text-right">Retard</Th>
                      </tr>
                    </thead>
                    <tbody>
                      {d.financing.files.map((f) => (
                        <tr key={f.id}>
                          <Td>
                            <Link to={filePath(f.id)} className="font-medium text-brand-700 hover:underline">
                              {f.reference}
                            </Link>
                            <span className="block text-xs text-slate-500">{f.purpose}</span>
                          </Td>
                          <Td label="Étape">
                            <StepBadge step={f.step} decision={f.decision} />
                          </Td>
                          <Td label="Classe">
                            <ClaimClassBadge value={f.claimClass} />
                          </Td>
                          <Td label="Accordé" className="text-right tabular-nums">
                            {fcfa(f.amounts.grantedFcfa)}
                          </Td>
                          <Td label="Remboursé" className="text-right tabular-nums">
                            {fcfa(f.amounts.repaidFcfa)}
                          </Td>
                          <Td label="Encours" className="text-right tabular-nums">
                            {fcfa(f.amounts.outstandingFcfa)}
                          </Td>
                          <Td label="Retard" className="text-right tabular-nums">
                            {daysLateText(f.daysLate)}
                          </Td>
                        </tr>
                      ))}
                    </tbody>
                  </DataTable>
                </Card>
              )}
            </div>
          </Block>
        </>
      )}
    </div>
  );
}

function Item({ label, children }: { label: string; children?: ReactNode }) {
  return (
    <div className="min-w-0">
      <dt className="text-xs text-slate-500">{label}</dt>
      <dd className="truncate text-sm text-slate-900">{children == null || children === '' ? '—' : children}</dd>
    </div>
  );
}
