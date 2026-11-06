import { useState } from 'react';
import { Link } from 'react-router-dom';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import {
  BookMarked,
  Building2,
  Coffee,
  KeyRound,
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
import { Card, DataTable, EmptyState, LevelBadge, Loading, PageHeader, StatusBadge, Td, Th } from '../components/ui';
import { classNames, fcfa, num } from '../lib/format';

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
        subtitle="Toutes fermes, utilisateurs, configuration globale — Administrateur plateforme."
        actions={
          <span className="rounded-full bg-slate-900 px-3 py-1 text-xs font-semibold text-white">
            Administrateur plateforme
          </span>
        }
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
          <Loading label="Chargement des métriques…" />
        ) : metrics.data ? (
          <div className="space-y-4">
            <div className="grid grid-cols-2 gap-3 sm:grid-cols-4 xl:grid-cols-6">
              <Kpi label="Fermes" value={`${metrics.data.farms.total}`} hint={`${metrics.data.farms.active} actives`} />
              <Kpi label="Utilisateurs" value={`${metrics.data.users.total}`} hint={`${metrics.data.users.suspended} suspendus`} />
              <Kpi label="Lots actifs" value={`${metrics.data.lots.active}`} hint={`${num(metrics.data.lots.cheptel)} têtes`} />
              <Kpi label="Ventes" value={`${metrics.data.sales.count}`} hint={fcfa(metrics.data.sales.revenueFcfa)} />
              <Kpi label="Encaissé" value={fcfa(metrics.data.paidFcfa)} hint="paiements confirmés" />
              <Kpi label="Clients" value={`${metrics.data.customersCount}`} />
            </div>
            <Card className="p-4">
              <h2 className="mb-3 text-sm font-semibold text-slate-700">Alertes actives par niveau</h2>
              {metrics.data.alerts.byLevel.length ? (
                <div className="flex flex-wrap gap-3">
                  {metrics.data.alerts.byLevel.map((l) => (
                    <span key={l.level} className="flex items-center gap-2">
                      <LevelBadge level={l.level} />
                      <b>{l.count}</b>
                    </span>
                  ))}
                </div>
              ) : (
                <EmptyState message="Aucune alerte active." />
              )}
            </Card>
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
                        {r.lots.active} lot(s) · {num(r.lots.cheptel)} têtes
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
                          className="rounded-full px-2 py-0.5 text-xs font-medium"
                          style={{
                            background: r.farm.isVerified ? '#d1fae5' : '#fee2e2',
                            color: r.farm.isVerified ? '#065f46' : '#991b1b',
                          }}
                        >
                          {r.farm.isVerified ? 'Vérifiée' : 'Non vérifiée'}
                        </button>
                      </Td>
                      <Td label="Statut">
                        {sheet ? (
                          <Link
                            to={`/app/registre?ferme=${r.farm.id}`}
                            title="Ouvrir la fiche au registre (statut, compte, GPS)"
                            className={classNames(
                              'rounded-full px-2 py-0.5 text-xs font-medium hover:underline',
                              statusTone(r.farm.active, statusItems.data?.find((i) => i.code === sheet.statusCode)?.family),
                            )}
                          >
                            {statusLabelOf(statusItems.data, sheet.statusCode)}
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
                      <Td className="py-8 text-center text-slate-400">
                        <EmptyState message="Aucune ferme." />
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
                    <Td className="py-8 text-center text-slate-400">
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
                    <Td className="py-8 text-center text-slate-400">
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
                    <Td className="py-8 text-center text-slate-400">
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

function statusTone(active: boolean, family: string | null | undefined): string {
  if (!active || family === SUSPENDED_FAMILY) return 'bg-red-100 text-red-700';
  if (family === PREPARATION_FAMILY) return 'bg-amber-100 text-amber-800';
  return 'bg-emerald-100 text-emerald-700';
}

function Kpi({ label, value, hint }: { label: string; value: string; hint?: string }) {
  return (
    <Card className="p-3">
      <p className="text-[11px] uppercase tracking-wide text-slate-400">{label}</p>
      <p className="mt-0.5 text-lg font-bold text-slate-900">{value}</p>
      {hint ? <p className="text-xs text-slate-400">{hint}</p> : null}
    </Card>
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