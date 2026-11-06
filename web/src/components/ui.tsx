import type { ReactNode } from 'react';
import { Link } from 'react-router-dom';
import { Loader2 } from 'lucide-react';
import { classNames } from '../lib/format';
import { statusLabel } from '../lib/format';

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

/**
 * The one KPI tile of the console: label, big figure, hint, optional trend
 * and icon. Clickable when `onClick` or `to` is given.
 */
export function StatTile({
  label,
  value,
  hint,
  icon,
  image,
  onClick,
  to,
  actionLabel,
  trend,
  tone = 'default',
}: {
  label: string;
  value: ReactNode;
  hint?: ReactNode;
  icon?: ReactNode;
  /** Photo in place of the icon. */
  image?: string | null;
  onClick?: () => void;
  /** Internal link: the tile opens that route. */
  to?: string;
  /** Accessible name of the tile when it is clickable. */
  actionLabel?: string;
  /** Small trend line under the figure. */
  trend?: ReactNode;
  tone?: 'default' | 'good' | 'bad' | 'warn' | 'accent';
}) {
  const tones: Record<string, string> = {
    default: 'text-slate-900',
    good: 'text-emerald-700',
    bad: 'text-red-700',
    warn: 'text-amber-700',
    accent: 'text-accent-700',
  };
  const iconTones: Record<string, IconTone> = {
    default: 'brand',
    good: 'green',
    bad: 'red',
    warn: 'amber',
    accent: 'accent',
  };
  const clickable = Boolean(onClick || to);
  const card = (
    <Card className={classNames('h-full p-4', clickable && 'transition hover:border-slate-300 hover:shadow-md')}>
      <div className="flex items-start justify-between gap-2">
        <div className="min-w-0">
          <p className="text-xs font-medium text-slate-500">{label}</p>
          <p className={classNames('mt-1 truncate text-2xl font-bold tracking-tight tabular-nums', tones[tone])}>
            {value}
          </p>
          {trend ? <div className="mt-1 text-xs font-medium text-slate-600">{trend}</div> : null}
          {hint ? <p className="mt-1 text-xs text-slate-500">{hint}</p> : null}
        </div>
        {image ? <PhotoThumb src={image} size="md" /> : icon ? <IconTile icon={icon} tone={iconTones[tone]} size="sm" /> : null}
      </div>
    </Card>
  );
  if (to) {
    return (
      <Link to={to} aria-label={actionLabel} className="block h-full w-full rounded-2xl text-left">
        {card}
      </Link>
    );
  }
  if (!onClick) return card;
  return (
    <button type="button" onClick={onClick} aria-label={actionLabel} className="block h-full w-full rounded-2xl text-left">
      {card}
    </button>
  );
}

/** Former name of `StatTile`, kept for the pages that already use it. */
export const StatCard = StatTile;

/** Alert level (ROUGE / JAUNE / VERT) on the status palette. */
export function LevelBadge({ level }: { level: string }) {
  return <StatusBadge status={level} label={level} />;
}

/**
 * Status palette (`--color-status-*` in index.css): one meaning, one colour,
 * everywhere (farm status, account, report, alert).
 *  ok      = active, valid, delivered     (green)
 *  warning = in preparation, to watch     (amber)
 *  danger  = suspended, failed, red alert (red)
 *  info    = in progress, sent            (blue)
 *  neutral = closed, inactive, unknown    (grey)
 */
export type StatusTone = 'ok' | 'warning' | 'danger' | 'info' | 'neutral';

const STATUS_TONE_CLASS: Record<StatusTone, string> = {
  ok: 'bg-status-ok-bg text-status-ok-fg ring-status-ok-ring',
  warning: 'bg-status-warning-bg text-status-warning-fg ring-status-warning-ring',
  danger: 'bg-status-danger-bg text-status-danger-fg ring-status-danger-ring',
  info: 'bg-status-info-bg text-status-info-fg ring-status-info-ring',
  neutral: 'bg-status-neutral-bg text-status-neutral-fg ring-status-neutral-ring',
};

