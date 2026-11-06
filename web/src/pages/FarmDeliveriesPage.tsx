import { useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { Bird, ClipboardList, PackageCheck, Truck } from 'lucide-react';
import type { DeliveryStatus, OpenBandHint } from '../api/types-supply';
import { useAuth } from '../auth/AuthContext';
import { useFarm } from '../app/FarmContext';
import { useFarmProfile } from '../app/useFarmProfile';
import { Note, Tabs } from '../components/flock/shared';
import { Button, ErrorNote, Modal } from '../components/form';
import { ConfirmDeliveryModal } from '../components/supply/ConfirmDeliveryModal';
import { DeclarativeStockPanel } from '../components/supply/DeclarativeStockPanel';
import { DeliveryDetail, DeliveryStatusPill, supplierOf } from '../components/supply/DeliveryParts';
import { OpenBandModal } from '../components/supply/OpenBandModal';
import { pendingFirst } from '../components/supply/confirmRules';
import { DELIVERY_STATUS_LABEL, openBandHintOf } from '../components/supply/deliveryRules';
import { useFarmDeliveries } from '../components/supply/queries';
import { farmDeliveryRights } from '../components/supply/supplyAccess';
import { Card, DataTable, EmptyState, Loading, PageHeader, Td, Th } from '../components/ui';
import { dateFr, fcfa } from '../lib/format';

type TabKey = 'livraisons' | 'declaratif';

/**
 * The farm's programme deliveries (CDC 17-18): what the DGE shipped, the
 * reception to confirm, the band to open after chicks, and the declarative
 * stock. The owner, or a member with `stock:gerer`, confirms; anyone of the
 * farm (and an institution with INTRANTS) reads.
 */
export function FarmDeliveriesPage() {
  const { user } = useAuth();
  const { farmId } = useFarm();
  const { hasPermission } = useFarmProfile();
  const rights = farmDeliveryRights(user?.role, hasPermission);
  const [params, setParams] = useSearchParams();
  const tab: TabKey = params.get('vue') === 'stock' ? 'declaratif' : 'livraisons';
  const [status, setStatus] = useState<DeliveryStatus | ''>('');
  const [openId, setOpenId] = useState<string | null>(null);
  const [confirming, setConfirming] = useState<string | null>(null);
  const [hint, setHint] = useState<OpenBandHint | null>(null);

  const list = useFarmDeliveries(farmId, status);
  const rows = pendingFirst(list.data ?? []);
  const pending = rows.filter((d) => d.status === 'EXPEDIEE').length;
  const open = rows.find((d) => d.id === openId) ?? null;
  const toConfirm = rows.find((d) => d.id === confirming) ?? null;

  const setTab = (t: TabKey) => {
    const next = new URLSearchParams(params);
    if (t === 'declaratif') next.set('vue', 'stock');
    else next.delete('vue');
    setParams(next, { replace: true });
  };

  return (
    <div className="space-y-5">
      <PageHeader
        title="Livraisons d’intrants"
        icon={<Truck />}
        subtitle="Intrants du programme livrés à la ferme : confirmez ce que vous avez reçu, suivez le stock déclaratif."
      />
      <Tabs<TabKey>
        value={tab}
        onChange={setTab}
        options={[
          { key: 'livraisons', label: pending > 0 ? `Livraisons (${pending} à confirmer)` : 'Livraisons', icon: <Truck /> },
          { key: 'declaratif', label: 'Stock déclaratif', icon: <ClipboardList /> },
        ]}
      />

      {tab === 'declaratif' ? <DeclarativeStockPanel /> : null}

      {tab === 'livraisons' ? (
        <>
          <div className="flex flex-wrap gap-2" role="group" aria-label="Statut">
            {(['', 'EXPEDIEE', 'CONFIRMEE', 'ANNULEE'] as const).map((s) => (
              <button
                key={s || 'all'}
                type="button"
                aria-pressed={status === s}
                onClick={() => setStatus(s)}
                className={
                  status === s
                    ? 'rounded-full bg-brand-600 px-3 py-1 text-xs font-semibold text-white'
                    : 'rounded-full bg-white px-3 py-1 text-xs font-semibold text-slate-600 ring-1 ring-slate-200 hover:bg-slate-50'
                }
              >
                {s ? DELIVERY_STATUS_LABEL[s] : 'Toutes'}
              </button>
            ))}
          </div>
          {pending > 0 && rights.confirm ? (
            <Note tone="amber" icon={<PackageCheck />}>
              {pending} livraison{pending > 1 ? 's' : ''} à confirmer : vérifiez les quantités à l’arrivée, puis confirmez la réception.
            </Note>
          ) : null}
          {pending > 0 && !rights.confirm ? (
            <Note tone="slate">La réception est confirmée par l’éleveur (propriétaire ou membre ayant le droit de gérer le stock).</Note>
          ) : null}
          <ErrorNote error={list.error} />
          <Card className="overflow-hidden">
            {list.isLoading ? (
              <div className="p-4">
                <Loading label="Chargement des livraisons…" />
              </div>
            ) : rows.length === 0 ? (
              <div className="p-4">
                <EmptyState icon={<Truck />} message={status ? 'Aucune livraison avec ce statut.' : 'Aucune livraison du programme pour cette ferme.'} />
              </div>
            ) : (
              <DataTable>
                <thead>
                  <tr>
                    <Th>Livraison</Th>
                    <Th>Expédiée</Th>
                    <Th className="hidden lg:table-cell">Source</Th>
                    <Th>Contenu</Th>
                    <Th>Coût éleveur</Th>
                    <Th>Statut</Th>
                    <Th />
                  </tr>
                </thead>
                <tbody>
                  {rows.map((d) => {
                    const bandHint = rights.confirm ? openBandHintOf(d) : null;
                    return (
                      <tr key={d.id} className="cursor-pointer hover:bg-slate-50" onClick={() => setOpenId(d.id)}>
                        <Td className="font-mono text-xs font-semibold">{d.code}</Td>
                        <Td label="Expédiée" className="whitespace-nowrap">
                          {dateFr(d.shippedAt)}
                        </Td>
                        <Td label="Source" className="md:max-lg:hidden">
                          {supplierOf(d)}
                        </Td>
                        <Td label="Contenu">{d.lines.map((l) => l.intrantLabel ?? l.intrantCode).join(', ')}</Td>
                        <Td label="Coût éleveur" className="whitespace-nowrap tabular-nums">
                          {d.totals.farmerCostFcfa == null ? '—' : fcfa(d.totals.farmerCostFcfa)}
                        </Td>
                        <Td label="Statut">
                          <DeliveryStatusPill status={d.status} discrepancy={d.hasDiscrepancy} />
                        </Td>
                        <Td className="text-right" label="Action">
                          {d.status === 'EXPEDIEE' && rights.confirm ? (
                            <Button
                              onClick={(e) => {
                                e.stopPropagation();
                                setConfirming(d.id);
                              }}
                            >
                              <PackageCheck className="h-4 w-4" /> Confirmer
                            </Button>
                          ) : bandHint ? (
                            <Button
                              tone="secondary"
                              onClick={(e) => {
                                e.stopPropagation();
                                setHint(bandHint);
                              }}
                            >
                              <Bird className="h-4 w-4" /> Ouvrir la bande
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
        </>
      ) : null}

      {open ? (
        <Modal title={`Livraison ${open.code}`} onClose={() => setOpenId(null)} side wide>
          <DeliveryDetail
            delivery={open}
            actions={
              <div className="flex flex-wrap justify-end gap-2">
                {open.status === 'EXPEDIEE' && rights.confirm ? (
                  <Button
                    onClick={() => {
                      setOpenId(null);
                      setConfirming(open.id);
                    }}
                  >
                    <PackageCheck className="h-4 w-4" /> Confirmer la réception
                  </Button>
                ) : null}
                {rights.confirm && openBandHintOf(open) ? (
                  <Button
                    tone="secondary"
                    onClick={() => {
                      setOpenId(null);
                      setHint(openBandHintOf(open));
                    }}
                  >
                    <Bird className="h-4 w-4" /> Ouvrir la bande des poussins
                  </Button>
                ) : null}
              </div>
            }
          />
        </Modal>
      ) : null}
      {toConfirm && farmId ? (
        <ConfirmDeliveryModal
          farmId={farmId}
          delivery={toConfirm}
          onClose={() => setConfirming(null)}
          onConfirmed={(h) => {
            setConfirming(null);
            if (h && rights.confirm) setHint(h);
          }}
        />
      ) : null}
      {hint && farmId ? <OpenBandModal farmId={farmId} hint={hint} canOpen={rights.openBand} onClose={() => setHint(null)} /> : null}
    </div>
  );
}
