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
        'rounded-2xl border border-slate-200 bg-white shadow-card',
        className,
      )}
    >
      {children}
    </div>
  );
}

export type IconTone = 'brand' | 'green' | 'amber' | 'red' | 'accent' | 'slate';

const TILE_TONES: Record<IconTone, string> = {
  brand: 'bg-brand-600/10 text-brand-700',
  green: 'bg-emerald-600/10 text-emerald-700',
  amber: 'bg-amber-500/15 text-amber-700',
  red: 'bg-red-600/10 text-red-700',
  accent: 'bg-accent-500/15 text-accent-700',
  slate: 'bg-slate-500/10 text-slate-600',
};

const TILE_SIZES = {
  sm: 'h-8 w-8 rounded-lg [&>svg]:h-4 [&>svg]:w-4',
  md: 'h-10 w-10 rounded-xl [&>svg]:h-5 [&>svg]:w-5',
  lg: 'h-12 w-12 rounded-2xl [&>svg]:h-6 [&>svg]:w-6',
};

/** Tinted square behind an icon. */
export function IconTile({
  icon,
  tone = 'brand',
  size = 'md',
  className,
}: {
  icon: ReactNode;
  tone?: IconTone;
  size?: keyof typeof TILE_SIZES;
  className?: string;
}) {
  return (
    <span
      aria-hidden="true"
      className={classNames(
        'inline-flex shrink-0 items-center justify-center',
        TILE_TONES[tone],
        TILE_SIZES[size],
        className,
      )}
    >
      {icon}
    </span>
  );
}

/** Whole photo of a breed, species or egg, never cropped. Decorative: the name sits next to it. */
export function PhotoThumb({
  src,
  size = 'md',
  className,
}: {
  src: string | null | undefined;
  size?: 'sm' | 'md' | 'lg';
  className?: string;
}) {
  const box = { sm: 'h-8 w-8', md: 'h-10 w-10', lg: 'h-14 w-14' }[size];
  if (!src) return null;
  return (
    <img
      src={src}
      alt=""
      loading="lazy"
      className={classNames('shrink-0 rounded-xl bg-white object-contain ring-1 ring-slate-200', box, className)}
    />
  );
}

export function PageHeader({
  title,
  subtitle,
  actions,
  icon,
  iconTone = 'brand',
}: {
  title: string;
  subtitle?: string;
  actions?: ReactNode;
  icon?: ReactNode;
  iconTone?: IconTone;
}) {
  return (
    <div className="mb-6 flex flex-wrap items-start justify-between gap-3">
      <div className="flex min-w-0 items-center gap-3">
        {icon ? <IconTile icon={icon} tone={iconTone} size="md" /> : null}
        <div className="min-w-0">
          <h1 className="text-2xl font-bold tracking-tight text-slate-900 lg:text-[1.75rem] lg:leading-tight">{title}</h1>
          {subtitle ? <p className="mt-1 text-sm text-slate-500">{subtitle}</p> : null}
        </div>
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
  image,
  onClick,
  actionLabel,
  tone = 'default',
}: {
  label: string;
  value: ReactNode;
  hint?: ReactNode;
  icon?: ReactNode;
  /** Photo in place of the icon. */
  image?: string | null;
  onClick?: () => void;
  /** Accessible name of the card when it is clickable. */
  actionLabel?: string;
  tone?: 'default' | 'good' | 'bad' | 'warn' | 'accent';
}) {
  const tones: Record<string, string> = {
    default: 'text-slate-900',
    good: 'text-emerald-600',
    bad: 'text-red-600',
    warn: 'text-amber-600',
    accent: 'text-accent-700',
  };
  const iconTones: Record<string, IconTone> = {
    default: 'brand',
    good: 'green',
    bad: 'red',
    warn: 'amber',
    accent: 'accent',
  };
  const card = (
    <Card className={classNames('h-full p-4', onClick && 'transition hover:border-slate-300 hover:shadow-md')}>
      <div className="flex items-start justify-between gap-2">
        <div className="min-w-0">
          <p className="text-xs font-medium text-slate-500">{label}</p>
          <p className={classNames('mt-1 truncate text-2xl font-bold tracking-tight tabular-nums', tones[tone])}>
            {value}
          </p>
          {hint ? <p className="mt-1 text-xs text-slate-500">{hint}</p> : null}
        </div>
        {image ? <PhotoThumb src={image} size="md" /> : icon ? <IconTile icon={icon} tone={iconTones[tone]} size="sm" /> : null}
      </div>
    </Card>
  );
  if (!onClick) return card;
  return (
    <button type="button" onClick={onClick} aria-label={actionLabel} className="block h-full w-full rounded-2xl text-left">
      {card}
    </button>
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

export function EmptyState({ message, icon }: { message: string; icon?: ReactNode }) {
  return (
    <div className="flex flex-col items-center gap-3 rounded-xl border border-dashed border-slate-300 bg-slate-50 px-6 py-10 text-center text-sm text-slate-500">
      {icon ? <IconTile icon={icon} tone="slate" size="lg" /> : null}
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

/** `label`: the column name, shown beside the value when a `DataTable` stacks on a phone. */
export function Td({ children, className, label }: { children?: ReactNode; className?: string; label?: string }) {
  return (
    <td data-label={label} className={classNames('px-3 py-2.5 text-sm text-slate-700', className)}>
      {label ? <div className="min-w-0 md:contents">{children}</div> : children}
    </td>
  );
}

/** A table on a computer, with its header kept in view; stacked rows on a phone. Give each `Td` its `label`. */
export function DataTable({ children }: { children: ReactNode }) {
  return (
    <div className="overflow-x-auto md:max-h-[calc(100vh-9rem)] md:overflow-y-auto">
      <table className="data-table w-full">{children}</table>
    </div>
  );
}

export function IconButton({
  label,
  danger = false,
  onClick,
  children,
}: {
  label: string;
  danger?: boolean;
  onClick: () => void;
  children: ReactNode;
}) {
  return (
    <button
      type="button"
      title={label}
      aria-label={label}
      onClick={onClick}
      className={classNames('rounded-lg p-1.5 hover:bg-slate-100', danger ? 'text-red-500' : 'text-slate-500')}
    >
      {children}
    </button>
  );
}