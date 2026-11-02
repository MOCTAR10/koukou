import { CheckCircle2 } from 'lucide-react';
import type { ReactNode } from 'react';
import { classNames } from '../../lib/format';
import { Button, ErrorNote, Modal } from '../form';

/** Confirmation dialog for destructive actions; keeps server errors in view. */
export function ConfirmModal({
  title,
  children,
  confirmLabel,
  busy,
  error,
  onConfirm,
  onCancel,
}: {
  title: string;
  children: ReactNode;
  confirmLabel: string;
  busy: boolean;
  error: unknown;
  onConfirm: () => void;
  onCancel: () => void;
}) {
  return (
    <Modal title={title} onClose={onCancel}>
      <div className="space-y-4">
        <div className="space-y-2 text-sm text-slate-600">{children}</div>
        <ErrorNote error={error} />
        <div className="flex justify-end gap-2">
          <Button tone="secondary" onClick={onCancel} disabled={busy}>
            Annuler
          </Button>
          <Button tone="danger" busy={busy} onClick={onConfirm}>
            {confirmLabel}
          </Button>
        </div>
      </div>
    </Modal>
  );
}

export function SuccessNote({ children }: { children: ReactNode }) {
  return (
    <div className="flex items-start gap-2 rounded-lg bg-emerald-50 px-3 py-2 text-sm text-emerald-700 ring-1 ring-emerald-200">
      <CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0" />
      <div className="whitespace-pre-line">{children}</div>
    </div>
  );
}

export function SectionTitle({ title, subtitle }: { title: string; subtitle?: string }) {
  return (
    <div className="mb-3">
      <h2 className="text-base font-semibold text-slate-900">{title}</h2>
      {subtitle ? <p className="mt-0.5 text-xs text-slate-500">{subtitle}</p> : null}
    </div>
  );
}

/** Label / value line of a summary block. */
export function KeyValue({
  label,
  value,
  strong,
  tone,
}: {
  label: string;
  value: string;
  strong?: boolean;
  tone?: 'good' | 'bad' | 'muted';
}) {
  return (
    <div className="flex items-baseline justify-between gap-4 py-1 text-sm">
      <span className={classNames(strong ? 'font-semibold text-slate-800' : 'text-slate-500')}>{label}</span>
      <span
        className={classNames(
          'shrink-0 tabular-nums',
          strong ? 'font-bold' : 'font-medium',
          tone === 'good'
            ? 'text-emerald-600'
            : tone === 'bad'
              ? 'text-red-600'
              : tone === 'muted'
                ? 'text-slate-500'
                : 'text-slate-800',
        )}
      >
        {value}
      </span>
    </div>
  );
}
