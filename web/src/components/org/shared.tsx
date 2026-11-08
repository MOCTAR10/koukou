import type { QueryClient } from '@tanstack/react-query';
import type { ReactNode } from 'react';
import { api, API_BASE, ApiError } from '../../api/client';
import type { ContractType, FarmWithLogo, StaffRole, TaskSource, TaskStatus } from '../../api/types-org';
import { classNames } from '../../lib/format';
import { Button, ErrorNote, Modal } from '../form';

const TASK_STATUS_LABEL: Record<TaskStatus, string> = {
  A_FAIRE: 'À faire',
  EN_COURS: 'En cours',
  FAIT: 'Fait',
  ANNULEE: 'Annulée',
};

const TASK_STATUS_TONE: Record<TaskStatus, string> = {
  A_FAIRE: 'bg-brand-50 text-brand-700 ring-brand-200',
  EN_COURS: 'bg-amber-50 text-amber-700 ring-amber-200',
  FAIT: 'bg-emerald-50 text-emerald-700 ring-emerald-200',
  ANNULEE: 'bg-slate-100 text-slate-500 ring-slate-200',
};

export const CONTRACT_TYPES: ContractType[] = ['CDI', 'CDD', 'JOURNALIER', 'STAGE', 'APPRENTISSAGE', 'AUTRE'];

export const CONTRACT_LABEL: Record<ContractType, string> = {
  CDI: 'CDI',
  CDD: 'CDD',
  JOURNALIER: 'Journalier',
  STAGE: 'Stage',
  APPRENTISSAGE: 'Apprentissage',
  AUTRE: 'Autre',
};

export const STAFF_ROLE_LABEL: Record<StaffRole, string> = {
  ADMIN: 'Administrateur',
  ELEVEUR: 'Éleveur',
};

export function Pill({ tone = 'slate', children }: { tone?: 'slate' | 'brand' | 'amber' | 'emerald' | 'red'; children: ReactNode }) {
  const tones = {
    slate: 'bg-slate-100 text-slate-600 ring-slate-200',
    brand: 'bg-brand-50 text-brand-700 ring-brand-200',
    amber: 'bg-amber-50 text-amber-700 ring-amber-200',
    emerald: 'bg-emerald-50 text-emerald-700 ring-emerald-200',
    red: 'bg-red-50 text-red-700 ring-red-200',
  };
  return (
    <span className={classNames('inline-flex items-center whitespace-nowrap rounded-full px-2 py-0.5 text-xs font-medium ring-1', tones[tone])}>
      {children}
    </span>
  );
}

export function TaskStatusBadge({ status }: { status: TaskStatus }) {
  return (
    <span className={classNames('inline-flex items-center whitespace-nowrap rounded-full px-2 py-0.5 text-xs font-medium ring-1', TASK_STATUS_TONE[status])}>
      {TASK_STATUS_LABEL[status]}
    </span>
  );
}

/** Where a generated task comes from (a manual task shows nothing). */
export const TASK_SOURCE_LABEL: Record<Exclude<TaskSource, 'MANUELLE'>, string> = {
  PROGRAMME_VACCIN: 'Programme sanitaire',
  PESEE: 'Pesée',
  VIDE_SANITAIRE: 'Vide sanitaire',
};

export function TaskSourceBadge({ source }: { source?: TaskSource }) {
  if (!source || source === 'MANUELLE') return null;
  return <Pill tone="brand">{TASK_SOURCE_LABEL[source]}</Pill>;
}

export function SuccessNote({ children }: { children: ReactNode }) {
  return <div className="rounded-lg bg-emerald-50 px-3 py-2 text-sm text-emerald-700 ring-1 ring-emerald-200">{children}</div>;
}

/** Destructive-action dialog. */
export function ConfirmModal({
  title,
  message,
  confirmLabel,
  busy = false,
  error,
  onConfirm,
  onCancel,
}: {
  title: string;
  message: string;
  confirmLabel: string;
  busy?: boolean;
  error?: unknown;
  onConfirm: () => void;
  onCancel: () => void;
}) {
  return (
    <Modal title={title} onClose={onCancel}>
      <div className="space-y-4">
        <p className="text-sm text-slate-600">{message}</p>
        <ErrorNote error={error} />
        <div className="flex justify-end gap-2">
          <Button tone="secondary" onClick={onCancel} disabled={busy}>
            Retour
          </Button>
          <Button tone="danger" onClick={onConfirm} busy={busy}>
            {confirmLabel}
          </Button>
        </div>
      </div>
    </Modal>
  );
}

/** Refreshes every query of the farm: tasks also feed alerts and the dashboard. */
export function invalidateFarm(queryClient: QueryClient, farmId: string): Promise<void> {
  return queryClient.invalidateQueries({ predicate: (q) => q.queryKey[1] === farmId });
}

/** The server gives a public path; the same path is reused when a logo is replaced. */
export function farmLogoSrc(farm: Pick<FarmWithLogo, 'logoUrl'> | null, version = 0): string | null {
  const raw = farm?.logoUrl?.trim();
  if (!raw) return null;
  const url = /^https?:\/\//i.test(raw) ? raw : `${API_BASE}${raw.startsWith('/') ? raw : `/${raw}`}`;
  return version ? `${url}?v=${version}` : url;
}

/** Sends the farm logo (multipart, `file`); the server caps it at 2 MiB. */
export async function uploadFarmLogo(farmId: string, file: File): Promise<FarmWithLogo> {
  const form = new FormData();
  form.append('file', file, file.name);
  try {
    return await api.upload<FarmWithLogo>(`/farms/${farmId}/logo`, form);
  } catch (err) {
    // A 413 from the proxy has no French message.
    if (err instanceof ApiError && err.status === 413) throw new ApiError(413, 'Le logo ne doit pas dépasser 2 Mo.');
    throw err;
  }
}
