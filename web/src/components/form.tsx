import { useEffect, useRef, useState, type ButtonHTMLAttributes, type ReactNode } from 'react';
import { AlertTriangle, CalendarDays, Loader2, X } from 'lucide-react';
import { ApiError } from '../api/client';
import { checkTypedDate } from '../lib/dateInput';
import { classNames, isoToFr } from '../lib/format';
import { librevilleDay } from '../lib/libreville';

export const inputCls =
  'w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm text-slate-900 outline-none focus:border-brand-500 focus:ring-2 focus:ring-brand-100 disabled:bg-slate-50 disabled:text-slate-400';

/**
 * `inputCls` without `w-full`, for a field sized by its own width class
 * (`w-40`, `w-auto`): with Tailwind v4, `w-full` would win over it.
 */
export const inlineInputCls = inputCls.replace('w-full ', '');

export function Field({
  label,
  hint,
  children,
  className,
}: {
  label: string;
  hint?: string;
  children: ReactNode;
  className?: string;
}) {
  return (
    <label className={classNames('block', className)}>
      <span className="mb-1 block text-xs font-medium text-slate-600">{label}</span>
      {children}
      {hint ? <span className="mt-1 block text-xs text-slate-400">{hint}</span> : null}
    </label>
  );
}

const TONES = {
  primary: 'bg-brand-600 text-white hover:bg-brand-700',
  secondary: 'border border-slate-300 bg-white text-slate-700 hover:bg-slate-50',
  danger: 'bg-red-600 text-white hover:bg-red-700',
} as const;

export function Button({
  tone = 'primary',
  busy = false,
  className,
  children,
  disabled,
  type = 'button',
  ...rest
}: ButtonHTMLAttributes<HTMLButtonElement> & { tone?: keyof typeof TONES; busy?: boolean }) {
  return (
    <button
      type={type}
      disabled={disabled || busy}
      className={classNames(
        'inline-flex items-center justify-center gap-2 rounded-lg px-3.5 py-2 text-sm font-semibold transition disabled:opacity-60',
        TONES[tone],
        className,
      )}
      {...rest}
    >
      {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : null}
      {children}
    </button>
  );
}

/** Message of a failed call: the server's French text, or a network hint. */
export function errorMessage(err: unknown): string {
  if (err instanceof ApiError) return err.message;
  return 'Impossible de contacter le serveur. Réessayez plus tard.';
}

export function ErrorNote({ error }: { error: unknown }) {
  if (!error) return null;
  return (
    <div className="flex items-start gap-2 rounded-lg bg-red-50 px-3 py-2 text-sm text-red-700 ring-1 ring-red-200">
      <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" />
      <span>{typeof error === 'string' ? error : errorMessage(error)}</span>
    </div>
  );
}

const openDialogs: object[] = [];

/** A long form on a computer: the main fields, then a narrower column. One column, in the same order, below `lg`. */
export function FormColumns({ children }: { children: ReactNode }) {
  return <div className="grid items-start gap-5 lg:grid-cols-[minmax(0,1fr)_24rem]">{children}</div>;
}

export function Modal({
  title,
  onClose,
  children,
  wide = false,
  large = false,
  side = false,
}: {
  title: string;
  onClose: () => void;
  children: ReactNode;
  wide?: boolean;
  /** Room for a long form on two columns (`FormColumns`) on a computer. */
  large?: boolean;
  /** A detail panel on the right edge; full screen on a phone. */
  side?: boolean;
}) {
  const dialog = useRef<HTMLDivElement>(null);
  const self = useRef({});
  // Keyboard users start inside the dialog, unless a field already took the focus.
  // On closing, they go back to what opened it.
  useEffect(() => {
    const opener = document.activeElement;
    if (dialog.current && !dialog.current.contains(opener)) dialog.current.focus();
    return () => {
      if (opener instanceof HTMLElement && opener.isConnected && opener !== document.body) opener.focus();
    };
  }, []);

  useEffect(() => {
    const me = self.current;
    openDialogs.push(me);
    return () => {
      openDialogs.splice(openDialogs.indexOf(me), 1);
    };
  }, []);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      // Escape closes only the dialog on top: a confirmation opened from a panel must leave the panel open.
      if (e.key !== 'Escape' || e.defaultPrevented || openDialogs[openDialogs.length - 1] !== self.current) return;
      e.preventDefault();
      onClose();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose]);

  const header = (
    <div className="flex items-center justify-between gap-3 border-b border-slate-100 px-5 py-4">
      <h2 className="min-w-0 truncate text-base font-semibold text-slate-900">{title}</h2>
      <button onClick={onClose} className="rounded p-1 text-slate-400 hover:text-slate-700" aria-label="Fermer">
        <X className="h-5 w-5" />
      </button>
    </div>
  );

  if (side) {
    return (
      <div
        className="fixed inset-0 z-50 flex justify-end bg-brand-950/50"
        onClick={(e) => {
          if (e.target === e.currentTarget) onClose();
        }}
      >
        <div
          ref={dialog}
          tabIndex={-1}
          role="dialog"
          aria-modal="true"
          aria-label={title}
          className={classNames('side-panel flex w-full flex-col bg-white shadow-2xl outline-none', wide ? 'sm:max-w-2xl xl:max-w-3xl' : 'sm:max-w-lg xl:max-w-xl')}
        >
          {header}
          <div className="flex-1 overflow-y-auto p-5">{children}</div>
        </div>
      </div>
    );
  }

  return (
    <div className="fixed inset-0 z-50 flex items-start justify-center overflow-y-auto bg-brand-950/50 p-4 sm:py-10">
      <div
        ref={dialog}
        tabIndex={-1}
        role="dialog"
        aria-modal="true"
        aria-label={title}
        className={classNames('w-full rounded-2xl bg-white shadow-2xl outline-none', large ? 'max-w-3xl lg:max-w-6xl' : wide ? 'max-w-3xl' : 'max-w-lg')}
      >
        {header}
        <div className="p-5">{children}</div>
      </div>
    </div>
  );
}

