import { useState } from 'react';
import { Link } from 'react-router-dom';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import {
  BookMarked,
  Building2,
  Coffee,
  KeyRound,
  LayoutDashboard,
  MapPin,
  Stethoscope,
  Users,
  Wrench,
} from 'lucide-react';
import { api } from '../api/client';
import { exploitantNameOf } from '../api/types';
import type { PlatformFarmRow, PlatformMetrics, PublicUser, ReferenceConstant } from '../api/types';
import { useFarm } from '../app/FarmContext';
import { statusLabelOf, useFarmStatusItems } from '../components/programme/FarmStatusModal';
import { PREPARATION_FAMILY, SUSPENDED_FAMILY } from '../components/programme/farmStatus';
import {
  Card,
  DataTable,
  EmptyState,
  LevelBadge,
  PageHeader,
  SkeletonRows,
  SkeletonTiles,
  StatTile,
  StatusBadge,
  Td,
  Th,
  type StatusTone,
} from '../components/ui';
import { classNames, fcfa, num, plural } from '../lib/format';

const tabs = [
  { id: 'overview', label: "Vue d'ensemble", icon: Building2 },
  { id: 'farms', label: 'Fermes', icon: Building2 },
  { id: 'users', label: 'Utilisateurs', icon: Users },
  { id: 'payment', label: 'Paiements', icon: Coffee },
  { id: 'rules', label: 'Règles', icon: Stethoscope },
  { id: 'constants', label: 'Constantes', icon: Wrench },
];

