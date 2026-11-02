import { useEffect, useState, type ReactNode } from 'react';
import { Check, Clock, Home, Loader2, MapPin, Store, Ticket, Truck, X, type LucideIcon } from 'lucide-react';
import { Button, ErrorNote, Modal, inputCls } from '../form';
import { classNames } from '../../lib/format';
import { GABON_PROVINCES, suggestGabonAddress, type GeoResult } from './geo';
import { ORDER_STATUS_LABEL } from './helpers';

const ORDER_STATUS_TONE: Record<string, string> = {
  PENDING: 'bg-amber-50 text-amber-700 ring-amber-200',
  CONFIRMED: 'bg-brand-50 text-brand-700 ring-brand-200',
  LIVRE: 'bg-emerald-50 text-emerald-700 ring-emerald-200',
  CANCELLED: 'bg-red-50 text-red-700 ring-red-200',
};

const ORDER_STATUS_ICON: Record<string, LucideIcon> = { PENDING: Clock, CONFIRMED: Check, LIVRE: Truck, CANCELLED: X };

const CANAL_ICON: Record<string, LucideIcon> = { FERME: Home, PRECOMMANDE: Store, LIVRAISON: Truck };

export function CanalIcon({ canal, className }: { canal: string; className?: string }) {
  const Icon = CANAL_ICON[canal] ?? Ticket;
  return <Icon className={className} />;
}

export function Pill({ tone, children }: { tone: string; children: ReactNode }) {
  return (
    <span className={classNames('inline-flex items-center gap-1 whitespace-nowrap rounded-full px-2 py-0.5 text-xs font-medium ring-1', tone)}>
      {children}
    </span>
  );
}

export function OrderStatusBadge({ status }: { status: string }) {
  const Icon = ORDER_STATUS_ICON[status];
  return (
    <Pill tone={ORDER_STATUS_TONE[status] ?? 'bg-slate-100 text-slate-600 ring-slate-200'}>
      {Icon ? <Icon className="h-3 w-3" /> : null}
      {ORDER_STATUS_LABEL[status] ?? status}
    </Pill>
  );
}

/** Row of mutually exclusive options. */
export function Segmented<K extends string>({
  value,
  options,
  onChange,
  ariaLabel,
}: {
  value: K;
  options: { key: K; label: string; icon?: ReactNode }[];
  onChange: (key: K) => void;
  ariaLabel: string;
}) {
  return (
    <div role="group" aria-label={ariaLabel} className="flex flex-wrap gap-1.5">
      {options.map((o) => (
        <button
          key={o.key}
          type="button"
          aria-pressed={value === o.key}
          onClick={() => onChange(o.key)}
          className={classNames(
            'inline-flex items-center gap-1.5 rounded-full border px-3 py-1.5 text-xs font-semibold transition [&>svg]:h-3.5 [&>svg]:w-3.5',
            value === o.key
              ? 'border-brand-600 bg-brand-600 text-white'
              : 'border-slate-300 bg-white text-slate-600 hover:bg-slate-50',
          )}
        >
          {o.icon}
          {o.label}
        </button>
      ))}
    </div>
  );
}

/** Confirmation dialog for a destructive or irreversible action. */
export function ConfirmDialog({
  title,
  message,
  confirmLabel,
  confirmIcon,
  tone = 'danger',
  busy,
  error,
  onConfirm,
  onClose,
}: {
  title: string;
  message: ReactNode;
  confirmLabel: string;
  confirmIcon?: ReactNode;
  tone?: 'danger' | 'primary';
  busy: boolean;
  error: unknown;
  onConfirm: () => void;
  onClose: () => void;
}) {
  return (
    <Modal title={title} onClose={onClose}>
      <div className="space-y-4">
        <div className="space-y-2 text-sm text-slate-600">{message}</div>
        <ErrorNote error={error} />
        <div className="flex justify-end gap-2">
          <Button tone="secondary" onClick={onClose} disabled={busy}>
            Retour
          </Button>
          <Button tone={tone} busy={busy} onClick={onConfirm}>
            {busy ? null : confirmIcon}
            {confirmLabel}
          </Button>
        </div>
      </div>
    </Modal>
  );
}

