import type { ReactNode } from 'react';
import { useState } from 'react';
import { Download, Package, Wheat } from 'lucide-react';
import { api } from '../../api/client';
import { Button, ErrorNote, Modal } from '../form';
import { IconTile, PhotoThumb } from '../ui';
import { EGG_IMAGES, SPECIES_IMAGES } from '../../lib/animalImages';
import { classNames } from '../../lib/format';
import { LEVEL_LABEL } from './labels';
import type { PosProduct } from './pos';

/** Photo or icon of a basket article: the lot's photo first, as on the mobile register. */
export function ProductThumb({
  product,
  photo,
  size = 'sm',
}: {
  product: PosProduct;
  photo?: string | null;
  size?: 'sm' | 'md';
}) {
  if (product === 'PROVENDE') return <IconTile icon={<Wheat />} tone="amber" size={size} />;
  if (product === 'AUTRE') return <IconTile icon={<Package />} tone="slate" size={size} />;
  return <PhotoThumb src={photo ?? (product === 'OEUF' ? EGG_IMAGES.alveole : SPECIES_IMAGES.POULET)} size={size} />;
}

/** Modal asking before a destructive or irreversible action. */
export function ConfirmDialog({
  title,
  children,
  confirmLabel,
  confirmIcon,
  cancelLabel = 'Annuler',
  tone = 'danger',
  busy,
  error,
  onConfirm,
  onClose,
}: {
  title: string;
  children: ReactNode;
  confirmLabel: string;
  confirmIcon?: ReactNode;
  cancelLabel?: string;
  tone?: 'danger' | 'primary';
  busy?: boolean;
  error?: unknown;
  onConfirm: () => void;
  onClose: () => void;
}) {
  return (
    <Modal title={title} onClose={onClose}>
      <div className="space-y-4">
        <div className="text-sm text-slate-600">{children}</div>
        <ErrorNote error={error} />
        <div className="flex justify-end gap-2">
          <Button tone="secondary" onClick={onClose} disabled={busy}>
            {cancelLabel}
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

/** Clickable filter pill with an optional count. */
export function FilterChip({
  label,
  count,
  active,
  onClick,
}: {
  label: string;
  count?: number;
  active: boolean;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-pressed={active}
      className={classNames(
        'rounded-full border px-3 py-1 text-xs font-medium transition',
        active
          ? 'border-brand-600 bg-brand-600 text-white'
          : 'border-slate-300 bg-white text-slate-600 hover:bg-slate-50',
      )}
    >
      {label}
      {count != null ? ` (${count})` : ''}
    </button>
  );
}

/** LevelBadge with a readable label instead of the raw level. */
export function AlertLevelBadge({ level }: { level: string }) {
  const tone =
    level === 'ROUGE'
      ? 'bg-red-50 text-red-700 ring-red-200'
      : level === 'JAUNE'
        ? 'bg-amber-50 text-amber-700 ring-amber-200'
        : 'bg-emerald-50 text-emerald-700 ring-emerald-200';
  return (
    <span className={classNames('inline-flex items-center rounded-full px-2 py-0.5 text-xs font-medium ring-1', tone)}>
      {LEVEL_LABEL[level] ?? '—'}
    </span>
  );
}

/** Downloads a sale's PDF receipt, showing progress and errors in place. */
export function ReceiptButton({
  farmId,
  saleId,
  reference,
  compact = false,
}: {
  farmId: string | null;
  saleId: string;
  reference: string;
  compact?: boolean;
}) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<unknown>(null);
  const download = async () => {
    setBusy(true);
    setError(null);
    try {
      await api.download(`/farms/${farmId}/sales/${saleId}/receipt`, `${reference}.pdf`);
    } catch (e) {
      setError(e);
    } finally {
      setBusy(false);
    }
  };
  return (
    <div className="space-y-2">
      <Button tone="secondary" busy={busy} onClick={() => void download()} className={compact ? 'px-2.5 py-1 text-xs' : undefined}>
        {busy ? null : <Download className="h-4 w-4" />}
        {compact ? 'PDF' : 'Télécharger le PDF'}
      </Button>
      <ErrorNote error={error} />
    </div>
  );
}