export function PlatformPage() {
  const queryClient = useQueryClient();
  const [tab, setTab] = useState('overview');
  // `GET /farms` gives the admin every farm with its registry sheet (code, status, exploitant).
  const { farms: sheets } = useFarm();
  const sheetById = new Map(sheets.map((f) => [f.id, f]));
  const statusItems = useFarmStatusItems();
  const provinceRows = provinceRowsOf(sheets);

  const metrics = useQuery({
    queryKey: ['admin-metrics'],
    queryFn: () => api.get<PlatformMetrics>('/admin/metrics'),
  });

  const farms = useQuery({
    queryKey: ['admin-farms'],
    queryFn: () => api.get<PlatformFarmRow[]>('/admin/metrics/by-farm'),
  });

  const users = useQuery({
    queryKey: ['admin-users'],
    queryFn: () => api.get<PublicUser[]>(`/admin/users`),
  });

  const rules = useQuery({
    queryKey: ['admin-rules'],
    queryFn: () => api.get<Array<{ id: string; code: string; isActive: boolean }>>('/admin/rules'),
  });

  const constants = useQuery({
    queryKey: ['reference-constants'],
    queryFn: () => api.get<ReferenceConstant[]>('/reference-constants'),
  });

  const invalidateAll = () => {
    // 'farms' feeds the farm switcher (a renamed or suspended farm).
    const keys = ['admin-metrics', 'admin-farms', 'admin-users', 'reference-constants', 'farms'];
    keys.forEach((k) => void queryClient.invalidateQueries({ queryKey: [k] }));
  };

  const patchFarm = useMutation({
    mutationFn: ({ id, body }: { id: string; body: Record<string, unknown> }) =>
      api.patch(`/admin/farms/${id}`, body),
    onSuccess: invalidateAll,
  });

  const suspendUser = useMutation({
    mutationFn: ({ id, suspended }: { id: string; suspended: boolean }) =>
      api.patch(`/admin/users/${id}/suspend`, { suspended }),
    onSuccess: invalidateAll,
  });

  const patchConstant = useMutation({
    mutationFn: ({ key, value }: { key: string; value: number }) =>
      api.patch(`/reference-constants/${key}`, { value }),
    onSuccess: () => void queryClient.invalidateQueries({ queryKey: ['reference-constants'] }),
  });

  return (
    <div className="space-y-6">
      <PageHeader
        title="Pilotage plateforme"
        icon={<LayoutDashboard />}
        subtitle="Toutes fermes, utilisateurs et configuration globale du programme."
      />

      <div className="flex flex-wrap gap-2">
        {tabs.map((t) => (
          <button
            key={t.id}
            onClick={() => setTab(t.id)}
            className={classNames(
              'flex items-center gap-1.5 rounded-full px-3 py-1.5 text-xs font-semibold',
              tab === t.id
                ? 'bg-slate-900 text-white'
                : 'bg-slate-100 text-slate-600 hover:bg-slate-200',
            )}
          >
            <t.icon className="h-3.5 w-3.5" /> {t.label}
          </button>
        ))}
      </div>

      {tab === 'overview' ? (
        metrics.isLoading ? (
          <SkeletonTiles label="Chargement des métriques…" />
        ) : metrics.data ? (
          <div className="space-y-4">
            <div className="grid grid-cols-2 gap-3 sm:grid-cols-4 xl:grid-cols-6">
              <StatTile label="Fermes" value={`${metrics.data.farms.total}`} hint={`${metrics.data.farms.active} actives`} trend={registeredTrend(farms.data)} to="/app/registre" actionLabel="Ouvrir le registre des fermes" />
              <StatTile label="Utilisateurs" value={`${metrics.data.users.total}`} hint={`${metrics.data.users.suspended} suspendus`} onClick={() => setTab('users')} actionLabel="Voir les utilisateurs" />
              <StatTile label="Lots actifs" value={`${metrics.data.lots.active}`} hint={plural(metrics.data.lots.cheptel, 'tête')} />
              <StatTile label="Ventes" value={`${metrics.data.sales.count}`} hint={fcfa(metrics.data.sales.revenueFcfa)} />
              <StatTile label="Encaissé" value={fcfa(metrics.data.paidFcfa)} hint="paiements confirmés" />
              <StatTile label="Clients" value={`${metrics.data.customersCount}`} />
            </div>
            <div className="grid gap-4 lg:grid-cols-2">
              <Card className="p-4">
                <h2 className="mb-3 flex items-center gap-2 text-sm font-semibold text-slate-700">
                  <MapPin className="h-4 w-4 text-slate-400" /> Fermes par province
                </h2>
                <ProvinceBreakdown rows={provinceRows} />
              </Card>
              <div className="space-y-4">
                <Card className="p-4">
                  <h2 className="mb-3 text-sm font-semibold text-slate-700">Alertes actives par niveau</h2>
                  {metrics.data.alerts.byLevel.length ? (
                    <div className="flex flex-wrap gap-2">
                      {metrics.data.alerts.byLevel.map((l) => (
                        <Link
                          key={l.level}
                          to="/app/alerts"
                          title="Ouvrir les alertes"
                          className="flex items-center gap-2 rounded-lg border border-slate-200 px-3 py-2 hover:border-slate-300 hover:bg-slate-50"
                        >
                          <LevelBadge level={l.level} />
                          <b className="tabular-nums">{l.count}</b>
                        </Link>
                      ))}
                    </div>
                  ) : (
                    <EmptyState message="Aucune alerte active." />
                  )}
                </Card>
                <Card className="p-4">
                  <h2 className="mb-3 text-sm font-semibold text-slate-700">Fermes enregistrées, 6 derniers mois</h2>
                  <MonthlyBars data={farms.data} />
                </Card>
              </div>
            </div>
          </div>
        ) : null
      ) : null}

      {tab === 'farms' ? (
        <div className="space-y-4">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <p className="text-sm text-slate-500">
              Les fermes s’enregistrent au registre du programme ; leur fiche, leur statut (suspension avec motif, ventes bloquées) et
              le compte de l’exploitant se gèrent depuis le registre.
            </p>
            <Link
              to="/app/registre"
              className="inline-flex items-center gap-2 rounded-lg bg-brand-600 px-3.5 py-2 text-sm font-semibold text-white hover:bg-brand-700"
            >
              <BookMarked className="h-4 w-4" /> Registre des fermes
            </Link>
          </div>
          <Card className="overflow-hidden">
            <DataTable>
                <thead className="bg-slate-50">
                  <tr>
                    <Th>Ferme</Th>
                    <Th>Exploitant</Th>
                    <Th>Lots / cheptel</Th>
                    <Th>CA</Th>
                    <Th>Alertes</Th>
                    <Th>Vérif.</Th>
                    <Th>Statut</Th>
                  </tr>
                </thead>
                <tbody>
                  {(farms.data ?? []).map((r) => {
                    const sheet = sheetById.get(r.farm.id);
                    const exploitant = r.owner?.fullName ?? exploitantNameOf(sheet);
                    return (
                    <tr key={r.farm.id} className="border-t border-slate-100">
                      <Td>
                        <Link to={`/app/registre?ferme=${r.farm.id}`} className="font-medium hover:underline">
                          {sheet?.code ? <span className="mr-1.5 font-mono text-xs text-slate-500">{sheet.code}</span> : null}
                          {r.farm.name}
                        </Link>
                        <p className="text-xs text-slate-400">{r.farm.administrativeCity ?? ''}</p>
                      </Td>
                      <Td label="Exploitant">
                        <p>{exploitant ?? '—'}</p>
                        {!r.owner && !sheet?.ownerId ? <p className="text-xs text-slate-400">Compte non activé</p> : null}
                      </Td>
                      <Td label="Lots / cheptel">
                        {plural(r.lots.active, 'lot')} · {plural(r.lots.cheptel, 'tête')}
                      </Td>
                      <Td label="CA">{fcfa(r.sales.revenueFcfa)}</Td>
                      <Td label="Alertes">{r.alertsActive}</Td>
                      <Td label="Vérif.">
                        <button
                          onClick={() =>
                            patchFarm.mutate({
                              id: r.farm.id,
                              body: { isVerified: !r.farm.isVerified },
                            })
                          }
                          title="Basculer la vérification"
                        >
                          <StatusBadge tone={r.farm.isVerified ? 'ok' : 'danger'} label={r.farm.isVerified ? 'Vérifiée' : 'Non vérifiée'} />
                        </button>
                      </Td>
                      <Td label="Statut">
                        {sheet ? (
                          <Link
                            to={`/app/registre?ferme=${r.farm.id}`}
                            title="Ouvrir la fiche au registre (statut, compte, GPS)"
                          >
                            <StatusBadge
                              tone={statusTone(r.farm.active, statusItems.data?.find((i) => i.code === sheet.statusCode)?.family)}
                              label={statusLabelOf(statusItems.data, sheet.statusCode)}
                            />
                          </Link>
                        ) : (
                          <span className="text-xs text-slate-400">{r.farm.active ? 'Active' : 'Suspendue'}</span>
                        )}
                      </Td>
                    </tr>
                    );
                  })}
                  {!farms.data?.length ? (
                    <tr>
                      <Td className="py-8">
                        {farms.isLoading ? (
                          <SkeletonRows rows={4} label="Chargement des fermes…" />
                        ) : (
                          <EmptyState
                            icon={<Building2 />}
                            message="Aucune ferme n’est enregistrée pour l’instant."
                            action={{ label: 'Ouvrir le registre', to: '/app/registre' }}
                          />
                        )}
                      </Td>
                    </tr>
                  ) : null}
                </tbody>
              </DataTable>
          </Card>
        </div>
      ) : null}

      {tab === 'users' ? (
        <Card className="overflow-hidden">
          <DataTable>
              <thead className="bg-slate-50">
                <tr>
                  <Th>Utilisateur</Th>
                  <Th>Contact</Th>
                  <Th>Rôle</Th>
                  <Th>Statut</Th>
                  <Th></Th>
                </tr>
              </thead>
              <tbody>
                {(users.data ?? []).map((u) => (
                  <tr key={u.id} className="border-t border-slate-100">
                    <Td className="font-medium">{u.fullName}</Td>
                    <Td label="Contact">
                      <div>{u.phone}</div>
                      {u.email ? <div className="text-xs text-slate-400">{u.email}</div> : null}
                    </Td>
                    <Td label="Rôle"><StatusBadge status={u.role} /></Td>
                    <Td label="Statut"><StatusBadge status={u.active ? 'active' : 'inactive'} /></Td>
                    <Td>
                      {u.role !== 'PLATFORM_ADMIN' ? (
                        <button
                          onClick={() =>
                            confirm(
                              u.active
                                ? `Suspendre le compte de ${u.fullName} ?`
                                : `Réactiver le compte de ${u.fullName} ?`,
                            ) &&
                            suspendUser.mutate({ id: u.id, suspended: u.active })
                          }
                          className="rounded-full bg-slate-100 px-3 py-1 text-xs font-medium text-slate-700 hover:bg-slate-200"
                        >
                          {u.active ? 'Suspendre' : 'Réactiver'}
                        </button>
                      ) : (
                        <span className="text-xs text-slate-400">Protégé</span>
                      )}
                    </Td>
                  </tr>
                ))}
                {!users.data?.length ? (
                  <tr>
                    <Td className="py-8">
                      <EmptyState message="Aucun utilisateur." />
                    </Td>
                  </tr>
                ) : null}
              </tbody>
            </DataTable>
        </Card>
      ) : null}

      {tab === 'payment' ? (
        <PaymentMethods />
      ) : null}

      {tab === 'rules' ? (
        <Card className="overflow-hidden">
          <DataTable>
              <thead className="bg-slate-50">
                <tr>
                  <Th>Règle</Th>
                  <Th>Code</Th>
                  <Th>Active</Th>
                </tr>
              </thead>
              <tbody>
                {(rules.data ?? []).map((r) => (
                  <tr key={r.id} className="border-t border-slate-100">
                    <Td className="font-medium">{r.id}</Td>
                    <Td label="Code" className="font-mono text-xs">{r.code}</Td>
                    <Td label="Active"><StatusBadge status={r.isActive ? 'active' : 'inactive'} /></Td>
                  </tr>
                ))}
                {!rules.data?.length ? (
                  <tr>
                    <Td className="py-8">
                      <EmptyState message="Aucune règle." />
                    </Td>
                  </tr>
                ) : null}
              </tbody>
            </DataTable>
        </Card>
      ) : null}

      {tab === 'constants' ? (
        <Card className="overflow-hidden">
          <DataTable>
              <thead className="bg-slate-50">
                <tr>
                  <Th>Clé</Th>
                  <Th>Valeur</Th>
                  <Th>Description</Th>
                  <Th></Th>
                </tr>
              </thead>
              <tbody>
                {(constants.data ?? []).map((c) => (
                  <tr key={c.key} className="border-t border-slate-100">
                    <Td className="font-mono text-xs">{c.key}</Td>
                    <Td label="Valeur"><b>{num(c.value)}</b></Td>
                    <Td label="Description" className="text-xs text-slate-400">{c.description ?? '—'}</Td>
                    <Td>
                      {c.isEditable ? (
                        <form
                          className="flex items-center gap-2"
                          onSubmit={(e) => {
                            e.preventDefault();
                            const f = new FormData(e.currentTarget);
                            const v = Number(f.get('v'));
                            if (v > 0) patchConstant.mutate({ key: c.key, value: v });
                          }}
                        >
                          {/* step="any": thresholds such as 0.2 L/oiseau/j are fractional. */}
                          <input
                            type="number"
                            name="v"
                            min={0}
                            step="any"
                            defaultValue={c.value}
                            className="w-28 rounded-lg border border-slate-300 px-2 py-1 text-xs"
                          />
                          <button
                            disabled={patchConstant.isPending}
                            className="rounded bg-slate-900 px-2 py-1 text-xs font-medium text-white hover:bg-slate-700 disabled:opacity-60"
                          >
                            <KeyRound className="h-3.5 w-3.5" />
                          </button>
                        </form>
                      ) : (
                        <span className="text-xs text-slate-400">Non modifiable</span>
                      )}
                      {patchConstant.isError && patchConstant.variables?.key === c.key ? (
                        <p className="mt-1 text-xs text-red-600">{(patchConstant.error as Error).message}</p>
                      ) : null}
                    </Td>
                  </tr>
                ))}
                {!constants.data?.length ? (
                  <tr>
                    <Td className="py-8">
                      <EmptyState message="Aucune constante." />
                    </Td>
                  </tr>
                ) : null}
              </tbody>
            </DataTable>
        </Card>
      ) : null}
    </div>
  );
}

