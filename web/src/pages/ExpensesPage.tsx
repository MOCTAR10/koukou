import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Banknote, Info, Pencil, Plus, ReceiptText, RefreshCw, Trash2 } from 'lucide-react';
import { useState } from 'react';
import { api } from '../api/client';
import type { Expense, SyncExpensesResult } from '../api/types-finance';
import { useFarm } from '../app/FarmContext';
import { useFarmProfile } from '../app/useFarmProfile';
import { ReadOnlyNotice } from '../components/access/ReadOnlyNotice';
import { EXPENSE_CATEGORIES, ExpenseFormModal } from '../components/finance/ExpenseFormModal';
import { ConfirmModal, SuccessNote } from '../components/finance/shared';
import { Button, ErrorNote } from '../components/form';
import { Card, DataTable, EmptyState, Loading, PageHeader, StatCard, Td, Th } from '../components/ui';
import { dateFr, fcfa, plural } from '../lib/format';

const isAutoCreated = (e: Expense) => typeof e.notes === 'string' && e.notes.startsWith('[Auto]');

function Tag({ children, tone }: { children: string; tone: 'slate' | 'emerald' | 'amber' }) {
  const tones = {
    slate: 'bg-slate-100 text-slate-600 ring-slate-200',
    emerald: 'bg-emerald-50 text-emerald-700 ring-emerald-200',
    amber: 'bg-amber-50 text-amber-700 ring-amber-200',
  };
  return (
    <span className={`inline-flex whitespace-nowrap rounded-full px-2 py-0.5 text-xs font-medium ring-1 ${tones[tone]}`}>
      {children}
    </span>
  );
}

