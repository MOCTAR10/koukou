import { useMemo, useState } from 'react';
import { keepPreviousData, useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Navigate, useSearchParams } from 'react-router-dom';
import { Ban, ChevronLeft, ChevronRight, Plus, Truck } from 'lucide-react';
import { api } from '../api/client';
import type { DeliveryPage, DeliveryView } from '../api/types-supply';
import { useAuth } from '../auth/AuthContext';
import { useFarm } from '../app/FarmContext';
import { useInstitutionAccess } from '../app/useInstitutionAccess';
import { Button, ErrorNote, Field, inputCls, Modal } from '../components/form';
import { FarmPicker } from '../components/programme/FarmPicker';
import { useProvinces } from '../components/registry/queries';
import { DeliveryDetail, DeliveryStatusPill, supplierOf } from '../components/supply/DeliveryParts';
import { NewDeliveryModal } from '../components/supply/NewDeliveryModal';
import {
  DELIVERY_PAGE_SIZE,
  NO_FILTERS,
  deliveryParamsOf,
  deliveryQueryString,
  hasDeliveryFilter,
  parseDeliveryParams,
  withDeliveryFilter,
  type DeliveryFilters,
} from '../components/supply/deliveryQuery';
import { DELIVERY_STATUS_LABEL, cancelReasonError } from '../components/supply/deliveryRules';
import { programmeDeliveryRights } from '../components/supply/supplyAccess';
import { Card, DataTable, EmptyState, Loading, PageHeader, Td, Th } from '../components/ui';
import { dateFr, fcfa, num } from '../lib/format';

const DETAIL_PARAM = 'livraison';

/**
 * Programme input deliveries (POUFA L4, CDC 17 « Réception des intrants »,
 * DGE side): list of the caller's scope filtered by the server, recording a
 * delivery for a farm, its detail and its cancellation before the farmer
 * confirms it.
 */
