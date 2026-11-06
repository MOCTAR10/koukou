import { useState } from 'react';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { PencilLine, RefreshCcw } from 'lucide-react';
import { api } from '../../api/client';
import type { RegistryInfrastructure, RegistrySheet } from '../../api/types-programme';
import { dateFr, num } from '../../lib/format';
import { Button, ErrorNote } from '../form';
import { FarmStatusModal } from '../programme/FarmStatusModal';
import { Loading } from '../ui';
import { InfrastructureFields } from './InfrastructureFields';
import { invalidateRegistry, useProgrammeList, useStatusHistory } from './queries';
import { RegistryStatusPill } from './shared';
import { checkInfrastructures, type InfraDraft } from './sheetForm';

/** Current status, change (shared `FarmStatusModal`) and history. */
export function StatusSection({ sheet, canEdit }: { sheet: RegistrySheet; canEdit: boolean }) {
  const queryClient = useQueryClient();
  const [changing, setChanging] = useState(false);
  const history = useStatusHistory(sheet.id);
  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <p className="flex flex-wrap items-center gap-2 text-sm text-slate-600">
          <RegistryStatusPill status={sheet.status} active={sheet.active} />
          {sheet.status?.since ? <span>depuis le {dateFr(sheet.status.since)}</span> : null}
        </p>
        {canEdit ? (
          <Button tone="secondary" onClick={() => setChanging(true)}>
            <RefreshCcw className="h-4 w-4" /> Changer le statut
          </Button>
        ) : null}
      </div>
      {history.isLoading ? (
        <Loading />
      ) : history.data?.length ? (
        <ol className="space-y-2 border-l-2 border-slate-200 pl-3">
          {history.data.map((h) => (
            <li key={h.id} className="text-sm">
              <p>
                <span className="font-medium text-slate-900">{h.statusLabel}</span>
                <span className="text-slate-500"> · à partir du {dateFr(h.from)}</span>
              </p>
              <p className="text-xs text-slate-500">
                {h.createdBy ? `Par ${h.createdBy.fullName}` : 'Automatique'}
                {h.cohort ? ` · cohorte ${h.cohort}` : ''}
              </p>
              {h.reason ? <p className="text-xs text-slate-600">Motif : {h.reason}</p> : null}
            </li>
          ))}
        </ol>
      ) : (
        <ErrorNote error={history.error} />
      )}
      {changing ? (
        <FarmStatusModal
          farm={{ id: sheet.id, name: sheet.name, code: sheet.code, statusCode: sheet.status?.code ?? null, statusSince: sheet.status?.since ?? null }}
          onClose={() => setChanging(false)}
          onDone={() => invalidateRegistry(queryClient, sheet.id)}
        />
      ) : null}
    </div>
  );
}

const toDraft = (items: RegistryInfrastructure[]): InfraDraft[] =>
  items.map((i) => ({ code: i.code, count: String(i.count), surfaceM2: i.surfaceM2 != null ? String(i.surfaceM2) : '' }));

/** Infrastructures of the farm (INFRASTRUCTURE list), replaced as a whole. */
export function InfrastructuresSection({ sheet, canEdit }: { sheet: RegistrySheet; canEdit: boolean }) {
  const queryClient = useQueryClient();
  const [lines, setLines] = useState<InfraDraft[] | null>(null);
  const [formError, setFormError] = useState<string | null>(null);
  const items = useProgrammeList('INFRASTRUCTURE', lines !== null);
  const save = useMutation({
    mutationFn: (body: object) => api.put<RegistryInfrastructure[]>(`/programme/farms/${sheet.id}/infrastructures`, body),
    onSuccess: (infrastructures) => {
      queryClient.setQueryData<RegistrySheet>(['programme-farm', sheet.id], (prev) => (prev ? { ...prev, infrastructures } : prev));
      invalidateRegistry(queryClient, sheet.id);
      setLines(null);
    },
  });

  if (lines) {
    return (
      <div className="space-y-3">
        <InfrastructureFields
          lines={lines}
          onChange={(l) => {
            setLines(l);
            setFormError(null);
          }}
          items={items.data ?? []}
          known={sheet.infrastructures}
        />
        <ErrorNote error={formError ?? save.error ?? items.error} />
        <div className="flex justify-end gap-2">
          <Button tone="secondary" onClick={() => setLines(null)} disabled={save.isPending}>
            Annuler
          </Button>
          <Button
            busy={save.isPending}
            onClick={() => {
              const checked = checkInfrastructures(lines);
              if ('error' in checked) return setFormError(checked.error);
              save.mutate({ items: checked.items });
            }}
          >
            Enregistrer
          </Button>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-3">
      {sheet.infrastructures.length ? (
        <ul className="divide-y divide-slate-100 rounded-lg ring-1 ring-slate-200">
          {sheet.infrastructures.map((i) => (
            <li key={i.code} className="flex items-baseline justify-between gap-3 px-3 py-2 text-sm">
              <span className="text-slate-800">{i.label}</span>
              <span className="text-xs tabular-nums text-slate-500">
                {num(i.count, 0)}
                {i.surfaceM2 != null ? ` · ${num(i.surfaceM2, 0)} m²` : ''}
              </span>
            </li>
          ))}
        </ul>
      ) : (
        <p className="text-sm text-slate-500">Aucune infrastructure renseignée.</p>
      )}
      {canEdit ? (
        <Button tone="secondary" onClick={() => setLines(toDraft(sheet.infrastructures))}>
          <PencilLine className="h-4 w-4" /> Modifier les infrastructures
        </Button>
      ) : null}
    </div>
  );
}
