import { useState } from 'react';
import { QrCode } from 'lucide-react';
import type { LotView } from '../../api/types-trace';
import { useFarm } from '../../app/FarmContext';
import { classNames, dateFr, num } from '../../lib/format';
import { SectionCard } from '../flock/shared';
import { ErrorNote } from '../form';
import { DataTable, EmptyState, Loading, Td, Th } from '../ui';
import { LotHistoryPanel, LotStatusPill } from './LotHistoryView';
import { useFarmLots } from './queries';
import { LOT_KIND_LABEL, lotsTree } from './traceLabels';

/** Traceability lots: of one band (lot detail tab) or of the whole farm. */
export function FarmLotsTable({ batchId }: { batchId?: string }) {
  const { farmId } = useFarm();
  const lots = useFarmLots(farmId, batchId);
  const [openId, setOpenId] = useState<string | null>(null);
  const rows = lotsTree(lots.data ?? []);
  return (
    <>
      {lots.isLoading ? (
        <div className="p-4">
          <Loading label="Chargement des lots…" />
        </div>
      ) : null}
      <ErrorNote error={lots.error} />
      {lots.data && rows.length === 0 ? (
        <div className="p-4">
          <EmptyState icon={<QrCode />} message="Aucun lot de traçabilité : le lot d’une bande se crée à son ouverture." />
        </div>
      ) : null}
      {rows.length > 0 ? (
        <DataTable>
          <thead>
            <tr>
              <Th>Lot</Th>
              {batchId ? null : <Th>Bande</Th>}
              <Th>Nature</Th>
              <Th>Quantité</Th>
              <Th>Destinataire</Th>
              <Th>Statut</Th>
            </tr>
          </thead>
          <tbody>
            {rows.map(({ lot, depth }) => (
              <LotRow key={lot.id} lot={lot} depth={depth} showBand={!batchId} onOpen={() => setOpenId(lot.id)} />
            ))}
          </tbody>
        </DataTable>
      ) : null}
      {openId && farmId ? <LotHistoryPanel farmId={farmId} lotId={openId} onOpenLot={setOpenId} onClose={() => setOpenId(null)} /> : null}
    </>
  );
}

function LotRow({ lot, depth, showBand, onOpen }: { lot: LotView; depth: 0 | 1; showBand: boolean; onOpen: () => void }) {
  return (
    <tr className="cursor-pointer hover:bg-slate-50" onClick={onOpen}>
      <Td className={classNames('font-mono text-xs font-semibold', depth === 1 && 'md:pl-8')}>
        <button type="button" className="text-left hover:underline" onClick={onOpen}>
          {depth === 1 ? '↳ ' : ''}
          {lot.code}
        </button>
      </Td>
      {showBand ? <Td label="Bande">{lot.bandeCode ?? '—'}</Td> : null}
      <Td label="Nature">{LOT_KIND_LABEL[lot.kind] ?? lot.kind}</Td>
      <Td label="Quantité" className="whitespace-nowrap tabular-nums">
        {num(lot.quantity, 0)} sujets
      </Td>
      <Td label="Destinataire">
        {lot.operator ? `${lot.operator.name} (${lot.operator.typeLabel ?? lot.operator.typeCode})` : '—'}
        {lot.cededOn ? <span className="block text-xs text-slate-500">le {dateFr(lot.cededOn)}</span> : null}
      </Td>
      <Td label="Statut">
        <LotStatusPill lot={lot} />
      </Td>
    </tr>
  );
}

/** The lot detail's « Traçabilité » tab: the band's root lot and the sub-lots ceded to operators. */
export function LotTraceTab({ batchId }: { batchId: string }) {
  return (
    <SectionCard
      title="Traçabilité de la bande"
      subtitle="Lot de la bande et sous-lots cédés aux opérateurs, avec leur étiquette QR"
      icon={<QrCode />}
      flush
    >
      <FarmLotsTable batchId={batchId} />
      <p className="px-4 py-3 text-xs text-slate-500">
        Une sortie vers un opérateur du programme (abattoir, acheteur, distributeur…) crée un sous-lot cédé. Le QR code indique l’origine du
        produit ; il ne constitue pas un certificat sanitaire.
      </p>
    </SectionCard>
  );
}
