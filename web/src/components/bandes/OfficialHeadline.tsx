import type { ReactNode } from 'react';
import { useQuery } from '@tanstack/react-query';
import { History, Info, Trophy } from 'lucide-react';
import { api } from '../../api/client';
import type { BandHistoryRow, BandSummaryIndicator } from '../../api/types-pilotage';
import { useFarm } from '../../app/FarmContext';
import { useCanRead } from '../../app/useMenuAccess';
import { dateFr, fcfa } from '../../lib/format';
import { ErrorNote } from '../form';
import { Metric, SectionCard } from '../flock/shared';
import { DataTable, EmptyState, Loading, Td, Th } from '../ui';
import {
  CONDUITE_LABEL,
  HEADLINE_KEYS,
  HEADLINE_SHORT,
  bestBands,
  findIndicator,
  officialText,
  officialTooltip,
} from './headline';

/**
 * The farm's band history with the official headline of each band
 * (`GET /farms/:farmId/bandes[?status=]`, domain TECHNIQUE). Shared by the
 * lot list (official mortality and IC per lot), the dashboard and the band
 * comparison table.
 */
export function useBandHistory(status?: 'CLOTURE' | 'EN_COURS') {
  const { farmId } = useFarm();
  const canRead = useCanRead();
  return useQuery({
    queryKey: ['bandes-history', farmId, status ?? 'all'],
    queryFn: () => api.get<BandHistoryRow[]>(`/farms/${farmId}/bandes${status ? `?status=${status}` : ''}`),
    enabled: !!farmId && canRead('TECHNIQUE'),
    retry: false,
  });
}

/** The official value, its formula on hover. */
export function OfficialValue({ indicator }: { indicator: BandSummaryIndicator | null }) {
  return (
    <span title={officialTooltip(indicator)} className="cursor-help">
      {officialText(indicator)}
    </span>
  );
}

/** Fermia's figure under an official one, named, its formula on hover. */
export function ConduiteValue({ text, formula }: { text: string; formula: string }) {
  return (
    <span title={formula} className="inline-flex cursor-help items-center gap-1 text-[11px] text-slate-500">
      <Info className="h-3 w-3 shrink-0" aria-hidden />
      <span>
        Fermia {text} · {CONDUITE_LABEL}
      </span>
    </span>
  );
}

/**
 * A tile whose headline is the official value (programme formula), with
 * Fermia's own value underneath. Never shows Fermia's figure alone: without
 * the official set, the headline reads « — ».
 */
export function OfficialMetric({
  label,
  icon,
  indicator,
  fermiaText,
  fermiaFormula,
  tone,
  extra,
}: {
  label: string;
  icon?: ReactNode;
  indicator: BandSummaryIndicator | null;
  fermiaText: string | null;
  fermiaFormula: string;
  tone?: 'good' | 'warn' | 'bad';
  extra?: ReactNode;
}) {
  return (
    <Metric
      label={`${label} (officiel)`}
      icon={icon}
      tone={tone}
      value={<OfficialValue indicator={indicator} />}
      sub={
        <span className="flex flex-col gap-0.5">
          {extra}
          {fermiaText != null ? <ConduiteValue text={fermiaText} formula={fermiaFormula} /> : null}
        </span>
      }
    />
  );
}

/**
 * CDC n° 11 « Historique des bandes » : the farm's closed bands side by side
 * with their official indicators from the last frozen bilan, revenue and
 * margin; the best band on each indicator is marked.
 */
export function BandHistoryCard({ onOpen }: { onOpen?: (batchId: string) => void }) {
  const history = useBandHistory('CLOTURE');
  const rows = history.data ?? [];
  const best = bestBands(rows);
  return (
    <SectionCard
      title="Historique des bandes"
      subtitle="Bandes clôturées de la ferme comparées sur leur dernier bilan figé (indicateurs officiels du programme)"
      icon={<History />}
      flush
    >
      {history.isLoading ? (
        <Loading />
      ) : history.error ? (
        <div className="p-4">
          <ErrorNote error={history.error} />
        </div>
      ) : rows.length === 0 ? (
        <EmptyState icon={<History />} message="Aucune bande clôturée pour l’instant : le bilan est figé à la clôture." />
      ) : (
        <DataTable>
          <thead className="bg-slate-50">
            <tr>
              <Th>Bande</Th>
              <Th className="hidden lg:table-cell">Période</Th>
              <Th>Durée</Th>
              {HEADLINE_KEYS.map((k) => (
                <Th key={k}>{HEADLINE_SHORT[k]}</Th>
              ))}
              <Th className="hidden lg:table-cell">Chiffre d’affaires</Th>
              <Th>Marge</Th>
            </tr>
          </thead>
          <tbody>
            {rows.map((r) => {
              const s = r.summary;
              const open = onOpen ? () => onOpen(r.id) : undefined;
              return (
                <tr
                  key={r.id}
                  tabIndex={open ? 0 : undefined}
                  onClick={open}
                  onKeyDown={(e) => {
                    if (open && e.key === 'Enter') open();
                  }}
                  className={open ? 'cursor-pointer border-t border-slate-100 hover:bg-slate-50' : 'border-t border-slate-100'}
                >
                  <Td className="font-medium text-brand-700">
                    {r.code ?? r.batchName ?? 'Bande'}
                    {s?.snapshotVersion && s.snapshotVersion > 1 ? (
                      <span className="block text-[11px] font-normal text-slate-500">bilan v{s.snapshotVersion} (corrigé)</span>
                    ) : null}
                  </Td>
                  <Td label="Période" className="md:max-lg:hidden">
                    {dateFr(r.integrationDate)} → {dateFr(r.closedAt)}
                  </Td>
                  <Td label="Durée">{s?.durationDays != null ? `${s.durationDays} j` : '—'}</Td>
                  {HEADLINE_KEYS.map((k) => (
                    <Td key={k} label={HEADLINE_SHORT[k]}>
                      <span className="inline-flex items-center gap-1">
                        <OfficialValue indicator={findIndicator(s?.indicators, k)} />
                        {best[k] === r.id ? <Trophy className="h-3.5 w-3.5 text-amber-500" aria-label="Meilleure bande" /> : null}
                      </span>
                    </Td>
                  ))}
                  <Td label="Chiffre d’affaires" className="md:max-lg:hidden">
                    {s?.revenueFcfa != null ? fcfa(s.revenueFcfa) : '—'}
                  </Td>
                  <Td label="Marge">
                    <span className={s?.marginFcfa != null && s.marginFcfa < 0 ? 'text-red-600' : undefined} title={findIndicator(s?.indicators, 'marge_fcfa') ? officialTooltip(findIndicator(s?.indicators, 'marge_fcfa')) : undefined}>
                      {s?.marginFcfa != null ? fcfa(s.marginFcfa) : '—'}
                    </span>
                  </Td>
                </tr>
              );
            })}
          </tbody>
        </DataTable>
      )}
    </SectionCard>
  );
}