export function ProvinceSelect({
  value,
  onChange,
  emptyLabel = 'Choisir une province',
  ariaLabel,
}: {
  value: string;
  onChange: (province: string) => void;
  emptyLabel?: string;
  ariaLabel?: string;
}) {
  return (
    <div className="relative">
      <MapPin className="pointer-events-none absolute left-3 top-2.5 h-4 w-4 text-slate-400" />
      <select aria-label={ariaLabel} value={value} onChange={(e) => onChange(e.target.value)} className={classNames(inputCls, 'pl-9')}>
        <option value="">{emptyLabel}</option>
        {GABON_PROVINCES.map((p) => (
          <option key={p.name} value={p.name}>
            {p.name} ({p.capital})
          </option>
        ))}
      </select>
    </div>
  );
}

export interface AddressValue {
  address: string;
  latitude: number | null;
  longitude: number | null;
}

/**
 * Address box with OpenStreetMap suggestions. Typing keeps a hand-written
 * address (no coordinates); picking a suggestion also stores its position.
 */
export function AddressField({
  value,
  province,
  onChange,
  label,
}: {
  value: AddressValue;
  province: string;
  onChange: (next: AddressValue) => void;
  label: string;
}) {
  // Only what the user types is searched, never the address loaded for editing.
  const [query, setQuery] = useState('');
  const [suggestions, setSuggestions] = useState<GeoResult[]>([]);
  const [searching, setSearching] = useState(false);

  useEffect(() => {
    const q = query.trim();
    if (q.length < 3) {
      setSuggestions([]);
      setSearching(false);
      return;
    }
    let stale = false;
    setSearching(true);
    const timer = setTimeout(() => {
      void suggestGabonAddress(q, province || null).then((found) => {
        if (stale) return;
        setSuggestions(found);
        setSearching(false);
      });
    }, 300);
    return () => {
      stale = true;
      clearTimeout(timer);
    };
  }, [query, province]);

  const located = value.latitude != null && value.longitude != null;

  return (
    <div>
      <label htmlFor="address-field" className="mb-1 block text-xs font-medium text-slate-600">
        {label}
      </label>
      <div className="relative">
        <input
          id="address-field"
          autoComplete="off"
          value={value.address}
          placeholder="Rue, marché, quartier, repère…"
          onChange={(e) => {
            setQuery(e.target.value);
            onChange({ address: e.target.value, latitude: null, longitude: null });
          }}
          className={classNames(inputCls, 'pr-9')}
        />
        <span className="pointer-events-none absolute right-3 top-2.5 text-slate-400">
          {searching ? (
            <Loader2 className="h-4 w-4 animate-spin" />
          ) : located ? (
            <Check className="h-4 w-4 text-emerald-600" aria-label="Adresse localisée" />
          ) : (
            <MapPin className="h-4 w-4" />
          )}
        </span>
      </div>
      {suggestions.length > 0 ? (
        <ul className="mt-1 max-h-48 overflow-y-auto rounded-lg border border-slate-200 bg-white text-sm shadow-sm">
          {suggestions.map((s) => (
            <li key={`${s.latitude}-${s.longitude}-${s.label}`}>
              <button
                type="button"
                className="flex w-full items-start gap-2 px-3 py-2 text-left hover:bg-slate-50"
                onClick={() => {
                  onChange({ address: s.label, latitude: s.latitude, longitude: s.longitude });
                  setQuery('');
                }}
              >
                <MapPin className="mt-0.5 h-3.5 w-3.5 shrink-0 text-brand-600" />
                <span className="text-slate-700">{s.label}</span>
              </button>
            </li>
          ))}
        </ul>
      ) : (
        <p className="mt-1 text-xs text-slate-400">
          {located
            ? 'Adresse localisée sur la carte.'
            : 'Tapez au moins 3 lettres pour chercher sur OpenStreetMap, ou gardez votre saisie.'}
        </p>
      )}
    </div>
  );
}