const STATUS_TONE: Record<string, StatusTone> = {
  ACTIF: 'ok',
  ACTIVE: 'ok',
  active: 'ok',
  OPEN: 'ok',
  CONFIRMED: 'ok',
  PROCESSED: 'ok',
  FAIT: 'ok',
  VERT: 'ok',
  PENDING: 'warning',
  DRAFT: 'warning',
  PLANIFIE: 'warning',
  JAUNE: 'warning',
  EN_RETARD: 'danger',
  ROUGE: 'danger',
  SUSPENDED: 'danger',
  REFUNDED: 'danger',
  EN_VENTE: 'info',
  SENT: 'info',
  CLOTURE: 'neutral',
  CLOSED: 'neutral',
  CANCELLED: 'neutral',
  ANNULE: 'neutral',
  RESOLUE: 'neutral',
  inactive: 'neutral',
};

/** Single status pill. Codes map to a tone by themselves; pass `tone` (and `label`) for anything else. */
export function StatusBadge({ status, tone, label }: { status?: string | null; tone?: StatusTone; label?: ReactNode }) {
  const resolved: StatusTone = tone ?? (status ? STATUS_TONE[status] : undefined) ?? 'neutral';
  return (
    <span
      className={classNames(
        'inline-flex items-center whitespace-nowrap rounded-full px-2 py-0.5 text-xs font-medium ring-1 ring-inset',
        STATUS_TONE_CLASS[resolved],
      )}
    >
      {label ?? statusLabel(status)}
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

export function EmptyState({
  message,
  icon,
  title,
  action,
}: {
  message: string;
  icon?: ReactNode;
  title?: string;
  /** Call to action: a button, or `{ label, to }` for a link. */
  action?: ReactNode | { label: string; to: string };
}) {
  const link = action && typeof action === 'object' && 'to' in action && 'label' in action ? action : null;
  return (
    <div className="flex flex-col items-center gap-3 rounded-xl border border-dashed border-slate-300 bg-slate-50 px-6 py-10 text-center text-sm text-slate-600">
      {icon ? <IconTile icon={icon} tone="slate" size="lg" /> : null}
      {title ? <p className="text-base font-semibold text-slate-800">{title}</p> : null}
      <p className="max-w-md">{message}</p>
      {link ? (
        <Link
          to={link.to}
          className="mt-1 inline-flex items-center gap-2 rounded-lg bg-brand-600 px-3.5 py-2 text-sm font-semibold text-white hover:bg-brand-700"
        >
          {link.label}
        </Link>
      ) : action ? (
        <div className="mt-1">{action as ReactNode}</div>
      ) : null}
    </div>
  );
}

/** Grey pulsing block: the shape of what is loading. */
export function Skeleton({ className }: { className?: string }) {
  return <div aria-hidden="true" className={classNames('animate-pulse rounded-md bg-slate-200/70', className)} />;
}

/** Table-shaped placeholder, for a list that loads. */
export function SkeletonRows({ rows = 6, label = 'Chargement…' }: { rows?: number; label?: string }) {
  return (
    <div role="status" aria-live="polite" className="space-y-3 p-4">
      <span className="sr-only">{label}</span>
      {Array.from({ length: rows }, (_, i) => (
        <div key={i} className="flex items-center gap-4">
          <Skeleton className="h-4 w-1/4" />
          <Skeleton className="h-4 w-1/6" />
          <Skeleton className="h-4 flex-1" />
          <Skeleton className="hidden h-4 w-1/6 sm:block" />
        </div>
      ))}
    </div>
  );
}

/** Row of KPI-tile placeholders. */
export function SkeletonTiles({ count = 6, label = 'Chargement…' }: { count?: number; label?: string }) {
  return (
    <div role="status" aria-live="polite" className="grid grid-cols-2 gap-3 sm:grid-cols-4 xl:grid-cols-6">
      <span className="sr-only">{label}</span>
      {Array.from({ length: count }, (_, i) => (
        <Card key={i} className="space-y-2 p-4">
          <Skeleton className="h-3 w-1/2" />
          <Skeleton className="h-7 w-2/3" />
          <Skeleton className="h-3 w-1/3" />
        </Card>
      ))}
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
      {label && children !== '' && children != null ? <div className="min-w-0 md:contents">{children}</div> : children}
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