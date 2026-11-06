import { useEffect, useRef, type ButtonHTMLAttributes, type ReactNode } from 'react';
import { AlertTriangle, Loader2, X } from 'lucide-react';
import { ApiError } from '../api/client';
import { classNames } from '../lib/format';

export const inputCls =
  'w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm text-slate-900 outline-none focus:border-brand-500 focus:ring-2 focus:ring-brand-100 disabled:bg-slate-50 disabled:text-slate-400';

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

export function Modal({
  title,
  onClose,
  children,
  wide = false,
  side = false,
}: {
  title: string;
  onClose: () => void;
  children: ReactNode;
  wide?: boolean;
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
        className={classNames('w-full rounded-2xl bg-white shadow-2xl outline-none', wide ? 'max-w-3xl' : 'max-w-lg')}
      >
        {header}
        <div className="p-5">{children}</div>
      </div>
    </div>
  );
}

/** Today in the same UTC calendar the backend compares dates with. */
export function todayIso(): string {
  return new Date().toISOString().slice(0, 10);
}