export function IntrantsPage() {
  const { user } = useAuth();
  const inst = useInstitutionAccess();
  const rights = programmeDeliveryRights(user?.role, inst.access?.profile);
  const { farms } = useFarm();
  const [params, setParams] = useSearchParams();
  const filters = useMemo(() => parseDeliveryParams(params), [params]);
  const openId = params.get(DETAIL_PARAM);
  const [creating, setCreating] = useState(false);

  const provinces = useProvinces(rights.view);
  const qs = deliveryQueryString(filters);
  const list = useQuery({
    queryKey: ['programme-deliveries', qs],
    queryFn: () => api.get<DeliveryPage>(`/programme/input-deliveries${qs}`),
    placeholderData: keepPreviousData,
    enabled: rights.view,
  });

  const update = (next: DeliveryFilters) => setParams(deliveryParamsOf(next, params), { replace: true });
  const setFilter = <K extends keyof DeliveryFilters>(key: K, value: DeliveryFilters[K]) => update(withDeliveryFilter(filters, key, value));
  const openDetail = (id: string | null) => {
    const next = new URLSearchParams(params);
    if (id) next.set(DETAIL_PARAM, id);
    else next.delete(DETAIL_PARAM);
    setParams(next);
  };

  if (!rights.view) return inst.pending ? <Loading /> : <Navigate to="/app" replace />;

  const data = list.data;
  const pages = data ? Math.max(1, Math.ceil(data.total / data.pageSize)) : 1;

  return (
    <div className="space-y-6">
      <PageHeader
        title="Livraisons d’intrants"
        icon={<Truck />}
        subtitle="Poussins, aliment, vaccins et médicaments livrés aux fermes du programme. L’éleveur confirme ce qu’il a reçu."
        actions={
          rights.record ? (
            <Button onClick={() => setCreating(true)}>
              <Plus className="h-4 w-4" /> Nouvelle livraison
            </Button>
          ) : null
        }
      />

      <Card className="space-y-3 p-4">
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-5">
          <select aria-label="Province" className={inputCls} value={filters.province} onChange={(e) => setFilter('province', e.target.value)}>
            <option value="">Toutes les provinces</option>
            {(provinces.data ?? []).map((p) => (
              <option key={p.code} value={p.code}>
                {p.code} · {p.name}
              </option>
            ))}
          </select>
          <select aria-label="Statut" className={inputCls} value={filters.status} onChange={(e) => setFilter('status', e.target.value as DeliveryFilters['status'])}>
            <option value="">Tous les statuts</option>
            {Object.entries(DELIVERY_STATUS_LABEL).map(([k, v]) => (
              <option key={k} value={k}>
                {v}
              </option>
            ))}
          </select>
          <FarmPicker tone="light" farms={farms} farmId={filters.farmId || null} onPick={(id) => setFilter('farmId', id)} label="Ferme" />
          <input aria-label="Expédiées à partir du" type="date" className={inputCls} value={filters.from} onChange={(e) => setFilter('from', e.target.value)} />
          <input aria-label="Expédiées jusqu’au" type="date" className={inputCls} value={filters.to} onChange={(e) => setFilter('to', e.target.value)} />
        </div>
        {hasDeliveryFilter(filters) ? (
          <button type="button" className="text-xs font-semibold text-brand-700 hover:underline" onClick={() => update(NO_FILTERS)}>
            Effacer les filtres
          </button>
        ) : null}
      </Card>

      <ErrorNote error={list.error} />

      <Card className="overflow-hidden">
        {list.isLoading ? (
          <div className="p-4">
            <Loading label="Chargement des livraisons…" />
          </div>
        ) : !data?.items.length ? (
          <div className="p-4">
            <EmptyState
              icon={<Truck />}
              message={hasDeliveryFilter(filters) ? 'Aucune livraison ne correspond à ces critères.' : 'Aucune livraison enregistrée pour l’instant.'}
            />
          </div>
        ) : (
          <DataTable>
            <thead>
              <tr>
                <Th>Livraison</Th>
                <Th>Ferme</Th>
                <Th className="hidden lg:table-cell">Source</Th>
                <Th>Expédiée</Th>
                <Th>Lignes</Th>
                <Th>Valeur</Th>
                <Th>Statut</Th>
              </tr>
            </thead>
            <tbody>
              {data.items.map((d) => (
                <tr key={d.id} className="cursor-pointer hover:bg-slate-50" onClick={() => openDetail(d.id)}>
                  <Td className="font-mono text-xs font-semibold">
                    <button type="button" className="text-left hover:underline" onClick={() => openDetail(d.id)}>
                      {d.code}
                    </button>
                  </Td>
                  <Td label="Ferme">
                    {d.farm.name}
                    <span className="block text-xs text-slate-500">{[d.farm.code, d.farm.provinceName].filter(Boolean).join(' · ')}</span>
                  </Td>
                  <Td label="Source" className="md:max-lg:hidden">
                    {supplierOf(d)}
                  </Td>
                  <Td label="Expédiée" className="whitespace-nowrap">
                    {dateFr(d.shippedAt)}
                  </Td>
                  <Td label="Lignes" className="tabular-nums">
                    {num(d.lines.length, 0)}
                  </Td>
                  <Td label="Valeur" className="whitespace-nowrap tabular-nums">
                    {fcfa(d.totals.shippedValueFcfa)}
                  </Td>
                  <Td label="Statut">
                    <DeliveryStatusPill status={d.status} discrepancy={d.hasDiscrepancy} />
                  </Td>
                </tr>
              ))}
            </tbody>
          </DataTable>
        )}
        {data && data.total > DELIVERY_PAGE_SIZE ? (
          <div className="flex items-center justify-between border-t border-slate-100 px-4 py-2 text-sm text-slate-500">
            <span>
              {num(data.total, 0)} livraisons · page {filters.page} / {pages}
            </span>
            <span className="flex gap-1">
              <Button tone="secondary" disabled={filters.page <= 1} onClick={() => setFilter('page', filters.page - 1)} aria-label="Page précédente">
                <ChevronLeft className="h-4 w-4" />
              </Button>
              <Button tone="secondary" disabled={filters.page >= pages} onClick={() => setFilter('page', filters.page + 1)} aria-label="Page suivante">
                <ChevronRight className="h-4 w-4" />
              </Button>
            </span>
          </div>
        ) : null}
      </Card>

      {creating ? (
        <NewDeliveryModal
          onClose={() => setCreating(false)}
          onCreated={(d) => {
            setCreating(false);
            openDetail(d.id);
          }}
        />
      ) : null}
      {openId ? <ProgrammeDeliveryPanel id={openId} canCancel={rights.record} onClose={() => openDetail(null)} /> : null}
    </div>
  );
}