function statusTone(active: boolean, family: string | null | undefined): StatusTone {
  if (!active || family === SUSPENDED_FAMILY) return 'danger';
  if (family === PREPARATION_FAMILY) return 'warning';
  return 'ok';
}

const PROVINCE_NONE = 'Sans province';

/** Farms and active farms per province, most farms first. */
function provinceRowsOf(sheets: Array<{ provinceCode?: string | null; provinceName?: string | null; active?: boolean }>) {
  const map = new Map<string, { label: string; total: number; active: number }>();
  for (const f of sheets) {
    const key = f.provinceCode ?? '';
    const row = map.get(key) ?? { label: key ? `${key} · ${f.provinceName ?? ''}` : PROVINCE_NONE, total: 0, active: 0 };
    row.total += 1;
    if (f.active !== false) row.active += 1;
    map.set(key, row);
  }
  return [...map.values()].sort((x, y) => y.total - x.total);
}

function ProvinceBreakdown({ rows }: { rows: Array<{ label: string; total: number; active: number }> }) {
  const max = Math.max(1, ...rows.map((r) => r.total));
  if (!rows.length) return <EmptyState message="Aucune ferme à répartir." />;
  return (
    <ul className="space-y-2.5">
      {rows.map((r) => (
        <li key={r.label} className="grid grid-cols-[minmax(0,11rem)_1fr_auto] items-center gap-3 text-sm">
          <span className="truncate text-slate-700">{r.label}</span>
          <span className="h-2 overflow-hidden rounded-full bg-slate-100">
            <span className="block h-full rounded-full bg-brand-500" style={{ width: `${(r.total / max) * 100}%` }} />
          </span>
          <span className="tabular-nums text-slate-700">
            <b>{r.total}</b> <span className="text-xs text-slate-500">({r.active} actives)</span>
          </span>
        </li>
      ))}
    </ul>
  );
}

