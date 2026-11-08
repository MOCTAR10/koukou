import { useMutation, useQuery } from '@tanstack/react-query';
import { Pencil } from 'lucide-react';
import { useState, type FormEvent } from 'react';
import { api } from '../../api/client';
import type { RefItem } from '../../api/types-programme';
import type { CreateExpenseBody, Expense, ExpenseCategory, UpdateExpenseBody } from '../../api/types-finance';
import { classNames, fcfa } from '../../lib/format';
import { parseDecimalFr } from '../../lib/number';
import { Button, ErrorNote, Field, Modal, inputCls } from '../form';

export const EXPENSE_CATEGORIES: { key: ExpenseCategory; label: string; account: string }[] = [
  { key: 'ACHAT_POUSSINS', label: 'Achat poussins', account: '6010' },
  { key: 'ALIMENTS', label: 'Aliments', account: '6011' },
  { key: 'VETERINAIRE', label: 'Vétérinaire', account: '6012' },
  { key: 'TRANSPORT', label: 'Transport', account: '604' },
  { key: 'EAU', label: 'Eau', account: '6052' },
  { key: 'ENERGIE_GAZ', label: 'Énergie & gaz', account: '6061' },
  { key: 'LOYER', label: 'Loyer', account: '613' },
  { key: 'MAINTENANCE', label: 'Maintenance', account: '615' },
  { key: 'ASSURANCE', label: 'Assurance', account: '616' },
  { key: 'MAIN_D_OEUVRE', label: 'Main d’œuvre', account: '641' },
  { key: 'COTISATIONS', label: 'Cotisations', account: '645' },
  { key: 'FRAIS_BANCAIRES', label: 'Frais bancaires', account: '661' },
  { key: 'AUTRE', label: 'Autre', account: '65' },
];

