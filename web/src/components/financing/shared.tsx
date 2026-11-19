import { useRef, useState, type ReactNode } from 'react';
import { Link } from 'react-router-dom';
import { ExternalLink, Paperclip } from 'lucide-react';
import {
  CLAIM_CLASS_LABELS,
  CONSENT_STATUS_LABELS,
  FINANCING_STEP_LABELS,
  type ClaimClass,
  type ConsentStatus,
  type FinancingStep,
} from '../../api/types-financing';
import { readFcfaInput, WHOLE_FCFA_MESSAGE } from '../../lib/amount';
import { classNames } from '../../lib/format';
import { Button, ErrorNote, inputCls } from '../form';
import { StatusBadge } from '../ui';
import { CLAIM_CLASS_TONES, CONSENT_TONES, DECISION_LABELS } from './financingLogic';
import { openFile } from './queries';
import type { FinancingDecision } from '../../api/types-financing';

export function ClaimClassBadge({ value }: { value: ClaimClass }) {
  return <StatusBadge tone={CLAIM_CLASS_TONES[value]} label={CLAIM_CLASS_LABELS[value]} />;
}

export function ConsentBadge({ value }: { value: ConsentStatus }) {
  return <StatusBadge tone={CONSENT_TONES[value]} label={CONSENT_STATUS_LABELS[value]} />;
}

export function StepBadge({ step, decision }: { step: FinancingStep; decision?: FinancingDecision | null }) {
  const label = decision && step !== 'DEMANDE' && step !== 'INSTRUCTION' ? `${FINANCING_STEP_LABELS[step]} · ${DECISION_LABELS[decision]}` : FINANCING_STEP_LABELS[step];
  return <StatusBadge tone={step === 'CLOTURE' ? 'neutral' : step === 'SUIVI' || step === 'DECAISSEMENT' ? 'ok' : 'info'} label={label} />;
}

/** A labelled value of a definition list; the label and its value stay together. */
export function Fact({ label, children, className }: { label: string; children?: ReactNode; className?: string }) {
  return (
    <div className={classNames('min-w-0', className)}>
      <dt className="text-xs text-slate-500">{label}</dt>
      <dd className="text-sm text-slate-900">{children == null || children === '' ? '—' : children}</dd>
    </div>
  );
}

export function SectionTitle({ children, action }: { children: ReactNode; action?: ReactNode }) {
  return (
    <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
      <h2 className="text-sm font-semibold text-slate-800">{children}</h2>
      {action}
    </div>
  );
}

/** Whole-francs field (`lib/amount.ts`): digits and group spaces, a comma or a point is refused with the message. */
export function FcfaInput({
  value,
  onChange,
  id,
  disabled,
  required,
  placeholder = '0',
  'aria-label': ariaLabel,
}: {
  value: number | null;
  onChange: (n: number | null) => void;
  id?: string;
  disabled?: boolean;
  required?: boolean;
  placeholder?: string;
  'aria-label'?: string;
}) {
  const [refused, setRefused] = useState(false);
  return (
    <div>
      <div className="relative">
        <input
          id={id}
          inputMode="numeric"
          autoComplete="off"
          className={classNames(inputCls, 'pr-14 text-right tabular-nums')}
          placeholder={placeholder}
          disabled={disabled}
          required={required}
          aria-label={ariaLabel}
          aria-invalid={refused || undefined}
          value={value == null ? '' : value.toLocaleString('fr-FR')}
          onChange={(e) => {
            const read = readFcfaInput(e.target.value);
            if (!read.ok) {
              setRefused(true);
              return;
            }
            setRefused(false);
            onChange(read.digits === '' ? null : Number(read.digits));
          }}
        />
        <span className="pointer-events-none absolute right-3 top-1/2 -translate-y-1/2 text-xs text-slate-400">FCFA</span>
      </div>
      {refused ? (
        <p role="alert" className="mt-1 text-xs text-red-600">
          {WHOLE_FCFA_MESSAGE}
        </p>
      ) : null}
    </div>
  );
}

/** A file picker as a button; the chosen name stays visible next to it. */
export function FilePick({
  file,
  onPick,
  accept = '.pdf,image/png,image/jpeg,image/webp',
  label = 'Choisir un fichier',
  disabled,
}: {
  file: File | null;
  onPick: (f: File | null) => void;
  accept?: string;
  label?: string;
  disabled?: boolean;
}) {
  const ref = useRef<HTMLInputElement>(null);
  return (
    <div className="flex flex-wrap items-center gap-2">
      <input ref={ref} type="file" accept={accept} className="sr-only" tabIndex={-1} aria-hidden onChange={(e) => onPick(e.target.files?.[0] ?? null)} />
      <Button tone="secondary" disabled={disabled} onClick={() => ref.current?.click()}>
        <Paperclip className="h-4 w-4" /> {file ? 'Changer de fichier' : label}
      </Button>
      {file ? <span className="min-w-0 truncate text-sm text-slate-700">{file.name}</span> : <span className="text-sm text-slate-500">Aucun fichier choisi</span>}
    </div>
  );
}

/** A button-link that opens an authenticated file in a new tab; its own error stays under it. */
export function OpenFileButton({ path, label, tone = 'secondary' }: { path: string; label: string; tone?: 'secondary' | 'primary' }) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<unknown>(null);
  return (
    <span className="inline-flex flex-col gap-1">
      <Button
        tone={tone}
        busy={busy}
        onClick={() => {
          setBusy(true);
          setError(null);
          openFile(path)
            .catch(setError)
            .finally(() => setBusy(false));
        }}
      >
        <ExternalLink className="h-4 w-4" /> {label}
      </Button>
      <ErrorNote error={error} />
    </span>
  );
}

/** Small text link to a 360° view. */
export function FarmLink({ to, children }: { to: string; children: ReactNode }) {
  return (
    <Link to={to} className="font-medium text-brand-700 hover:underline">
      {children}
    </Link>
  );
}

/** Tab strip: buttons with `role=tab`, the panel is rendered by the caller. */
export function Tabs<T extends string>({
  tabs,
  value,
  onChange,
  label,
}: {
  tabs: ReadonlyArray<{ key: T; label: string; badge?: ReactNode }>;
  value: T;
  onChange: (key: T) => void;
  label: string;
}) {
  return (
    <div role="tablist" aria-label={label} className="-mx-1 flex gap-1 overflow-x-auto border-b border-slate-200 px-1">
      {tabs.map((t) => (
        <button
          key={t.key}
          type="button"
          role="tab"
          id={`tab-${t.key}`}
          aria-selected={value === t.key}
          aria-controls={`panel-${t.key}`}
          onClick={() => onChange(t.key)}
          className={classNames(
            'inline-flex shrink-0 items-center gap-1.5 whitespace-nowrap border-b-2 px-3 py-2.5 text-sm font-medium transition',
            value === t.key ? 'border-brand-600 text-brand-700' : 'border-transparent text-slate-500 hover:text-slate-800',
          )}
        >
          {t.label}
          {t.badge}
        </button>
      ))}
    </div>
  );
}