/** Farms created per month over the last six months (including the current one). */
function monthlyCounts(rows: PlatformFarmRow[] | undefined) {
  const now = new Date();
  const months = Array.from({ length: 6 }, (_, i) => {
    const d = new Date(now.getFullYear(), now.getMonth() - (5 - i), 1);
    return { key: `${d.getFullYear()}-${d.getMonth()}`, label: d.toLocaleDateString('fr-FR', { month: 'short' }), count: 0 };
  });
  for (const r of rows ?? []) {
    const d = new Date(r.farm.createdAt);
    const m = months.find((x) => x.key === `${d.getFullYear()}-${d.getMonth()}`);
    if (m) m.count += 1;
  }
  return months;
}

function registeredTrend(rows: PlatformFarmRow[] | undefined) {
  if (!rows) return undefined;
  const m = monthlyCounts(rows);
  const last = m[m.length - 1].count;
  const delta = last - m[m.length - 2].count;
  return `${last} ce mois-ci (${delta >= 0 ? '+' : ''}${delta} vs mois précédent)`;
}

function MonthlyBars({ data }: { data: PlatformFarmRow[] | undefined }) {
  const months = monthlyCounts(data);
  const max = Math.max(1, ...months.map((m) => m.count));
  return (
    <div className="flex h-28 items-end gap-3" role="img" aria-label={`Fermes enregistrées par mois : ${months.map((m) => `${m.label} ${m.count}`).join(', ')}`}>
      {months.map((m) => (
        <div key={m.key} className="flex flex-1 flex-col items-center justify-end gap-1">
          <span className="text-xs font-medium tabular-nums text-slate-700">{m.count}</span>
          <span className="w-full rounded-t bg-brand-500/80" style={{ height: `${Math.max(4, (m.count / max) * 64)}px` }} />
          <span className="text-xs text-slate-500">{m.label}</span>
        </div>
      ))}
    </div>
  );
}

