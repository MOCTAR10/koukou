import { useMemo, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { ArrowDownWideNarrow, Banknote, Check, Handshake, Search, Star, UserPlus, UserRound, Wallet } from 'lucide-react';
import { api } from '../api/client';
import type { Customer } from '../api/types';
import type { CustomerFull, CustomerSummary } from '../api/types-sales';
import { useFarm } from '../app/FarmContext';
import { useFarmProfile } from '../app/useFarmProfile';
import { ReadOnlyNotice } from '../components/access/ReadOnlyNotice';
import { Button, ErrorNote, inputCls } from '../components/form';
import { Card, DataTable, EmptyState, IconTile, Loading, PageHeader, StatCard, Th, Td } from '../components/ui';
import { CollectModal, CreateCustomerModal, CustomerDetail } from '../components/sales/CustomerPanels';
import { CUSTOMER_TYPE_LABEL, CUSTOMER_TYPES, SEGMENT_LABEL } from '../components/sales/labels';
import { FilterChip } from '../components/sales/shared';
import { dateFr, fcfa, num } from '../lib/format';
import { creditBadges } from '../lib/credit';

type DebtState = 'TOUS' | 'DUES' | 'SOLVES';

export function CustomersPage() {
  const { farmId } = useFarm();
  const queryClient = useQueryClient();
  // POUFA lot A droits: an institution (VENTES:CONSULTER) reads, never writes.
  const canEdit = useFarmProfile().hasPermission('compta:client');
  const [q, setQ] = useState('');
  const [typeFilter, setTypeFilter] = useState('');
  const [segment, setSegment] = useState('');
  const [debtState, setDebtState] = useState<DebtState>('TOUS');
  const [sortKey, setSortKey] = useState<'name' | 'due'>('name');
  const [creating, setCreating] = useState(false);
  const [openId, setOpenId] = useState<string | null>(null);
  const [collect, setCollect] = useState<{ customer: CustomerFull | null } | null>(null);

  const customers = useQuery({
    queryKey: ['customers', farmId],
    queryFn: () => api.get<CustomerFull[]>(`/farms/${farmId}/customers`),
    enabled: !!farmId,
  });
  const summary = useQuery({
    queryKey: ['customers-summary', farmId],
    queryFn: () => api.get<CustomerSummary>(`/farms/${farmId}/customers/summary`),
    enabled: !!farmId,
  });

  const patchType = useMutation({
    mutationFn: ({ id, type }: { id: string; type: string }) =>
      api.patch<Customer>(`/farms/${farmId}/customers/${id}`, { type }),
    onMutate: ({ id, type }) => {
      queryClient.setQueryData<CustomerFull[]>(['customers', farmId], (prev) =>
        (prev ?? []).map((c) => (c.id === id ? { ...c, type } : c)),
      );
    },
    onSettled: () => {
      void queryClient.invalidateQueries({ queryKey: ['customers', farmId] });
      void queryClient.invalidateQueries({ queryKey: ['customers-summary', farmId] });
    },
  });

  const all = useMemo(() => customers.data ?? [], [customers.data]);
  const needle = q.trim().toLowerCase();
  const matching = useMemo(
    () =>
      all.filter((c) => {
        if (typeFilter && c.type !== typeFilter) return false;
        if (segment && c.segment !== segment) return false;
        if (!needle) return true;
        return (
          c.fullName.toLowerCase().includes(needle) ||
          (c.phone ?? '').toLowerCase().includes(needle) ||
          (c.code ?? '').toLowerCase().includes(needle)
        );
      }),
    [all, typeFilter, segment, needle],
  );
  const debtors = matching.filter((c) => (c.balance?.outstandingFcfa ?? 0) > 0).length;

  const rows = useMemo(() => {
    const list = matching.filter((c) => {
      const due = c.balance?.outstandingFcfa ?? 0;
      return debtState === 'TOUS' || (debtState === 'DUES' ? due > 0 : due === 0);
    });
    return list.sort((a, b) =>
      sortKey === 'due'
        ? (b.balance?.outstandingFcfa ?? 0) - (a.balance?.outstandingFcfa ?? 0)
        : a.fullName.localeCompare(b.fullName, 'fr'),
    );
  }, [matching, debtState, sortKey]);

  const s = summary.data;
  const recovered = s && s.totalInvoicedFcfa > 0 ? Math.round(Math.min(1, s.paidFcfa / s.totalInvoicedFcfa) * 100) : null;
  const open = all.find((c) => c.id === openId) ?? null;
  const filtered = !!(needle || typeFilter || segment || debtState !== 'TOUS');

  return (
    <div className="space-y-6">
      <PageHeader
        title="Clients & crédit"
        icon={<Handshake />}
        subtitle="Fiches, codes, soldes, encaissements et historique d’achats."
        actions={
          canEdit ? (
            <>
              <Button tone="secondary" onClick={() => setCollect({ customer: null })}>
                <Banknote className="h-4 w-4" /> Encaisser une dette
              </Button>
              <Button onClick={() => setCreating(true)}>
                <UserPlus className="h-4 w-4" /> Nouveau client
              </Button>
            </>
          ) : undefined
        }
      />
      <ReadOnlyNotice what="clients et créances" />

      <ErrorNote error={customers.error ?? summary.error ?? patchType.error} />

      {s ? (
        <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
          <StatCard label="Portefeuille" value={num(s.total)} hint="clients enregistrés" icon={<UserRound />} />
          <StatCard
            label="À recouvrer"
            icon={<Wallet />}
            value={fcfa(s.totalOutstandingFcfa)}
            hint={`${num(s.debtors)} débiteur(s)`}
            tone={s.totalOutstandingFcfa > 0 ? 'warn' : 'good'}
          />
          <StatCard label="Recouvré" value={recovered != null ? `${recovered} %` : '—'} hint={`${fcfa(s.paidFcfa)} encaissés`} icon={<Banknote />} />
          <StatCard
            label="Segments"
            icon={<Star />}
            value={`${num(s.bySegment.TOP ?? 0)} top`}
            hint={`${num(s.bySegment.REGULIER ?? 0)} réguliers · ${num(s.bySegment.NOUVEAU ?? 0)} nouveaux`}
          />
        </div>
      ) : null}

      <Card className="space-y-3 p-4">
        <div className="flex flex-wrap items-center gap-3">
          <div className="relative min-w-64 flex-1 sm:max-w-sm">
            <Search className="pointer-events-none absolute left-3 top-2.5 h-4 w-4 text-slate-400" />
            <input aria-label="Rechercher par nom, téléphone ou code" value={q} onChange={(e) => setQ(e.target.value)} placeholder="Rechercher par nom, téléphone ou code…" className={`${inputCls} pl-9`} />
          </div>
          <div className="w-56">
            <select aria-label="Type de client" className={inputCls} value={typeFilter} onChange={(e) => setTypeFilter(e.target.value)}>
              <option value="">Tous les types ({num(s?.total ?? all.length)})</option>
              {CUSTOMER_TYPES.filter((t) => (s?.byType[t]?.count ?? 0) > 0).map((t) => (
                <option key={t} value={t}>
                  {CUSTOMER_TYPE_LABEL[t]} ({num(s?.byType[t]?.count ?? 0)})
                </option>
              ))}
            </select>
          </div>
          <button
            type="button"
            onClick={() => setSortKey((k) => (k === 'due' ? 'name' : 'due'))}
            className="ml-auto inline-flex items-center gap-1.5 text-xs font-semibold text-brand-700 hover:underline"
          >
            <ArrowDownWideNarrow className="h-3.5 w-3.5" />
            Tri : {sortKey === 'due' ? 'dû décroissant' : 'nom A à Z'}
          </button>
        </div>
        <div className="flex flex-wrap items-center gap-1.5">
          {(['NOUVEAU', 'REGULIER', 'TOP'] as const).map((k) => (
            <FilterChip
              key={k}
              label={SEGMENT_LABEL[k]!}
              count={s?.bySegment[k] ?? 0}
              active={segment === k}
              onClick={() => setSegment(segment === k ? '' : k)}
            />
          ))}
          <span className="mx-1 h-4 w-px bg-slate-200" />
          <FilterChip label="Tous" count={matching.length} active={debtState === 'TOUS'} onClick={() => setDebtState('TOUS')} />
          <FilterChip label="Débiteurs" count={debtors} active={debtState === 'DUES'} onClick={() => setDebtState(debtState === 'DUES' ? 'TOUS' : 'DUES')} />
          <FilterChip label="Soldés" count={matching.length - debtors} active={debtState === 'SOLVES'} onClick={() => setDebtState(debtState === 'SOLVES' ? 'TOUS' : 'SOLVES')} />
        </div>
      </Card>

      <Card className="overflow-hidden">
        {customers.isLoading ? (
          <div className="p-4">
            <Loading label="Chargement des clients…" />
          </div>
        ) : rows.length === 0 ? (
          <div className="p-4">
            <EmptyState
              icon={<UserRound />}
              message={
                filtered
                  ? 'Aucun client ne correspond à ces critères.'
                  : 'Aucun client enregistré. Le nom et le téléphone saisis à la vente créent la fiche automatiquement.'
              }
            />
          </div>
        ) : (
          <DataTable>
              <thead className="bg-slate-50">
                <tr>
                  <Th>Client</Th>
                  <Th className="hidden lg:table-cell">Code</Th>
                  <Th>Contact</Th>
                  <Th>Type</Th>
                  <Th className="hidden lg:table-cell">Segment</Th>
                  <Th className="text-right">Dû</Th>
                  <Th className="hidden xl:table-cell">Inscrit le</Th>
                  <Th></Th>
                </tr>
              </thead>
              <tbody>
                {rows.map((c) => {
                  const due = c.balance?.outstandingFcfa ?? 0;
                  return (
                    <tr key={c.id} className="border-t border-slate-100">
                      <Td className="font-medium">
                        <span className="flex items-center gap-2.5">
                          <IconTile icon={<UserRound />} size="sm" />
                          <button type="button" className="text-left text-brand-700 hover:underline" onClick={() => setOpenId(c.id)}>
                            {c.fullName}
                          </button>
                          {creditBadges(c).map((b) => (
                            <span
                              key={b.label}
                              title={b.title}
                              className={`whitespace-nowrap rounded-full px-2 py-0.5 text-[11px] font-semibold ${b.tone === 'red' ? 'bg-red-50 text-red-700' : 'bg-amber-50 text-amber-700'}`}
                            >
                              {b.label}
                            </span>
                          ))}
                        </span>
                      </Td>
                      <Td label="Code" className="md:max-lg:hidden">
                        <span className="whitespace-nowrap rounded bg-slate-100 px-1.5 py-0.5 font-mono text-xs text-slate-600">{c.code ?? '—'}</span>
                      </Td>
                      <Td label="Contact">{[c.phone, c.city].filter(Boolean).join(' · ') || '—'}</Td>
                      <Td label="Type">
                        <select
                          aria-label={`Type de ${c.fullName}`}
                          value={c.type}
                          onChange={(e) => patchType.mutate({ id: c.id, type: e.target.value })}
                          disabled={patchType.isPending || !canEdit}
                          title="Catégorie commerciale (indicative)"
                          className="rounded-lg border border-slate-300 bg-white px-2 py-1 text-xs font-medium text-slate-700 outline-none focus:border-brand-500"
                        >
                          {CUSTOMER_TYPES.map((t) => (
                            <option key={t} value={t}>
                              {CUSTOMER_TYPE_LABEL[t]}
                            </option>
                          ))}
                        </select>
                      </Td>
                      <Td label="Segment" className="md:max-lg:hidden">
                        <span className="rounded-full bg-brand-50 px-2.5 py-0.5 text-xs font-medium text-brand-700">
                          {SEGMENT_LABEL[c.segment] ?? '—'}
                        </span>
                      </Td>
                      <Td label="Dû" className="whitespace-nowrap text-right tabular-nums">
                        {due > 0 ? (
                          <span className="font-medium text-red-600">{fcfa(due)}</span>
                        ) : (
                          <span className="inline-flex items-center gap-1 text-emerald-600">
                            <Check className="h-3.5 w-3.5" /> Soldé
                          </span>
                        )}
                      </Td>
                      <Td label="Inscrit le" className="whitespace-nowrap md:max-xl:hidden">{dateFr(c.createdAt)}</Td>
                      <Td className="text-right">
                        {due > 0 && canEdit ? (
                          <Button tone="secondary" className="px-2.5 py-1 text-xs" onClick={() => setCollect({ customer: c })}>
                            <Banknote className="h-3.5 w-3.5" /> Encaisser
                          </Button>
                        ) : null}
                      </Td>
                    </tr>
                  );
                })}
              </tbody>
          </DataTable>
        )}
      </Card>

      <p className="text-xs text-slate-500">
        Le solde = total des ventes non annulées moins les paiements confirmés. Une vente à crédit se décide au point de vente et augmente le solde dû. Le type de client est indicatif ; les segments sont calculés par le serveur.
      </p>

      {creating ? <CreateCustomerModal farmId={farmId} onClose={() => setCreating(false)} /> : null}
      {open ? (
        <CustomerDetail
          farmId={farmId}
          customer={open}
          onCollect={() => {
            setOpenId(null);
            setCollect({ customer: open });
          }}
          onClose={() => setOpenId(null)}
        />
      ) : null}
      {collect ? <CollectModal farmId={farmId} customers={all} initial={collect.customer} onClose={() => setCollect(null)} /> : null}
    </div>
  );
}