function ProgrammeDeliveryPanel({ id, canCancel, onClose }: { id: string; canCancel: boolean; onClose: () => void }) {
  const [cancelling, setCancelling] = useState(false);
  const detail = useQuery({
    queryKey: ['programme-delivery', id],
    queryFn: () => api.getFresh<DeliveryView>(`/programme/input-deliveries/${id}`),
  });
  const d = detail.data;
  return (
    <Modal title={d ? `Livraison ${d.code}` : 'Livraison'} onClose={onClose} side wide>
      {detail.isLoading ? <Loading /> : null}
      <ErrorNote error={detail.error} />
      {d ? (
        <DeliveryDetail
          delivery={d}
          actions={
            canCancel && d.status === 'EXPEDIEE' ? (
              <div className="flex justify-end">
                <Button tone="danger" onClick={() => setCancelling(true)}>
                  <Ban className="h-4 w-4" /> Annuler la livraison
                </Button>
              </div>
            ) : null
          }
        />
      ) : null}
      {cancelling && d ? <CancelDeliveryModal delivery={d} onClose={() => setCancelling(false)} /> : null}
    </Modal>
  );
}

function CancelDeliveryModal({ delivery, onClose }: { delivery: DeliveryView; onClose: () => void }) {
  const qc = useQueryClient();
  const [reason, setReason] = useState('');
  const [touched, setTouched] = useState(false);
  const invalid = cancelReasonError(reason);
  const cancel = useMutation({
    mutationFn: () => api.post<DeliveryView>(`/programme/input-deliveries/${delivery.id}/cancel`, { reason: reason.trim() }),
    onSuccess: (d) => {
      qc.setQueryData(['programme-delivery', d.id], d);
      void qc.invalidateQueries({ queryKey: ['programme-deliveries'] });
      void qc.invalidateQueries({ queryKey: ['input-deliveries', d.farm.id] });
      onClose();
    },
    // 409: the farmer confirmed it meanwhile: show the delivery as it is now.
    onError: () => void qc.invalidateQueries({ queryKey: ['programme-delivery', delivery.id] }),
  });
  return (
    <Modal title={`Annuler la livraison ${delivery.code}`} onClose={onClose}>
      <form
        className="space-y-4"
        onSubmit={(e) => {
          e.preventDefault();
          setTouched(true);
          if (!invalid) cancel.mutate();
        }}
      >
        <p className="text-sm text-slate-600">
          Une livraison se retire tant que l’éleveur ne l’a pas confirmée. L’annulation est définitive et reste dans l’historique.
        </p>
        <Field label="Motif de l’annulation *">
          <textarea className={inputCls} rows={3} value={reason} onChange={(e) => setReason(e.target.value)} />
        </Field>
        {touched && invalid ? <ErrorNote error={invalid} /> : null}
        <ErrorNote error={cancel.error} />
        <div className="flex justify-end gap-2">
          <Button tone="secondary" onClick={onClose}>
            Retour
          </Button>
          <Button tone="danger" type="submit" busy={cancel.isPending}>
            <Ban className="h-4 w-4" /> Annuler la livraison
          </Button>
        </div>
      </form>
    </Modal>
  );
}