function PaymentMethods() {
  const methods = [
    { code: 'CASH', label: 'Espèces', enabled: true, cash: true },
    { code: 'MOBILE_MONEY', label: 'Mobile Money', enabled: false, cash: false },
    { code: 'QR_CODE', label: 'QR Code', enabled: false, cash: false },
  ];
  return (
    <Card className="overflow-hidden">
      <div className="border-b border-slate-100 px-4 py-3">
        <h2 className="text-sm font-semibold text-slate-700">Méthodes de paiement</h2>
      </div>
      <DataTable>
          <thead className="bg-slate-50">
            <tr>
              <Th>Code</Th>
              <Th>Libellé</Th>
              <Th>Statut</Th>
              <Th></Th>
            </tr>
          </thead>
          <tbody>
            {methods.map((m) => (
              <tr key={m.code} className="border-t border-slate-100">
                <Td className="font-mono">{m.code}</Td>
                <Td label="Libellé">{m.label}</Td>
                <Td label="Statut"><StatusBadge status={m.enabled ? 'active' : 'inactive'} /></Td>
                <Td>
                  {m.cash ? (
                    <span className="text-xs text-slate-400">Non désactivable</span>
                  ) : (
                    <span className="text-xs text-slate-400">Bientôt disponible</span>
                  )}
                </Td>
              </tr>
            ))}
          </tbody>
        </DataTable>
    </Card>
  );
}