export function ExpensesPage() {
  const { farmId } = useFarm();
  const queryClient = useQueryClient();
  // POUFA lot A droits: the page opens with « compta:rapports » too (an institution granted ECONOMIQUE); writes need « compta:depense ».
  const canWrite = useFarmProfile().hasPermission('compta:depense');
  const [form, setForm] = useState<{ editing: Expense | null } | null>(null);
  const [deleting, setDeleting] = useState<Expense | null>(null);
  const [syncNote, setSyncNote] = useState<string | null>(null);

  const expenses = useQuery({
    queryKey: ['expenses', farmId],
    queryFn: () => api.get<Expense[]>(`/farms/${farmId}/expenses`),
    enabled: !!farmId,
  });

  // An expense moves the cash, the ledger and the P&L at once.
  const refresh = () => {
    for (const key of [
      'expenses',
      'dashboard',
      'caisse-current',
      'caisse-sessions',
      'rentabilite',
      'rentabilite-batch',
      'accounting-journal',
      'accounting-balance',
      'accounting-resultat',
      'accounting-bilan',
    ]) {
      void queryClient.invalidateQueries({ queryKey: [key, farmId] });
    }
  };

  const remove = useMutation({
    mutationFn: (e: Expense) => api.del(`/farms/${farmId}/expenses/${e.id}`),
    onSuccess: () => {
      setDeleting(null);
      refresh();
    },
  });

  const sync = useMutation({
    mutationFn: () => api.post<SyncExpensesResult>(`/farms/${farmId}/expenses/sync`),
    onMutate: () => setSyncNote(null),
    onSuccess: (r) => {
      setSyncNote(
        r.batchesSynced + r.inputsSynced > 0
          ? `Synchronisation terminée : ${plural(r.batchesSynced, 'lot')} et ${plural(r.inputsSynced, 'intrant')} ${r.batchesSynced + r.inputsSynced < 2 ? 'synchronisé' : 'synchronisés'}.`
          : 'Synchronisation terminée : toutes les dépenses sont déjà synchronisées.',
      );
      refresh();
    },
  });

  const rows = expenses.data ?? [];
  const total = rows.reduce((s, x) => s + x.amountFcfa, 0);

  return (
    <div className="space-y-6">
      <PageHeader
        title="Dépenses"
        subtitle="Suivi des charges et sorties de caisse"
        icon={<ReceiptText />}
        actions={
          canWrite ? (
            <Button onClick={() => setForm({ editing: null })}>
              <Plus className="h-4 w-4" /> Nouvelle dépense
            </Button>
          ) : undefined
        }
      />
      <ReadOnlyNotice what="dépenses" />

      <div className="grid gap-4 lg:grid-cols-3">
        <StatCard
          label="Total des dépenses"
          value={rows.length ? `- ${fcfa(total)}` : fcfa(0)}
          tone={rows.length ? 'bad' : 'default'}
          hint={`${rows.length} écriture${rows.length > 1 ? 's' : ''}`}
          icon={<Banknote className="h-5 w-5" />}
        />
        <Card className="p-4 lg:col-span-2">
          <div className="flex flex-wrap items-center gap-3">
            <p className="flex min-w-64 flex-1 items-start gap-2 text-sm text-slate-600">
              <Info className="mt-0.5 h-4 w-4 shrink-0 text-brand-600" />
              Les dépenses liées aux poussins, aliments et intrants sont créées automatiquement lors de la
              création des lots et réceptions. Elles apparaissent ici avec le badge « Auto ».
            </p>
            {canWrite ? (
              <Button tone="secondary" busy={sync.isPending} onClick={() => sync.mutate()}>
                {sync.isPending ? null : <RefreshCw className="h-4 w-4" />}
                Synchroniser les dépenses
              </Button>
            ) : null}
          </div>
        </Card>
      </div>

      <ErrorNote error={sync.error} />
      {syncNote ? <SuccessNote>{syncNote}</SuccessNote> : null}
      <ErrorNote error={expenses.error} onRetry={() => void expenses.refetch()} />

      {expenses.isLoading ? (
        <Loading label="Chargement des dépenses…" />
      ) : expenses.isError ? null : rows.length === 0 ? (
        <EmptyState
          message="Aucune dépense enregistrée. Les dépenses liées au cheptel (poussins, aliments, traitement) sont comptabilisées ici."
          icon={<ReceiptText />}
        />
      ) : (
        <Card className="overflow-hidden">
          <DataTable>
              <thead className="bg-slate-50">
                <tr>
                  <Th>Date</Th>
                  <Th>Intitulé</Th>
                  <Th>Catégorie</Th>
                  <Th className="hidden lg:table-cell">Fournisseur</Th>
                  <Th className="hidden lg:table-cell">Paiement</Th>
                  <Th className="text-right">Montant</Th>
                  <Th className="text-right">Actions</Th>
                </tr>
              </thead>
              <tbody>
                {rows.map((e) => {
                  const cat =
                    EXPENSE_CATEGORIES.find((c) => c.key === e.category) ??
                    EXPENSE_CATEGORIES[EXPENSE_CATEGORIES.length - 1];
                  const auto = isAutoCreated(e);
                  return (
                    <tr key={e.id} className="border-t border-slate-100 align-top">
                      <Td className="whitespace-nowrap">{dateFr(e.expenseDate)}</Td>
                      <Td label="Intitulé">
                        <span className="font-medium text-slate-800">{e.label ?? cat.label}</span>
                        {auto ? (
                          <span className="ml-2">
                            <Tag tone="amber">Auto</Tag>
                          </span>
                        ) : e.notes ? (
                          <span className="mt-0.5 block text-xs text-slate-500">{e.notes}</span>
                        ) : null}
                      </Td>
                      <Td label="Catégorie" className="whitespace-nowrap">
                        {cat.label} <span className="text-xs text-slate-500">({cat.account})</span>
                      </Td>
                      <Td label="Fournisseur" className="md:max-lg:hidden">{e.supplier ?? '—'}</Td>
                      <Td label="Paiement" className="md:max-lg:hidden">
                        <Tag tone={e.paidByCaisse ? 'emerald' : 'slate'}>{e.paidByCaisse ? 'Caisse' : 'Fournisseur'}</Tag>
                      </Td>
                      <Td label="Montant" className="whitespace-nowrap text-right font-semibold tabular-nums text-red-600">
                        - {fcfa(e.amountFcfa)}
                      </Td>
                      <Td label="Actions" className="whitespace-nowrap text-right">
                        {auto || !canWrite ? (
                          <span className="text-xs text-slate-500">—</span>
                        ) : (
                          <div className="flex justify-end gap-1">
                            <button
                              type="button"
                              aria-label="Modifier la dépense"
                              title="Modifier"
                              onClick={() => setForm({ editing: e })}
                              className="rounded-md p-1.5 text-brand-600 hover:bg-slate-100"
                            >
                              <Pencil className="h-4 w-4" />
                            </button>
                            <button
                              type="button"
                              aria-label="Supprimer la dépense"
                              title="Supprimer"
                              onClick={() => {
                                remove.reset();
                                setDeleting(e);
                              }}
                              className="rounded-md p-1.5 text-red-600 hover:bg-red-50"
                            >
                              <Trash2 className="h-4 w-4" />
                            </button>
                          </div>
                        )}
                      </Td>
                    </tr>
                  );
                })}
              </tbody>
            </DataTable>
        </Card>
      )}

      {form && farmId ? (
        <ExpenseFormModal
          farmId={farmId}
          editing={form.editing}
          onClose={() => setForm(null)}
          onSaved={() => {
            setForm(null);
            refresh();
          }}
        />
      ) : null}

      {deleting ? (
        <ConfirmModal
          title="Supprimer cette dépense ?"
          confirmLabel="Supprimer"
          busy={remove.isPending}
          error={remove.error}
          onConfirm={() => remove.mutate(deleting)}
          onCancel={() => setDeleting(null)}
        >
          <p className="font-medium text-slate-800">
            {fcfa(deleting.amountFcfa)}
            {deleting.label ? ` — ${deleting.label}` : ''}
          </p>
          <p>L’écriture comptable sera contre-passée.</p>
        </ConfirmModal>
      ) : null}
    </div>
  );
}