export function ExpenseFormModal({
  farmId,
  editing,
  onClose,
  onSaved,
}: {
  farmId: string;
  /** The expense to edit; null creates a new one. */
  editing: Expense | null;
  onClose: () => void;
  onSaved: () => void;
}) {
  // Postes de charge: the admin-managed POSTE_CHARGE list (active items, any account reads them).
  const postes = useQuery({
    queryKey: ['programme-list', 'POSTE_CHARGE'],
    queryFn: () => api.get<RefItem[]>('/programme/lists/POSTE_CHARGE'),
    staleTime: 5 * 60_000,
  });
  const [poste, setPoste] = useState<string>(editing?.posteCharge ?? '');
  const posteOptions = postes.data ?? [];
  const selectedPoste = poste || posteOptions[0]?.code || '';
  const [amount, setAmount] = useState('');
  const [label, setLabel] = useState(editing?.label ?? '');
  const [supplier, setSupplier] = useState(editing?.supplier ?? '');
  const [notes, setNotes] = useState(editing?.notes ?? '');
  const [paidByCaisse, setPaidByCaisse] = useState(true);
  const [formError, setFormError] = useState<string | null>(null);
  // One key per opening of the form: a double tap or a resend after a timeout
  // returns the stored expense instead of booking it twice.
  const [idempotencyKey] = useState(() => crypto.randomUUID());

  const save = useMutation({
    mutationFn: async () => {
      if (editing) {
        // Always sent: an emptied field ('') is cleared by the server.
        const body: UpdateExpenseBody = {
          posteCharge: selectedPoste,
          label: label.trim(),
          supplier: supplier.trim(),
          notes: notes.trim(),
        };
        return api.patch<Expense>(`/farms/${farmId}/expenses/${editing.id}`, body);
      }
      const body: CreateExpenseBody = {
        posteCharge: selectedPoste,
        amountFcfa: Math.round(parseDecimalFr(amount) ?? 0),
        paidByCaisse,
        idempotencyKey,
        ...(label.trim() ? { label: label.trim() } : {}),
        ...(supplier.trim() ? { supplier: supplier.trim() } : {}),
        ...(notes.trim() ? { notes: notes.trim() } : {}),
      };
      return api.post<Expense>(`/farms/${farmId}/expenses`, body);
    },
    onSuccess: onSaved,
  });

  const submit = (e: FormEvent) => {
    e.preventDefault();
    if (!selectedPoste) {
      setFormError('Choisissez un poste de charge.');
      return;
    }
    if (!editing && !(Math.round(parseDecimalFr(amount) ?? 0) > 0)) {
      setFormError('Montant invalide.');
      return;
    }
    setFormError(null);
    save.mutate();
  };

  return (
    <Modal title={editing ? 'Modifier la dépense' : 'Nouvelle dépense'} onClose={onClose}>
      <form onSubmit={submit} noValidate className="space-y-4">
        {editing ? (
          <div className="flex items-center justify-between rounded-lg bg-slate-50 px-3 py-2 text-sm">
            <span className="text-slate-500">Montant (non modifiable)</span>
            <span className="font-bold tabular-nums text-red-600">- {fcfa(editing.amountFcfa)}</span>
          </div>
        ) : (
          <p className="text-sm text-slate-500">
            Sortie de caisse ou achat à crédit, comptabilisée immédiatement.
          </p>
        )}

        <div className="grid gap-4 sm:grid-cols-2">
          <Field
            label="Poste de charge"
            hint={editing ? 'Changer le poste reclasse automatiquement le compte de charge.' : undefined}
            className={editing ? 'sm:col-span-2' : undefined}
          >
            <select
              value={selectedPoste}
              onChange={(e) => setPoste(e.target.value)}
              disabled={postes.isLoading}
              className={inputCls}
            >
              {/* An edited expense whose poste was since deactivated stays selectable. */}
              {selectedPoste && !posteOptions.some((p) => p.code === selectedPoste) ? (
                <option value={selectedPoste}>{selectedPoste}</option>
              ) : null}
              {posteOptions.map((p) => (
                <option key={p.code} value={p.code}>
                  {p.label}
                </option>
              ))}
            </select>
          </Field>
          {editing ? null : (
            <Field label="Montant (FCFA)">
              <input
                type="number"
                min={1}
                step={1}
                value={amount}
                onChange={(e) => setAmount(e.target.value)}
                placeholder="0"
                className={inputCls}
              />
            </Field>
          )}
        </div>

        <Field label="Intitulé">
          <input
            value={label}
            onChange={(e) => setLabel(e.target.value)}
            maxLength={120}
            placeholder="Ex. sacs d’aliment démarrage"
            className={inputCls}
          />
        </Field>
        <Field label="Fournisseur (optionnel)">
          <input
            value={supplier}
            onChange={(e) => setSupplier(e.target.value)}
            maxLength={120}
            placeholder="Ex. AgroGabon"
            className={inputCls}
          />
        </Field>
        <Field label="Remarques (optionnel)">
          <textarea
            value={notes}
            onChange={(e) => setNotes(e.target.value)}
            maxLength={300}
            rows={2}
            placeholder="Notes internes"
            className={inputCls}
          />
        </Field>

        {editing ? null : (
          <div>
            <span className="mb-1 block text-xs font-medium text-slate-600">Paiement</span>
            <div className="grid grid-cols-2 gap-2">
              {[
                { value: true, label: 'Payée à la caisse' },
                { value: false, label: 'Fournisseur (crédit)' },
              ].map((o) => (
                <button
                  key={o.label}
                  type="button"
                  aria-pressed={paidByCaisse === o.value}
                  onClick={() => setPaidByCaisse(o.value)}
                  className={classNames(
                    'rounded-lg border px-3 py-2 text-sm font-medium transition',
                    paidByCaisse === o.value
                      ? 'border-brand-500 bg-brand-50 text-brand-700'
                      : 'border-slate-300 bg-white text-slate-600 hover:bg-slate-50',
                  )}
                >
                  {o.label}
                </button>
              ))}
            </div>
            <p className="mt-1 text-xs text-slate-500">
              « Payée à la caisse » décaisse immédiatement l’espèce (session ouverte requise).
            </p>
          </div>
        )}

        <ErrorNote error={formError ?? save.error} />

        <div className="flex justify-end gap-2">
          <Button tone="secondary" onClick={onClose} disabled={save.isPending}>
            Annuler
          </Button>
          <Button type="submit" busy={save.isPending}>
            {save.isPending ? null : <Pencil className="h-4 w-4" />}
            {editing ? 'Enregistrer les modifications' : 'Enregistrer la dépense'}
          </Button>
        </div>
      </form>
    </Modal>
  );
}
