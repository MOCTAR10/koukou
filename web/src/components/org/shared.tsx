import type { QueryClient } from '@tanstack/react-query';
import type { ReactNode } from 'react';
import { ApiError, clearSession, getToken } from '../../api/client';
import type { ContractType, FarmWithLogo, StaffRole, TaskStatus } from '../../api/types-org';
import { classNames } from '../../lib/format';
import { Button, ErrorNote, Modal } from '../form';

const API_BASE: string = import.meta.env.VITE_API_URL ?? 'http://localhost:3000';

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

/** Multipart upload: the shared client only sends JSON. */
export async function uploadFarmLogo(farmId: string, file: File): Promise<FarmWithLogo> {
  const form = new FormData();
  form.append('file', file, file.name);
  const token = getToken();
  const res = await fetch(`${API_BASE}/farms/${farmId}/logo`, {
    method: 'POST',
    headers: token ? { Authorization: `Bearer ${token}` } : {},
    body: form,
  });
  if (res.status === 401) {
    clearSession();
    window.location.replace('/login');
  }
  if (res.status === 413) throw new ApiError(413, 'Le logo ne doit pas dépasser 2 Mo.');
  if (!res.ok) {
    const data = (await res.json().catch(() => null)) as { message?: string | string[] } | null;
    const msg = data?.message;
    throw new ApiError(res.status, Array.isArray(msg) ? msg.join(', ') : (msg ?? `Erreur serveur (${res.status})`));
  }
  return (await res.json()) as FarmWithLogo;
}
