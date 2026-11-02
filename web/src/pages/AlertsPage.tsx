import { useMemo, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Link } from 'react-router-dom';
import { Check, ChevronDown, ChevronUp } from 'lucide-react';
import { api } from '../api/client';
import type { Alert } from '../api/types';
import type { AdvisoryNextActions, NextAction, OwnerDashboard } from '../api/types-sales';
import { useFarm } from '../app/FarmContext';
import { Button, ErrorNote, Field, inputCls, Modal, todayIso } from '../components/form';
import { Card, EmptyState, Loading, PageHeader, Th, Td } from '../components/ui';
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

/** A care event done: the date and notes end up in the lot's sanitary record. */
function CareModal({
  action,
  busy,
  error,
  onSubmit,
  onClose,
}: {
  action: NextAction;
  busy: boolean;
  error: unknown;
  onSubmit: (completedAt: string, notes: string) => void;
  onClose: () => void;
}) {
  const [date, setDate] = useState(todayIso());
  const [notes, setNotes] = useState('');
  return (
    <Modal title="Marquer le soin comme fait" onClose={onClose}>
      <form
        className="space-y-4"
        onSubmit={(e) => {
          e.preventDefault();
          onSubmit(date, notes.trim());
        }}
      >
        <p className="text-sm text-slate-600">
          {action.title}
          {action.batchName ? ` · ${action.batchName}` : ''}
        </p>
        <Field label="Date du soin">
          <input type="date" className={inputCls} value={date} max={todayIso()} onChange={(e) => setDate(e.target.value)} required />
        </Field>
        <Field label="Notes (facultatif)">
          <input className={inputCls} value={notes} onChange={(e) => setNotes(e.target.value)} />
        </Field>
        <ErrorNote error={error} />
        <div className="flex justify-end gap-2">
          <Button tone="secondary" onClick={onClose} disabled={busy}>
            Annuler
          </Button>
          <Button type="submit" busy={busy}>
            Enregistrer
          </Button>
        </div>
      </form>
    </Modal>
  );
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
  const [open, setOpen] = useState(false);
  const isReady = action.id.startsWith('ready:');
  const why = recommendation ?? action.description;

  const primary = (() => {
    if (action.acknowledged) return <span className="text-xs font-medium text-slate-400">Acquittée</span>;
    switch (action.category) {
      case 'ALERTE':
        return action.alertId ? (
          <Button className="px-2.5 py-1 text-xs" busy={acking} onClick={onAck}>
            <Check className="h-3.5 w-3.5" /> Acquitter
          </Button>
        ) : null;
      case 'SOIN':
        return (
          <Button className="px-2.5 py-1 text-xs" onClick={onCare}>
            <Check className="h-3.5 w-3.5" /> Fait
          </Button>
        );
      case 'SAISIE':
        return (
          <Link to="/app/batches" className={primaryLinkCls}>
            Saisir
          </Link>
        );
      case 'STOCK_PROVENDE':
        return (
          <Link to="/app/stock" className={primaryLinkCls}>
            Commander
          </Link>
        );
      case 'VENTE':
        return isReady ? null : (
          <Link
            to={action.batchId ? `/app/finance/ventes?batch=${action.batchId}` : '/app/finance/ventes'}
            className={primaryLinkCls}
          >
            Encaisser
          </Link>
        );
      default:
        return null;
    }
  })();

  return (
    <li className="px-4 py-3">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-2">
            <AlertLevelBadge level={action.level} />
            <span className="text-xs text-slate-400">{kindLabel(kindOf(action))}</span>
            {action.dueDate ? <span className="text-xs text-slate-400">· Échéance {dateFr(action.dueDate)}</span> : null}
          </div>
          <p className="mt-1 text-sm font-medium text-slate-800">{action.title}</p>
          {action.batchName ? <p className="text-xs text-slate-500">{action.batchName}</p> : null}
        </div>
        <div className="flex shrink-0 flex-wrap items-center gap-2">
          {action.batchId ? (
            <Link to="/app/batches" className={linkCls}>
              Voir le lot
            </Link>
          ) : null}
          {primary}
        </div>
      </div>
      {why ? (
        <div className="mt-1">
          <button
            type="button"
            aria-expanded={open}
            onClick={() => setOpen((v) => !v)}
            className="inline-flex items-center gap-1 text-xs font-medium text-brand-700 hover:underline"
          >
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

  const completeCare = useMutation({
    mutationFn: ({ action, completedAt, notes }: { action: NextAction; completedAt: string; notes: string }) =>
      api.post(`/farms/${farmId}/batches/${action.batchId}/prophylaxis/${action.id.replace(/^care:/, '')}/complete`, {
        completedAt,
        ...(notes ? { notes } : {}),
      }),
    onSuccess: () => {
      setCare(null);
      invalidate();
    },
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
      onCare={() => {
        completeCare.reset();
        setCare(a);
      }}
    />
  );

  return (
    <div className="space-y-6">
      <PageHeader title="Alertes & recommandations" subtitle="Ce que Fermia a repéré sur vos lots et ce qu’il vous conseille de faire." />

      <ErrorNote error={advisory.error ?? history.error ?? ack.error} />

      <Card className="flex flex-wrap items-center gap-6 p-4">
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
        <div className="grid flex-1 grid-cols-3 gap-3 text-center">
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

      {status !== 'RESOLVED' ? (
        advisory.isLoading ? (
          <Loading label="Chargement des alertes…" />
        ) : visible.length === 0 ? (
          <EmptyState message={actions.length === 0 ? 'Aucune alerte active. Bonne santé !' : 'Aucune alerte dans ce filtre.'} />
        ) : (
          <>
            {priority.length > 0 ? (
              <Card className="overflow-hidden">
                <h2 className="border-b border-slate-100 px-4 py-3 text-xs font-semibold uppercase tracking-wide text-slate-500">
                  Actions prioritaires ({num(priority.length)})
                </h2>
                <ul className="divide-y divide-slate-100">{priority.map(renderRow)}</ul>
              </Card>
            ) : null}
            {infos.length > 0 ? (
              <Card className="overflow-hidden">
                <h2 className="border-b border-slate-100 px-4 py-3 text-xs font-semibold uppercase tracking-wide text-slate-500">
                  Informations ({num(infos.length)})
                </h2>
                <ul className="divide-y divide-slate-100">{infos.map(renderRow)}</ul>
              </Card>
            ) : null}
          </>
        )
      ) : null}

      <Card className="overflow-hidden">
        <div className="border-b border-slate-100 px-4 py-3">
          <h2 className="text-sm font-semibold text-slate-700">Historique des alertes résolues</h2>
        </div>
        {history.isLoading ? (
          <div className="p-4">
            <Loading />
          </div>
        ) : resolved.length === 0 ? (
          <p className="px-4 py-6 text-center text-sm text-slate-500">Aucun historique.</p>
        ) : (
          <div className="max-h-[420px] overflow-y-auto">
            <table className="w-full">
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
                    <Td>{kindLabel(a.kind)}</Td>
                    <Td className="max-w-[420px] text-slate-600">{a.message}</Td>
                    <Td className="whitespace-nowrap">{dateFr(a.createdAt)}</Td>
                    <Td className="whitespace-nowrap">{a.resolvedAt ? dateFr(a.resolvedAt) : '—'}</Td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Card>

      {care ? (
        <CareModal
          action={care}
          busy={completeCare.isPending}
          error={completeCare.error}
          onSubmit={(completedAt, notes) => completeCare.mutate({ action: care, completedAt, notes })}
          onClose={() => setCare(null)}
        />
      ) : null}
    </div>
  );
}
