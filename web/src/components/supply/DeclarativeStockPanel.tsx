import { AlertTriangle, ClipboardList } from 'lucide-react';
import { useFarm } from '../../app/FarmContext';
import { classNames, dateFr } from '../../lib/format';
import { FEED_PHASE_LABEL, Note, SectionCard } from '../flock/shared';
import { ErrorNote } from '../form';
import { DataTable, EmptyState, Loading, Td, Th } from '../ui';
import { declarativeSummary, physicalGap, sortDeclarativeRows, stockFigure, stockTone, stockUnitLabel } from './declarative';
import { INTRANT_FAMILY_LABEL } from './deliveryRules';
import { useDeclarativeStock } from './queries';

/**
 * Declarative stock (CDC 18 « Utilisation et stock »): received on the
 * confirmed programme deliveries − used, per intrant, beside the physical FEFO
 * stock left on the delivery lots. Negative rows are highlighted (the server
 * raises the advisory « stock négatif » alert, never blocking).
 */
export function DeclarativeStockPanel() {
  const { farmId } = useFarm();
  const stock = useDeclarativeStock(farmId);
  const rows = sortDeclarativeRows(stock.data?.rows ?? []);
  return (
    <SectionCard
      title="Stock déclaratif des intrants du programme"
      subtitle="Reçu (livraisons confirmées) − utilisé (saisies, pertes, ventes, soins), à côté du stock physique"
      icon={<ClipboardList />}
      flush
    >
      <div className="space-y-3 p-4">
        {stock.isLoading ? <Loading label="Calcul du stock déclaratif…" /> : null}
        <ErrorNote error={stock.error} />
        {stock.data ? (
          <Note tone={stock.data.negative ? 'red' : 'slate'} icon={stock.data.negative ? <AlertTriangle /> : undefined}>
            {declarativeSummary(rows)}
          </Note>
        ) : null}
      </div>
      {stock.data && rows.length === 0 ? (
        <div className="px-4 pb-4">
          <EmptyState icon={<ClipboardList />} message="Le stock déclaratif se remplit à la confirmation des livraisons du programme." />
        </div>
      ) : null}
      {rows.length > 0 ? (
        <DataTable>
          <thead>
            <tr>
              <Th>Intrant</Th>
              <Th>Reçu</Th>
              <Th>Utilisé</Th>
              <Th>Stock déclaratif</Th>
              <Th>Stock physique</Th>
              <Th className="hidden lg:table-cell">Écart</Th>
            </tr>
          </thead>
          <tbody>
            {rows.map((r) => {
              const tone = stockTone(r);
              const unit = stockUnitLabel(r);
              const gap = physicalGap(r);
              return (
                <tr key={r.key} className={classNames(r.negative && 'bg-red-50/70')}>
                  <Td className="font-medium">
                    {r.intrantLabel ?? r.intrantCode}
                    <span className="block text-xs font-normal text-slate-500">
                      {INTRANT_FAMILY_LABEL[r.intrantFamily] ?? r.intrantFamily}
                      {r.feedPhases.length ? ` · ${r.feedPhases.map((p) => FEED_PHASE_LABEL[p] ?? p).join(', ')}` : ''} · depuis le{' '}
                      {dateFr(r.trackedSince)}
                    </span>
                  </Td>
                  <Td label="Reçu" className="whitespace-nowrap tabular-nums">
                    {stockFigure(r.received, r)} {unit}
                  </Td>
                  <Td label="Utilisé" className="tabular-nums">
                    <span className="whitespace-nowrap">
                      {stockFigure(r.used, r)} {unit}
                    </span>
                    {r.lost > 0 || r.sold > 0 ? (
                      <span className="block text-xs text-slate-500">
                        {[r.consumed > 0 ? `consommé ${stockFigure(r.consumed, r)}` : null, r.lost > 0 ? `perdu ${stockFigure(r.lost, r)}` : null, r.sold > 0 ? `vendu ou transféré ${stockFigure(r.sold, r)}` : null]
                          .filter(Boolean)
                          .join(' · ')}
                      </span>
                    ) : null}
                  </Td>
                  <Td
                    label="Stock déclaratif"
                    className={classNames('whitespace-nowrap font-semibold tabular-nums', tone === 'red' ? 'text-red-700' : tone === 'amber' ? 'text-amber-700' : 'text-slate-900')}
                  >
                    {r.negative ? <AlertTriangle className="mr-1 inline h-3.5 w-3.5" /> : null}
                    {stockFigure(r.stock, r)} {unit}
                  </Td>
                  <Td label="Stock physique" className="whitespace-nowrap tabular-nums">
                    {r.physicalStock == null ? '—' : `${stockFigure(r.physicalStock, r)} ${unit}`}
                  </Td>
                  <Td label="Écart" className="whitespace-nowrap tabular-nums md:max-lg:hidden">
                    {gap == null || gap === 0 ? '—' : `${gap > 0 ? '+' : ''}${stockFigure(gap, r)} ${unit}`}
                  </Td>
                </tr>
              );
            })}
          </tbody>
        </DataTable>
      ) : null}
      <p className="px-4 py-3 text-xs text-slate-500">
        Le stock physique (FEFO) ne descend jamais sous zéro ; le stock déclaratif, si : un chiffre négatif signale une utilisation enregistrée
        au-delà de ce que le programme a livré. Les intrants reçus hors programme n’y comptent pas.
      </p>
    </SectionCard>
  );
}
