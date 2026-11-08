import { useMemo, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Link } from 'react-router-dom';
import {
  AlertTriangle,
  ArrowRight,
  Check,
  ChevronDown,
  ChevronUp,
  CircleCheck,
  ClipboardList,
  HandCoins,
  Info,
  ListChecks,
  PackageOpen,
  SearchX,
  Stethoscope,
} from 'lucide-react';
import { api } from '../api/client';
import type { Alert } from '../api/types';
import type { AdvisoryNextActions, NextAction, OwnerDashboard } from '../api/types-sales';
import { useFarm } from '../app/FarmContext';
import { useFarmProfile } from '../app/useFarmProfile';
import { useMenuAccess } from '../app/useMenuAccess';
import { Button, ErrorNote, todayIso } from '../components/form';
// POUFA lot A2 sante: « Fait » through the shared completion form and the offline queue (CDC n° 22).
import { CompleteCareModal, type CareLotRef, type CompletableCare } from '../components/flock/CompleteCareModal';
import { Card, DataTable, EmptyState, IconTile, Loading, PageHeader, Th, Td } from '../components/ui';
import { ActionTile } from '../components/sales/DashboardPanels';
import { HEALTH_LABEL, kindLabel } from '../components/sales/labels';
import { AlertLevelBadge, FilterChip } from '../components/sales/shared';
import { classNames, dateFr, num } from '../lib/format';

type LevelFilter = 'ALL' | 'ROUGE' | 'JAUNE' | 'VERT';
type StatusFilter = 'ALL' | 'OPEN' | 'ACK' | 'RESOLVED';

const linkCls =
  'inline-flex items-center gap-2 rounded-lg border border-slate-300 bg-white px-2.5 py-1 text-xs font-semibold text-slate-700 hover:bg-slate-50';
const primaryLinkCls =
  'inline-flex items-center gap-2 rounded-lg bg-brand-600 px-2.5 py-1 text-xs font-semibold text-white hover:bg-brand-700';

function kindOf(a: NextAction): string {
  return a.kind ?? a.category;
}

/**
 * POUFA lot A2 sante: the care behind a SOIN action, as the completion form
 * needs it (the server sends `care`; the fallback only keeps the id).
 */
function careOf(action: NextAction): { lot: CareLotRef; event: CompletableCare } {
  const info = action.care;
  return {
    lot: { id: action.batchId ?? '', liveCount: info?.liveCount ?? 0, batchName: action.batchName, code: null },
    event: info
      ? {
          id: info.eventId,
          name: info.name,
          careType: info.careType,
          scheduledDate: info.scheduledDate,
          route: info.route,
          withdrawalDays: info.withdrawalDays,
          protocolStepId: info.protocolStepId,
          productCode: info.productCode,
          isReference: info.isReference,
          originalDate: info.originalDate,
        }
      : {
          id: action.id.replace(/^care:/, ''),
          name: action.title,
          careType: 'VACCIN',
          scheduledDate: action.dueDate ?? todayIso(),
          route: null,
          withdrawalDays: 0,
          protocolStepId: null,
        },
  };
}

