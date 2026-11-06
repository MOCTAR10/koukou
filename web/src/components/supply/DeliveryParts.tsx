import type { ReactNode } from 'react';
import { AlertTriangle } from 'lucide-react';
import type { DeliveryView } from '../../api/types-supply';
import { dateFr, fcfa } from '../../lib/format';
import { FEED_PHASE_LABEL, Note, Pill, type Tone } from '../flock/shared';
import { DataTable, Td, Th } from '../ui';
import { DELIVERY_SOURCE_LABEL, DELIVERY_STATUS_LABEL, INTRANT_FAMILY_LABEL, STATE_SUPPLIER_LABEL, expectedSplit, lineQuantityLabel } from './deliveryRules';

const STATUS_TONE: Record<string, Tone> = { EXPEDIEE: 'amber', CONFIRMEE: 'emerald', ANNULEE: 'slate' };

export function DeliveryStatusPill({ status, discrepancy }: { status: string; discrepancy?: boolean }) {
  return (
    <span className="inline-flex flex-wrap gap-1">
      <Pill tone={STATUS_TONE[status] ?? 'slate'}>{DELIVERY_STATUS_LABEL[status] ?? status}</Pill>
      {discrepancy ? <Pill tone="red">Écart</Pill> : null}
    </span>
  );
}

export function supplierOf(d: Pick<DeliveryView, 'source' | 'supplierName'>): string {
  if (d.supplierName) return d.source === 'ETAT_SMAG' ? `${STATE_SUPPLIER_LABEL} · ${d.supplierName}` : d.supplierName;
  return DELIVERY_SOURCE_LABEL[d.source];
}

function Fact({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div>
      <p className="text-xs text-slate-500">{label}</p>
      <p className="text-sm font-medium text-slate-800">{children}</p>
    </div>
  );
}

/** Body of a delivery's detail (programme and farm side), `actions` below it. */
export function DeliveryDetail({ delivery, actions }: { delivery: DeliveryView; actions?: ReactNode }) {
  const confirmed = delivery.status === 'CONFIRMEE';
  const expected = expectedSplit(delivery);
  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <DeliveryStatusPill status={delivery.status} discrepancy={delivery.hasDiscrepancy} />
        <span className="font-mono text-xs text-slate-500">{delivery.code}</span>
      </div>
      <div className="grid gap-3 sm:grid-cols-2">
        <Fact label="Ferme">
          {delivery.farm.code ? <span className="mr-1 font-mono text-xs text-slate-500">{delivery.farm.code}</span> : null}
          {delivery.farm.name}
          {delivery.farm.provinceName ? <span className="text-slate-500"> · {delivery.farm.provinceName}</span> : null}
        </Fact>
        <Fact label="Bande">{delivery.band ? delivery.band.batchName ?? delivery.band.code ?? '—' : 'Non rattachée'}</Fact>
        <Fact label="Source">{supplierOf(delivery)}</Fact>
        <Fact label="Expédiée le">{dateFr(delivery.shippedAt)}</Fact>
        {delivery.receivedDate ? <Fact label="Reçue le">{dateFr(delivery.receivedDate)}</Fact> : null}
        {delivery.cancelledAt ? <Fact label="Annulée le">{dateFr(delivery.cancelledAt)}</Fact> : null}
      </div>
      {delivery.cancelReason ? <Note tone="slate">Motif de l’annulation : {delivery.cancelReason}</Note> : null}
      {delivery.notes ? <p className="text-sm text-slate-600">{delivery.notes}</p> : null}

      <DataTable>
        <thead>
          <tr>
            <Th>Intrant</Th>
            <Th>Expédié</Th>
            <Th>Reçu</Th>
            <Th>Subvention</Th>
            <Th>Valeur unit.</Th>
            <Th>Lot fournisseur</Th>
          </tr>
        </thead>
        <tbody>
          {delivery.lines.map((l) => (
            <tr key={l.id}>
              <Td className="font-medium">
                {l.intrantLabel ?? l.intrantCode}
                <span className="block text-xs font-normal text-slate-500">
                  {INTRANT_FAMILY_LABEL[l.intrantFamily] ?? l.intrantFamily}
                  {l.feedPhase ? ` · ${FEED_PHASE_LABEL[l.feedPhase] ?? l.feedPhase}` : ''}
                  {l.bagSizeKg ? ` · sac de ${l.bagSizeKg} kg` : ''}
                </span>
              </Td>
              <Td label="Expédié" className="whitespace-nowrap tabular-nums">
                {lineQuantityLabel(l.quantity, l)}
              </Td>
              <Td label="Reçu" className="tabular-nums">
                {l.receivedQuantity == null ? '—' : lineQuantityLabel(l.receivedQuantity, l)}
                {l.discrepancyReason ? (
                  <span className="mt-0.5 flex items-start gap-1 text-xs text-red-700">
                    <AlertTriangle className="mt-0.5 h-3 w-3 shrink-0" /> {l.discrepancyReason}
                  </span>
                ) : null}
              </Td>
              <Td label="Subvention">{l.subsidized ? `${l.subsidyRate ?? 0} %` : 'Non'}</Td>
              <Td label="Valeur unit." className="whitespace-nowrap tabular-nums">
                {l.unitValueFcfa == null ? '—' : fcfa(l.unitValueFcfa)}
              </Td>
              <Td label="Lot fournisseur">
                {l.supplierLotNumber ?? '—'}
                {l.expirationDate ? <span className="block text-xs text-slate-500">péremption {dateFr(l.expirationDate)}</span> : null}
              </Td>
            </tr>
          ))}
        </tbody>
      </DataTable>

      <div className="grid grid-cols-3 gap-3 rounded-xl bg-slate-50 p-3 text-center">
        <div>
          <p className="text-xs text-slate-500">Valeur expédiée</p>
          <p className="font-semibold tabular-nums text-slate-900">{fcfa(delivery.totals.shippedValueFcfa)}</p>
        </div>
        <div>
          <p className="text-xs text-slate-500">{confirmed ? 'Coût éleveur' : 'Coût éleveur prévu'}</p>
          <p className="font-semibold tabular-nums text-slate-900">{fcfa(confirmed ? delivery.totals.farmerCostFcfa : expected.farmerCostFcfa)}</p>
        </div>
        <div>
          <p className="text-xs text-slate-500">{confirmed ? 'Subvention' : 'Subvention prévue'}</p>
          <p className="font-semibold tabular-nums text-emerald-700">{fcfa(confirmed ? delivery.totals.subsidyFcfa : expected.subsidyFcfa)}</p>
        </div>
      </div>
      <p className="text-xs text-slate-400">
        À la confirmation, chaque ligne reçue devient un lot du stock de la ferme ; seul le coût après subvention est passé en dépense, la
        subvention n’est jamais une charge de la ferme.
      </p>
      {actions}
    </div>
  );
}
