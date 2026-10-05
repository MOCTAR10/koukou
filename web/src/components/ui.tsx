import type { ReactNode } from 'react';
import { Loader2 } from 'lucide-react';
import { classNames } from '../lib/format';
import { statusLabel } from '../lib/format';
import { bgClassForLevel } from '../lib/format';

export function Card({
  children,
  className,
}: {
  children: ReactNode;
  className?: string;
}) {
  return (
    <div
      className={classNames(
        'rounded-xl border border-slate-200 bg-white shadow-sm',
        className,
      )}
    >
      {children}
    </div>
  );
}

export function PageHeader({
  title,
  subtitle,
  actions,
}: {
  title: string;
  subtitle?: string;
  actions?: ReactNode;
}) {
  return (
    <div className="mb-6 flex flex-wrap items-start justify-between gap-3">
      <div>
        <h1 className="text-xl font-bold text-slate-900">{title}</h1>
        {subtitle ? <p className="mt-1 text-sm text-slate-500">{subtitle}</p> : null}
      </div>
      {actions ? <div className="flex flex-wrap items-center gap-2">{actions}</div> : null}
    </div>
  );
}

export function StatCard({
  label,
  value,
  hint,
  icon,
  tone = 'default',
}: {
  label: string;
  value: ReactNode;
  hint?: ReactNode;
  icon?: ReactNode;
  tone?: 'default' | 'good' | 'bad' | 'warn' | 'accent';
}) {
  const tones: Record<string, string> = {
    default: 'text-slate-900',
    good: 'text-emerald-600',
    bad: 'text-red-600',
    warn: 'text-amber-600',
    accent: 'text-sky-600',
  };
  return (
    <Card className="p-4">
      <div className="flex items-start justify-between gap-2">
        <div className="min-w-0">
          <p className="text-xs font-medium uppercase tracking-wide text-slate-500">
            {label}
          </p>
          <p className={classNames('mt-1 truncate text-2xl font-bold', tones[tone])}>
            {value}
          </p>
          {hint ? <p className="mt-1 text-xs text-slate-500">{hint}</p> : null}
        </div>
        {icon ? <div className="shrink-0 text-slate-400">{icon}</div> : null}
      </div>
    </Card>
  );
}

export function LevelBadge({ level }: { level: string }) {
  return (
    <span
      className={classNames(
        'inline-flex items-center rounded-full px-2 py-0.5 text-xs font-medium ring-1',
        bgClassForLevel(level),
      )}
    >
      {level}
    </span>
  );
}

export function StatusBadge({ status }: { status: string }) {
  const tone =
    status === 'ACTIF' || status === 'ACTIVE' || status === 'OPEN'
      ? 'bg-emerald-50 text-emerald-700 ring-emerald-200'
      : status === 'CLOTURE' || status === 'CANCELLED' || status === 'CLOSED' || status === 'RESOLUE'
        ? 'bg-slate-100 text-slate-500 ring-slate-200'
        : status === 'EN_VENTE' || status === 'SENT'
          ? 'bg-sky-50 text-sky-700 ring-sky-200'
          : 'bg-slate-100 text-slate-600 ring-slate-200';
  return (
    <span
      className={classNames(
        'inline-flex items-center rounded-full px-2 py-0.5 text-xs font-medium ring-1',
        tone,
      )}
    >
      {statusLabel(status)}
    </span>
  );
}

export function Loading({ label = 'Chargement…' }: { label?: string }) {
  return (
    <div className="flex items-center gap-2 text-sm text-slate-500">
      <Loader2 className="h-4 w-4 animate-spin" />
      {label}
    </div>
  );
}

export function EmptyState({ message }: { message: string }) {
  return (
    <div className="rounded-xl border border-dashed border-slate-300 bg-slate-50 px-6 py-10 text-center text-sm text-slate-500">
      {message}
    </div>
  );
}

export function Th({ children, className }: { children?: ReactNode; className?: string }) {
  return (
    <th className={classNames('whitespace-nowrap px-3 py-2.5 text-left text-xs font-semibold uppercase tracking-wide text-slate-500', className)}>
      {children}
    </th>
  );
}

export function Td({ children, className }: { children?: ReactNode; className?: string }) {
  return (
    <td className={classNames('px-3 py-2.5 text-sm text-slate-700', className)}>
      {children}
    </td>
  );
}