function ActionRow({
  action,
  recommendation,
  acking,
  onAck,
  onCare,
}: {
  action: NextAction;
  recommendation: string | null;
  acking: boolean;
  onAck: () => void;
  onCare: () => void;
}) {
  const { hasPermission } = useFarmProfile();
  const { canWrite } = useMenuAccess();
  const [open, setOpen] = useState(false);
  const isReady = action.id.startsWith('ready:');
  const why = recommendation ?? action.description;
  // POUFA lot A indic: a disease advice links to the sanitary declaration to the vets (F10).
  const declare =
    action.kind === 'MALADIE' && action.batchId && hasPermission('sanitaire:gerer', 'sanitaire:signaler') ? (
      <Link to={`/app/sanitary?lot=${action.batchId}&declarer=1`} className={primaryLinkCls}>
        <Stethoscope className="h-3.5 w-3.5" /> Déclarer aux services vétérinaires
      </Link>
    ) : null;

  const primary = (() => {
    if (action.acknowledged) return <span className="text-xs font-medium text-slate-400">Acquittée</span>;
    switch (action.category) {
      case 'ALERTE':
        return action.alertId && canWrite('TECHNIQUE') ? (
          <Button className="px-2.5 py-1 text-xs" busy={acking} onClick={onAck}>
            <Check className="h-3.5 w-3.5" /> Acquitter
          </Button>
        ) : null;
      case 'SOIN':
        return hasPermission('sanitaire:gerer', 'sanitaire:signaler') ? (
          <Button className="px-2.5 py-1 text-xs" onClick={onCare}>
            <Check className="h-3.5 w-3.5" /> Fait
          </Button>
        ) : null;
      case 'SAISIE':
        return hasPermission('saisie:creer') ? (
          <Link to="/app/batches" className={primaryLinkCls}>
            <ClipboardList className="h-3.5 w-3.5" /> Saisir
          </Link>
        ) : null;
      case 'STOCK_PROVENDE':
        return hasPermission('stock:gerer') ? (
          <Link to="/app/stock" className={primaryLinkCls}>
            <PackageOpen className="h-3.5 w-3.5" /> Commander
          </Link>
        ) : null;
      case 'VENTE':
        return isReady || !hasPermission('vente:creer') ? null : (
          <Link
            to={action.batchId ? `/app/finance/ventes?batch=${action.batchId}` : '/app/finance/ventes'}
            className={primaryLinkCls}
          >
            <HandCoins className="h-3.5 w-3.5" /> Encaisser
          </Link>
        );
      default:
        return null;
    }
  })();

  return (
    <li className="px-4 py-3">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="flex min-w-0 flex-1 items-start gap-3">
          <ActionTile action={action} />
          <div className="min-w-0 flex-1">
            <div className="flex flex-wrap items-center gap-2">
              <AlertLevelBadge level={action.level} />
              <span className="text-xs text-slate-400">{kindLabel(kindOf(action))}</span>
              {action.dueDate ? <span className="text-xs text-slate-400">· Échéance {dateFr(action.dueDate)}</span> : null}
            </div>
            <p className="mt-1 text-sm font-medium text-slate-800">{action.title}</p>
            {action.batchName ? <p className="text-xs text-slate-500">{action.batchName}</p> : null}
          </div>
        </div>
        <div className="flex shrink-0 flex-wrap items-center gap-2">
          {action.batchId ? (
            <Link to="/app/batches" className={linkCls}>
              <ArrowRight className="h-3.5 w-3.5" /> Voir le lot
            </Link>
          ) : null}
          {declare}
          {primary}
        </div>
      </div>
      {why ? (
        <div className="mt-1 pl-11">
          <button
            type="button"
            aria-expanded={open}
            onClick={() => setOpen((v) => !v)}
            className="inline-flex items-center gap-1 text-xs font-medium text-brand-700 hover:underline"
          >
            <Info className="h-3.5 w-3.5" />
            Pourquoi Fermia dit ça ?
            {open ? <ChevronUp className="h-3.5 w-3.5" /> : <ChevronDown className="h-3.5 w-3.5" />}
          </button>
          {open ? <p className="mt-1 text-sm text-slate-600">{why}</p> : null}
        </div>
      ) : null}
    </li>
  );
}