/** Today on the Gabon calendar (the API tolerates a one-day lead over UTC). */
export function todayIso(): string {
  return librevilleDay();
}

/**
 * Date field always shown « jj/mm/aaaa » (a native `type="date"` follows the
 * browser locale, often mm/dd/yyyy). Drop-in for `<input type="date">`: `value`
 * and `min`/`max` are ISO « aaaa-mm-jj », `onChange` receives `{ target: { value } }`.
 * It fires only for a complete, valid date inside `min`/`max`, or with '' when the
 * text is cleared; an unfinished, impossible or out-of-range text is flagged under
 * the field and the last valid value is kept.
 */
export function DateInput({
  value,
  onChange,
  min,
  max,
  required,
  disabled,
  className,
  id,
  title,
  'aria-label': ariaLabel,
}: {
  value: string | null | undefined;
  onChange?: (e: { target: { value: string } }) => void;
  min?: string;
  max?: string;
  required?: boolean;
  disabled?: boolean;
  className?: string;
  id?: string;
  title?: string;
  'aria-label'?: string;
}) {
  const iso = value ? value.slice(0, 10) : '';
  const [text, setText] = useState(isoToFr(iso));
  const [touched, setTouched] = useState(false);
  const picker = useRef<HTMLInputElement>(null);

  // Follow external changes (reset, prefill) without fighting the typing.
  useEffect(() => {
    setText((t) => (checkTypedDate(t).iso === iso ? t : isoToFr(iso)));
  }, [iso]);

  const check = checkTypedDate(text, min, max);
  // An unfinished date is only reported once the user left the field (or typed the full length).
  const error = check.message && (check.status !== 'incomplete' || touched || text.length >= 10) ? check.message : null;

  const type = (raw: string) => {
    const t = raw.replace(/[^\d/.\-\s]/g, '').slice(0, 10);
    setText(t);
    const next = checkTypedDate(t, min, max);
    if (next.status === 'ok' && next.iso !== iso) onChange?.({ target: { value: next.iso } });
    else if (next.status === 'empty' && iso !== '') onChange?.({ target: { value: '' } });
  };

  return (
    <div>
    <div className="relative">
      <input
        id={id}
        type="text"
        inputMode="numeric"
        autoComplete="off"
        placeholder="jj/mm/aaaa"
        maxLength={10}
        title={title}
        aria-label={ariaLabel}
        aria-invalid={error ? true : undefined}
        className={classNames(className ?? inputCls, 'pr-9', error && 'border-red-400 focus:border-red-500 focus:ring-red-100')}
        value={text}
        required={required}
        disabled={disabled}
        onChange={(e) => type(e.target.value)}
        onBlur={() => {
          setTouched(true);
          // A valid but out-of-range text stays visible with its message; anything else snaps back to the value.
          if (check.status !== 'out') setText(isoToFr(iso));
        }}
      />
      <button
        type="button"
        tabIndex={-1}
        disabled={disabled}
        aria-label="Choisir une date"
        className="absolute right-2 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600 disabled:opacity-50"
        onClick={() => picker.current?.showPicker?.()}
      >
        <CalendarDays className="h-4 w-4" />
      </button>
      <input
        ref={picker}
        type="date"
        lang="fr"
        tabIndex={-1}
        aria-hidden
        className="pointer-events-none absolute bottom-0 right-0 h-0 w-0 opacity-0"
        value={iso}
        min={min}
        max={max}
        onChange={(e) => {
          const v = e.target.value;
          if (v && checkTypedDate(isoToFr(v), min, max).status !== 'ok') return;
          setText(isoToFr(v));
          onChange?.({ target: { value: v } });
        }}
      />
    </div>
    {error ? (
      <p role="alert" className="mt-1 text-xs text-red-600">
        {error}
      </p>
    ) : null}
    </div>
  );
}
