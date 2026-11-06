import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { ChevronRight, ShieldAlert } from 'lucide-react';
import { api } from '../../api/client';
import type { SanitaryAlertDetail, SanitaryAlertPage } from '../../api/types-surveillance';
import { useFarm } from '../../app/FarmContext';
import { dateFr } from '../../lib/format';
import { ErrorNote, Modal } from '../form';
import { SectionCard } from '../flock/shared';
import { DataTable, Loading, Td, Th } from '../ui';
import { AlertFacts, AlertStatusPill, PublishedPill, TransitionTimeline } from './AlertParts';
import { ORIGIN_LABELS, mortalityVsThreshold } from './alertRules';
import { useSanitaryList } from './queries';

const FARM_ALERTS_LIMIT = 20;

/**
 * The farm's official sanitary alerts (`GET /farms/:farmId/sanitary-alerts`),
 * read-only: the farm follows what the veterinary services decide. Kept
 * apart from Fermia's advisory alerts (`/app/alerts`). Shows nothing while
 * the farm has none.
 */
export function FarmOfficialAlerts({ openAlertId, onCloseAlert }: { openAlertId: string | null; onCloseAlert: () => void }) {
  const { farmId } = useFarm();
  const [opened, setOpened] = useState<string | null>(null);
  const alertId = opened ?? openAlertId;
  const statuses = useSanitaryList('STATUT_ALERTE');
  const signs = useSanitaryList('SIGNE_CLINIQUE');
  const list = useQuery({
    queryKey: ['farm-sanitary-alerts', farmId],
    queryFn: () => api.get<SanitaryAlertPage>(`/farms/${farmId}/sanitary-alerts?limit=${FARM_ALERTS_LIMIT}`),
    enabled: !!farmId,
  });
  const items = list.data?.items ?? [];

  if (list.isLoading || (!list.error && items.length === 0 && !alertId)) return null;

  return (
    <>
      <SectionCard
        title="Alertes sanitaires officielles"
        subtitle="Qualifiées par les services vétérinaires du programme (distinctes des alertes de conseil Fermia)"
        icon={<ShieldAlert />}
        iconTone="red"
        flush
      >
        <ErrorNote error={list.error} />
        {items.length > 0 ? (
          <DataTable>
            <thead className="bg-slate-50">
              <tr>
                <Th>Alerte</Th>
                <Th>Bande</Th>
                <Th>Origine</Th>
                <Th>Jour du fait</Th>
                <Th>Statut</Th>
                <Th> </Th>
              </tr>
            </thead>
            <tbody>
              {items.map((a) => (
                <tr key={a.id} className="cursor-pointer border-t border-slate-100 hover:bg-slate-50" onClick={() => setOpened(a.id)}>
                  <Td>
                    <span className="font-mono text-sm font-semibold">{a.code}</span>
                    <span className="block text-xs text-slate-500">{a.summary}</span>
                  </Td>
                  <Td label="Bande">{a.batchCode ?? '—'}</Td>
                  <Td label="Origine">
                    {ORIGIN_LABELS[a.origin]}
                    {mortalityVsThreshold(a) ? <span className="block text-xs text-slate-500">{mortalityVsThreshold(a)}</span> : null}
                  </Td>
                  <Td label="Jour du fait">{dateFr(a.factDay)}</Td>
                  <Td label="Statut">
                    <div className="flex flex-wrap gap-1">
                      <AlertStatusPill alert={a} statuses={statuses.data ?? []} />
                      <PublishedPill alert={a} />
                    </div>
                  </Td>
                  <Td className="row-chevron text-right">
                    <ChevronRight className="inline h-4 w-4 text-slate-400" />
                  </Td>
                </tr>
              ))}
            </tbody>
          </DataTable>
        ) : null}
        {(list.data?.total ?? 0) > items.length ? (
          <p className="px-4 py-2 text-xs text-slate-500">
            {FARM_ALERTS_LIMIT} alertes les plus récentes sur {list.data?.total}.
          </p>
        ) : null}
      </SectionCard>
      {alertId && farmId ? (
        <FarmAlertDetail
          farmId={farmId}
          alertId={alertId}
          onClose={() => {
            setOpened(null);
            onCloseAlert();
          }}
          statuses={statuses.data ?? []}
          signs={signs.data ?? []}
        />
      ) : null}
    </>
  );
}

function FarmAlertDetail({
  farmId,
  alertId,
  onClose,
  statuses,
  signs,
}: {
  farmId: string;
  alertId: string;
  onClose: () => void;
  statuses: Parameters<typeof AlertFacts>[0]['statuses'];
  signs: Parameters<typeof AlertFacts>[0]['signs'];
}) {
  const detail = useQuery({
    queryKey: ['farm-sanitary-alert', farmId, alertId],
    queryFn: () => api.get<SanitaryAlertDetail>(`/farms/${farmId}/sanitary-alerts/${alertId}`),
  });
  return (
    <Modal side title={detail.data ? `Alerte ${detail.data.code}` : 'Alerte sanitaire'} onClose={onClose}>
      {detail.isLoading ? <Loading /> : null}
      <ErrorNote error={detail.error} />
      {detail.data ? (
        <div className="space-y-5">
          <AlertFacts alert={detail.data} statuses={statuses} signs={signs} />
          <div>
            <h3 className="mb-2 text-sm font-semibold text-slate-700">Historique</h3>
            <TransitionTimeline transitions={detail.data.transitions} statuses={statuses} />
          </div>
          <p className="text-xs text-slate-500">Le statut d’une alerte officielle est décidé par les services vétérinaires du programme.</p>
        </div>
      ) : null}
    </Modal>
  );
}