export function AlertsPage() {
  const { farmId } = useFarm();
  const queryClient = useQueryClient();
  const today = todayIso();
  const [level, setLevel] = useState<LevelFilter>('ALL');
  const [status, setStatus] = useState<StatusFilter>('ALL');
  const [kind, setKind] = useState('');
  const [care, setCare] = useState<NextAction | null>(null);

  const advisory = useQuery({
    queryKey: ['advisory', farmId],
    queryFn: () => api.get<AdvisoryNextActions>(`/farms/${farmId}/advisory/next-actions`),
    enabled: !!farmId,
    refetchInterval: 60_000,
  });
  const history = useQuery({
    queryKey: ['alerts', farmId, 'history'],
    queryFn: () => api.get<Alert[]>(`/farms/${farmId}/alerts/history`),
    enabled: !!farmId,
  });
  const active = useQuery({
    queryKey: ['alerts', farmId, 'active'],
    queryFn: () => api.get<Alert[]>(`/farms/${farmId}/alerts?status=ACTIVE`),
    enabled: !!farmId,
    refetchInterval: 60_000,
  });
  const dashboard = useQuery({
    queryKey: ['dashboard', farmId, today],
    queryFn: () => api.get<OwnerDashboard>(`/farms/${farmId}/dashboard?date=${today}`),
    enabled: !!farmId,
  });

  const invalidate = () => {
    void queryClient.invalidateQueries({ queryKey: ['advisory', farmId] });
    void queryClient.invalidateQueries({ queryKey: ['alerts', farmId] });
    void queryClient.invalidateQueries({ queryKey: ['dashboard', farmId] });
  };

  const ack = useMutation({
    mutationFn: (alertId: string) => api.post(`/farms/${farmId}/alerts/${alertId}/acknowledge`),
    onSuccess: invalidate,
  });

  const actions = useMemo(() => advisory.data?.actions ?? [], [advisory.data]);
  const recommendations = useMemo(() => {
    const map = new Map<string, string>();
    for (const a of [...(active.data ?? []), ...(history.data ?? [])]) {
      if (a.recommendation) map.set(a.id, a.recommendation);
    }
    return map;
  }, [active.data, history.data]);

  const resolved = useMemo(
    () => (history.data ?? []).filter((a) => a.status === 'RESOLUE').sort((a, b) => b.createdAt.localeCompare(a.createdAt)),
    [history.data],
  );

  const kinds = useMemo(() => {
    const counts = new Map<string, number>();
    for (const a of actions) counts.set(kindOf(a), (counts.get(kindOf(a)) ?? 0) + 1);
    return [...counts.entries()].sort((a, b) => kindLabel(a[0]).localeCompare(kindLabel(b[0]), 'fr'));
  }, [actions]);

  const visible = actions.filter(
    (a) =>
      (level === 'ALL' || a.level === level) &&
      (!kind || kindOf(a) === kind) &&
      (status === 'ALL' || (status === 'OPEN' && !a.acknowledged) || (status === 'ACK' && a.acknowledged)),
  );
  const priority = visible.filter((a) => a.level !== 'VERT');
  const infos = visible.filter((a) => a.level === 'VERT');
  const summary = advisory.data?.summary;
  const health = dashboard.data?.health;

  const renderRow = (a: NextAction) => (
    <ActionRow
      key={a.id}
      action={a}
      recommendation={a.alertId ? (recommendations.get(a.alertId) ?? null) : null}
      acking={ack.isPending && ack.variables === a.alertId}
      onAck={() => a.alertId && ack.mutate(a.alertId)}
      onCare={() => setCare(a)}
    />
  );

  return (
    <div className="space-y-6">
      <PageHeader
        title="Conseils d’élevage"
        subtitle="Ce que Fermia a repéré sur vos lots et ce qu’il vous conseille de faire."
        icon={<AlertTriangle className="h-6 w-6" />}
        iconTone="amber"
      />

      <ErrorNote error={advisory.error ?? history.error ?? ack.error} />

      <div className="grid items-start gap-6 xl:grid-cols-[minmax(0,1fr)_320px]">
      <div className="space-y-6 xl:sticky xl:top-24 xl:order-2">
      <Card className="flex flex-wrap items-center gap-6 p-4">
        <div className="flex items-center gap-3">
          <IconTile icon={<Stethoscope className="h-6 w-6" />} size="lg" />
          <div>
            <p className="text-xs text-slate-500">Score de santé</p>
            <p
              className={classNames(
                'text-3xl font-bold tabular-nums',
                !health ? 'text-slate-400' : health.score >= 70 ? 'text-emerald-600' : health.score >= 50 ? 'text-amber-600' : 'text-red-600',
              )}
            >
              {health ? health.score : '—'}
              <span className="text-sm font-medium text-slate-400"> /100</span>
            </p>
            <p className="text-xs text-slate-500">{health ? (HEALTH_LABEL[health.grade] ?? '—') : '—'}</p>
          </div>
        </div>
        <div className="grid min-w-52 flex-1 grid-cols-3 gap-3 text-center">
          <div className="rounded-xl bg-red-50 p-3">
            <p className="text-lg font-bold text-red-700">{num(summary?.rouge ?? 0)}</p>
            <p className="text-xs text-red-700">Rouges</p>
          </div>
          <div className="rounded-xl bg-amber-50 p-3">
            <p className="text-lg font-bold text-amber-700">{num(summary?.jaune ?? 0)}</p>
            <p className="text-xs text-amber-700">Jaunes</p>
          </div>
          <div className="rounded-xl bg-emerald-50 p-3">
            <p className="text-lg font-bold text-emerald-700">{num(summary?.vert ?? 0)}</p>
            <p className="text-xs text-emerald-700">Infos</p>
          </div>
        </div>
      </Card>

      <Card className="space-y-2 p-4">
        <div className="flex flex-wrap items-center gap-1.5">
          <span className="w-14 text-xs font-medium text-slate-500">Niveau</span>
          <FilterChip label="Toutes" active={level === 'ALL'} onClick={() => setLevel('ALL')} />
          <FilterChip label="Rouges" active={level === 'ROUGE'} onClick={() => setLevel('ROUGE')} />
          <FilterChip label="Jaunes" active={level === 'JAUNE'} onClick={() => setLevel('JAUNE')} />
          <FilterChip label="Infos" active={level === 'VERT'} onClick={() => setLevel('VERT')} />
        </div>
        <div className="flex flex-wrap items-center gap-1.5">
          <span className="w-14 text-xs font-medium text-slate-500">Statut</span>
          <FilterChip label="Toutes" active={status === 'ALL'} onClick={() => setStatus('ALL')} />
          <FilterChip label="En cours" active={status === 'OPEN'} onClick={() => setStatus('OPEN')} />
          <FilterChip label="Acquittées" active={status === 'ACK'} onClick={() => setStatus('ACK')} />
          <FilterChip label="Résolues" active={status === 'RESOLVED'} onClick={() => setStatus('RESOLVED')} />
        </div>
        {kinds.length > 0 && status !== 'RESOLVED' ? (
          <div className="flex flex-wrap items-center gap-1.5">
            <span className="w-14 text-xs font-medium text-slate-500">Type</span>
            <FilterChip label="Tous" active={!kind} onClick={() => setKind('')} />
            {kinds.map(([k, count]) => (
              <FilterChip key={k} label={kindLabel(k)} count={count} active={kind === k} onClick={() => setKind(kind === k ? '' : k)} />
            ))}
          </div>
        ) : null}
      </Card>
      </div>

      <div className="min-w-0 space-y-6">
      {status !== 'RESOLVED' ? (
        advisory.isLoading ? (
          <Loading label="Chargement des alertes…" />
        ) : visible.length === 0 ? (
          <EmptyState
            message={actions.length === 0 ? 'Aucune alerte active. Bonne santé !' : 'Aucune alerte dans ce filtre.'}
            icon={actions.length === 0 ? <CircleCheck className="h-6 w-6" /> : <SearchX className="h-6 w-6" />}
          />
        ) : (
          <>
            {priority.length > 0 ? (
              <Card className="overflow-hidden">
                <h2 className="flex items-center gap-2 border-b border-slate-100 px-4 py-3 text-xs font-semibold uppercase tracking-wide text-slate-500">
                  <ListChecks className="h-4 w-4 text-brand-600" /> Actions prioritaires ({num(priority.length)})
                </h2>
                <ul className="divide-y divide-slate-100">{priority.map(renderRow)}</ul>
              </Card>
            ) : null}
            {infos.length > 0 ? (
              <Card className="overflow-hidden">
                <h2 className="flex items-center gap-2 border-b border-slate-100 px-4 py-3 text-xs font-semibold uppercase tracking-wide text-slate-500">
                  <Info className="h-4 w-4 text-brand-600" /> Informations ({num(infos.length)})
                </h2>
                <ul className="divide-y divide-slate-100">{infos.map(renderRow)}</ul>
              </Card>
            ) : null}
          </>
        )
      ) : null}

      <Card className="overflow-hidden">
        <div className="border-b border-slate-100 px-4 py-3">
          <h2 className="flex items-center gap-2 text-sm font-semibold text-slate-700">
            <CircleCheck className="h-4 w-4 text-brand-600" /> Historique des alertes résolues
          </h2>
        </div>
        {history.isLoading ? (
          <div className="p-4">
            <Loading />
          </div>
        ) : resolved.length === 0 ? (
          <p className="px-4 py-6 text-center text-sm text-slate-500">Aucun historique.</p>
        ) : (
          <DataTable>
              <thead className="bg-slate-50">
                <tr>
                  <Th>Niveau</Th>
                  <Th>Type</Th>
                  <Th>Message</Th>
                  <Th>Créée</Th>
                  <Th>Résolue</Th>
                </tr>
              </thead>
              <tbody>
                {resolved.slice(0, 40).map((a) => (
                  <tr key={a.id} className="border-t border-slate-100">
                    <Td>
                      <AlertLevelBadge level={a.level} />
                    </Td>
                    <Td label="Type">{kindLabel(a.kind)}</Td>
                    <Td className="max-w-[420px] text-slate-600">{a.message}</Td>
                    <Td label="Créée" className="whitespace-nowrap">{dateFr(a.createdAt)}</Td>
                    <Td label="Résolue" className="whitespace-nowrap">{a.resolvedAt ? dateFr(a.resolvedAt) : '—'}</Td>
                  </tr>
                ))}
              </tbody>
          </DataTable>
        )}
      </Card>
      </div>
      </div>

      {care ? <CompleteCareModal {...careOf(care)} onClose={() => setCare(null)} /> : null}
    </div>
  );
}
