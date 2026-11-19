import { useState, type FormEvent, type ReactNode } from 'react';
import { Button, ErrorNote, Field, Modal, inputCls } from '../form';

/** Asks for a reason (cancel, reject, withdraw) before sending it; the server's message stays visible on failure. */
export function ReasonModal({
  title,
  intro,
  label = 'Motif',
  confirm,
  tone = 'primary',
  required = true,
  busy,
  error,
  onSubmit,
  onClose,
}: {
  title: string;
  intro?: ReactNode;
  label?: string;
  confirm: string;
  tone?: 'primary' | 'danger';
  required?: boolean;
  busy: boolean;
  error: unknown;
  onSubmit: (reason: string) => void;
  onClose: () => void;
}) {
  const [reason, setReason] = useState('');
  const submit = (e: FormEvent) => {
    e.preventDefault();
    onSubmit(reason.trim());
  };
  return (
    <Modal title={title} onClose={onClose}>
      <form onSubmit={submit} className="space-y-4">
        {intro ? <div className="text-sm text-slate-600">{intro}</div> : null}
        <Field label={label}>
          <textarea className={inputCls} rows={3} value={reason} onChange={(e) => setReason(e.target.value)} required={required} maxLength={500} autoFocus />
        </Field>
        <ErrorNote error={error} />
        <div className="flex flex-wrap justify-end gap-2">
          <Button tone="secondary" onClick={onClose}>
            Annuler
          </Button>
          <Button type="submit" tone={tone} busy={busy} disabled={required && reason.trim().length < 3}>
            {confirm}
          </Button>
        </div>
      </form>
    </Modal>
  );
}

/** A plain confirmation with a consequence stated in the body. */
export function ConfirmModal({
  title,
  children,
  confirm,
  tone = 'primary',
  busy,
  error,
  onConfirm,
  onClose,
}: {
  title: string;
  children: ReactNode;
  confirm: string;
  tone?: 'primary' | 'danger';
  busy: boolean;
  error: unknown;
  onConfirm: () => void;
  onClose: () => void;
}) {
  return (
    <Modal title={title} onClose={onClose}>
      <div className="space-y-4">
        <div className="text-sm text-slate-700">{children}</div>
        <ErrorNote error={error} />
        <div className="flex flex-wrap justify-end gap-2">
          <Button tone="secondary" onClick={onClose}>
            Annuler
          </Button>
          <Button tone={tone} busy={busy} onClick={onConfirm}>
            {confirm}
          </Button>
        </div>
      </div>
    </Modal>
  );
}
