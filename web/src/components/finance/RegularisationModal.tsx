import { useMutation, useQuery } from '@tanstack/react-query';
import { useId, useMemo, useState, type FormEvent } from 'react';
import { api } from '../../api/client';
import type { BalanceData, RegularisationBody } from '../../api/types-finance';
import { classNames, fcfa } from '../../lib/format';
import { Button, ErrorNote, Field, Modal, inputCls, todayIso, DateInput } from '../form';

const FREQUENT_ACCOUNTS = ['571', '108', '401', '411', '6011', '7011', '658', '758', '471', '421'];

const toAmount = (s: string): number => {
  const n = Number(s);
  return Number.isInteger(n) && n > 0 ? n : 0;
};

export function RegularisationModal({
  farmId,
  onClose,
  onSaved,
}: {
  farmId: string;
  onClose: () => void;
  onSaved: () => void;
}) {
  const listId = useId();
  const balance = useQuery({
    queryKey: ['accounting-balance', farmId],
    queryFn: () => api.get<BalanceData>(`/farms/${farmId}/accounting/balance`),
    staleTime: 60_000,
  });
  const suggestions = useMemo(() => {
    const rows = balance.data?.accounts ?? [];
    return FREQUENT_ACCOUNTS.flatMap((code) => rows.filter((a) => a.code === code));
  }, [balance.data]);

  const [label, setLabel] = useState('');
  const [date, setDate] = useState(todayIso);
  const [debitAccount, setDebitAccount] = useState('6011');
  const [debitAmount, setDebitAmount] = useState('');
  const [creditAccount, setCreditAccount] = useState('471');
  const [creditAmount, setCreditAmount] = useState('');

  const debit = toAmount(debitAmount);
  const credit = toAmount(creditAmount);
  const balanced = debit > 0 && debit === credit;
  const valid = label.trim().length > 0 && !!date && !!debitAccount.trim() && !!creditAccount.trim() && balanced;

  const save = useMutation({
    mutationFn: () => {
      const body: RegularisationBody = {
        date,
        label: label.trim(),
        lines: [
          { account: debitAccount.trim(), debitFcfa: debit },
          { account: creditAccount.trim(), creditFcfa: credit },
        ],
      };
      return api.post(`/farms/${farmId}/accounting/entries`, body);
    },
    onSuccess: onSaved,
  });

  const submit = (e: FormEvent) => {
    e.preventDefault();
    if (valid) save.mutate();
  };

  return (
    <Modal title="Régularisation" onClose={onClose}>
      <form onSubmit={submit} className="space-y-4">
        <p className="text-sm text-slate-500">Écriture manuelle équilibrée : le total débit doit être égal au total crédit.</p>
        <div className="grid gap-4 sm:grid-cols-3">
          <Field label="Libellé" className="sm:col-span-2">
            <input
              value={label}
              onChange={(e) => setLabel(e.target.value)}
              maxLength={200}
              placeholder="Ex. Ajustement provende culture"
              className={inputCls}
            />
          </Field>
          <Field label="Date">
            <DateInput value={date} onChange={(e) => setDate(e.target.value)} className={inputCls} />
          </Field>
        </div>

        <datalist id={listId}>
          {suggestions.map((a) => (
            <option key={a.code} value={a.code}>
              {a.label}
            </option>
          ))}
        </datalist>

        <div className="grid grid-cols-2 gap-4">
          <Field label="Compte au débit">
            <input
              value={debitAccount}
              onChange={(e) => setDebitAccount(e.target.value)}
              list={listId}
              maxLength={8}
              placeholder="Ex. 6011"
              className={inputCls}
            />
          </Field>
          <Field label="Montant débit (FCFA)">
            <input
              type="number"
              min={1}
              step={1}
              value={debitAmount}
              onChange={(e) => setDebitAmount(e.target.value)}
              placeholder="0"
              className={inputCls}
            />
          </Field>
          <Field label="Compte au crédit">
            <input
              value={creditAccount}
              onChange={(e) => setCreditAccount(e.target.value)}
              list={listId}
              maxLength={8}
              placeholder="Ex. 471"
              className={inputCls}
            />
          </Field>
          <Field label="Montant crédit (FCFA)">
            <input
              type="number"
              min={1}
              step={1}
              value={creditAmount}
              onChange={(e) => setCreditAmount(e.target.value)}
              placeholder="0"
              className={inputCls}
            />
          </Field>
        </div>

        <div className="flex items-center justify-between rounded-lg bg-slate-50 px-3 py-2 text-sm">
          <span className="text-slate-500">Équilibre</span>
          <span
            className={classNames(
              'font-semibold tabular-nums',
              balanced ? 'text-emerald-600' : debit > 0 || credit > 0 ? 'text-red-600' : 'text-slate-500',
            )}
          >
            {balanced ? 'Équilibrée' : `${fcfa(debit)} / ${fcfa(credit)}`}
          </span>
        </div>

        <ErrorNote error={save.error} />

        <div className="flex justify-end gap-2">
          <Button tone="secondary" onClick={onClose} disabled={save.isPending}>
            Annuler
          </Button>
          <Button type="submit" busy={save.isPending} disabled={!valid}>
            {balanced ? `Enregistrer ${fcfa(debit)}` : 'Débit et crédit doivent être égaux'}
          </Button>
        </div>
      </form>
    </Modal>
  );
}
