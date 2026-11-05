import { useEffect, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { ArrowDownToLine, ArrowUpFromLine, Coins, FolderClosed, FolderOpen, History, Pencil, Trash2 } from 'lucide-react';
import { api } from '../api/client';
import type { CashSession } from '../api/types';
import type { CaisseSummary, CashMovement } from '../api/types-sales';
import { useFarm } from '../app/FarmContext';
import { useFarmProfile } from '../app/useFarmProfile';
import { Button, ErrorNote, Field, inputCls, Modal } from '../components/form';
import { Card, DataTable, EmptyState, Loading, PageHeader, StatusBadge, Td, Th } from '../components/ui';
import { MOVEMENT_SOURCE_LABEL } from '../components/sales/labels';
import { lastClosingOf } from '../components/sales/pos';
import { ConfirmDialog } from '../components/sales/shared';
import { classNames, dateFr, dateTimeFr, fcfa } from '../lib/format';

function parseAmount(s: string): number {
  return Number(s.replace(/\D/g, '')) || 0;
}

type MovementModal =
  | { mode: 'create'; type: 'IN' | 'OUT' }
  | { mode: 'edit'; movement: CashMovement };

function MovementForm({
  modal,
  busy,
  error,
  onSubmit,
  onClose,
}: {
  modal: MovementModal;
  busy: boolean;
  error: unknown;
  onSubmit: (amountFcfa: number, reason: string) => void;
  onClose: () => void;
}) {
  const editing = modal.mode === 'edit' ? modal.movement : null;
  const type = modal.mode === 'edit' ? modal.movement.type : modal.type;
  const [amount, setAmount] = useState(editing ? String(editing.amountFcfa) : '');
  const [reason, setReason] = useState(editing?.reason ?? '');
  const [invalid, setInvalid] = useState<string | null>(null);

  return (
    <Modal title={editing ? 'Modifier le mouvement' : type === 'IN' ? 'Entrée en caisse' : 'Sortie de caisse'} onClose={onClose}>
      <form
        className="space-y-4"
        onSubmit={(e) => {
          e.preventDefault();
          const value = parseAmount(amount);
          if (value <= 0) {
            setInvalid('Montant invalide.');
            return;
          }
          setInvalid(null);
          onSubmit(value, reason.trim());
        }}
      >
        <p className="text-sm text-slate-500">
          {type === 'IN' ? 'Apport en caisse hors vente, comptabilisé 571 / 108.' : 'Prélèvement en caisse hors vente, comptabilisé 108 / 571.'}
          {editing ? ' L’écriture comptable est ajustée automatiquement.' : ''}
        </p>
        <Field label="Montant (FCFA)">
          <input className={inputCls} inputMode="numeric" value={amount} onChange={(e) => setAmount(e.target.value.replace(/\D/g, ''))} autoFocus />
        </Field>
        <Field label="Motif (facultatif)">
          <input className={inputCls} value={reason} onChange={(e) => setReason(e.target.value)} placeholder="Ex. petit matériel" />
        </Field>
        <ErrorNote error={invalid ?? error} />
        <div className="flex justify-end gap-2">
          <Button tone="secondary" onClick={onClose} disabled={busy}>
            Annuler
          </Button>
          <Button type="submit" busy={busy}>
            {busy ? null : editing ? (
              <Pencil className="h-4 w-4" />
            ) : type === 'IN' ? (
              <ArrowDownToLine className="h-4 w-4" />
            ) : (
              <ArrowUpFromLine className="h-4 w-4" />
            )}
            {editing ? 'Enregistrer' : 'Ajouter'}
          </Button>
        </div>
      </form>
    </Modal>
  );
}

export function CaissePage() {
  const { farmId } = useFarm();
  const { hasPermission, isOwner } = useFarmProfile();
  const queryClient = useQueryClient();

  const [amount, setAmount] = useState('');
  const [fieldError, setFieldError] = useState<string | null>(null);
  const [closeGap, setCloseGap] = useState<{ declared: number; expected: number } | null>(null);
  const [movementModal, setMovementModal] = useState<MovementModal | null>(null);
  const [deleting, setDeleting] = useState<CashMovement | null>(null);

  const current = useQuery({
    queryKey: ['caisse-current', farmId],
    queryFn: () => api.get<CaisseSummary | null>(`/farms/${farmId}/caisse/current`),
    enabled: !!farmId,
    retry: false,
  });

  const sessions = useQuery({
    queryKey: ['caisse-sessions', farmId],
    queryFn: () => api.get<CashSession[]>(`/farms/${farmId}/caisse/sessions`),
    enabled: !!farmId,
  });

  const summary = current.data ?? null;
  const hasOpen = !!summary;
  const canToggle = hasPermission(hasOpen ? 'caisse:fermer' : 'caisse:ouvrir');
  // Opening defaults to the last declared closing: the server books only the
  // change from it, so opening at 0 would post the whole float as a withdrawal.
  const lastClosing = lastClosingOf(sessions.data);

  const closingStateReady = current.isSuccess && sessions.isSuccess;
  useEffect(() => {
    if (!closingStateReady) return;
    // Closing starts empty: the owner types what was counted, not the expected figure.
    setAmount(hasOpen ? '' : String(lastClosing ?? 0));
    setFieldError(null);
  }, [closingStateReady, hasOpen, lastClosing]);

  const invalidate = () => {
    void queryClient.invalidateQueries({ queryKey: ['caisse-current', farmId] });
    void queryClient.invalidateQueries({ queryKey: ['caisse-sessions', farmId] });
    void queryClient.invalidateQueries({ queryKey: ['dashboard', farmId] });
  };

  const openSession = useMutation({
    mutationFn: (openingBalanceFcfa: number) =>
      api.post<CashSession>(`/farms/${farmId}/caisse/open`, { openingBalanceFcfa }),
    onSuccess: invalidate,
  });

  const closeSession = useMutation({
    mutationFn: (declaredBalanceFcfa: number) =>
      api.post<CashSession>(`/farms/${farmId}/caisse/close`, { declaredBalanceFcfa }),
    onSuccess: () => {
      setCloseGap(null);
      invalidate();
    },
  });

  const saveMovement = useMutation({
    mutationFn: async ({ amountFcfa, reason }: { amountFcfa: number; reason: string }) => {
      if (movementModal?.mode === 'edit') {
        return api.patch(`/farms/${farmId}/caisse/movements/${movementModal.movement.id}`, {
          amountFcfa,
          ...(reason ? { reason } : {}),
        });
      }
      return api.post(`/farms/${farmId}/caisse/movements`, {
        type: movementModal?.mode === 'create' ? movementModal.type : 'IN',
        amountFcfa,
        ...(reason ? { reason } : {}),
      });
    },
    onSuccess: () => {
      setMovementModal(null);
      invalidate();
    },
  });

  const deleteMovement = useMutation({
    mutationFn: (id: string) => api.del(`/farms/${farmId}/caisse/movements/${id}`),
    onSuccess: () => {
      setDeleting(null);
      invalidate();
    },
  });

  const submit = () => {
    // An empty field is not "0 FCFA": closing at 0 would book the whole balance as a shortfall.
    if (!amount.trim()) {
      setFieldError(hasOpen ? 'Saisissez le montant compté dans la caisse.' : 'Saisissez le fonds de caisse.');
      return;
    }
    setFieldError(null);
    const value = parseAmount(amount);
    if (!summary) {
      openSession.mutate(value);
    } else if (value !== summary.expectedBalanceFcfa) {
      closeSession.reset();
      setCloseGap({ declared: value, expected: summary.expectedBalanceFcfa });
    } else {
      closeSession.mutate(value);
    }
  };

  const movements = (summary?.movements ?? []).slice().sort((a, b) => b.movementDate.localeCompare(a.movementDate));
  const history = (sessions.data ?? []).slice().sort((a, b) => b.openedAt.localeCompare(a.openedAt));

  return (
    <div className="space-y-6">
      <PageHeader title="Caisse journalière" subtitle="Ouverture, mouvements, clôture et contrôle des écarts." icon={<Coins />} />

      <ErrorNote error={current.error ?? sessions.error} />

      <div className="grid gap-4 lg:grid-cols-[minmax(0,2fr)_minmax(0,3fr)]">
        <Card className="p-5">
          <div className="flex items-center gap-2">
            {hasOpen ? <FolderOpen className="h-5 w-5 text-emerald-600" /> : <FolderClosed className="h-5 w-5 text-slate-400" />}
            <h2 className="text-sm font-semibold text-slate-700">{hasOpen ? 'Caisse ouverte' : 'Aucune caisse ouverte'}</h2>
          </div>

          {summary ? (
            <>
              <p className="mt-1 text-xs text-slate-500">Depuis le {dateTimeFr(summary.session.openedAt)}</p>
              <div className="mt-4 grid grid-cols-2 gap-3 text-center">
                <div className="rounded-xl bg-slate-50 p-3">
                  <p className="flex items-center justify-center gap-1 text-xs text-slate-500">
                    <FolderOpen className="h-3.5 w-3.5" /> Ouverture
                  </p>
                  <p className="text-sm font-bold text-slate-800">{fcfa(summary.session.openingBalanceFcfa)}</p>
                </div>
                <div className="rounded-xl bg-brand-50 p-3">
                  <p className="flex items-center justify-center gap-1 text-xs text-brand-700">
                    <Coins className="h-3.5 w-3.5" /> Solde attendu
                  </p>
                  <p className="text-sm font-bold text-brand-800">{fcfa(summary.expectedBalanceFcfa)}</p>
                </div>
                <div className="rounded-xl bg-emerald-50 p-3">
                  <p className="flex items-center justify-center gap-1 text-xs text-emerald-700">
                    <ArrowDownToLine className="h-3.5 w-3.5" /> Entrées
                  </p>
                  <p className="text-sm font-bold text-emerald-800">{fcfa(summary.inFcfa)}</p>
                </div>
                <div className="rounded-xl bg-red-50 p-3">
                  <p className="flex items-center justify-center gap-1 text-xs text-red-700">
                    <ArrowUpFromLine className="h-3.5 w-3.5" /> Sorties
                  </p>
                  <p className="text-sm font-bold text-red-800">{fcfa(summary.outFcfa)}</p>
                </div>
              </div>
            </>
          ) : (
            <p className="mt-3 text-sm text-slate-500">
              {canToggle ? 'Ouvrez la caisse pour pouvoir encaisser des ventes en espèces.' : 'La caisse n’est pas ouverte pour le moment.'}
            </p>
          )}

          {canToggle ? (
          <form
            className="mt-5 space-y-3 border-t border-slate-100 pt-4"
            onSubmit={(e) => {
              e.preventDefault();
              submit();
            }}
          >
            <Field
              label={hasOpen ? 'Montant compté dans la caisse (FCFA)' : 'Fonds de caisse à l’ouverture (FCFA)'}
              hint={
                summary
                  ? `Solde attendu : ${fcfa(summary.expectedBalanceFcfa)}`
                  : lastClosing != null
                    ? `Dernière clôture : ${fcfa(lastClosing)}`
                    : undefined
              }
            >
              <input
                className={inputCls}
                inputMode="numeric"
                value={amount}
                onChange={(e) => {
                  setAmount(e.target.value.replace(/\D/g, ''));
                  setFieldError(null);
                }}
              />
            </Field>
            <ErrorNote error={fieldError ?? openSession.error ?? (closeGap ? null : closeSession.error)} />
            <Button type="submit" className="w-full" busy={openSession.isPending || closeSession.isPending}>
              {hasOpen ? <FolderClosed className="h-4 w-4" /> : <FolderOpen className="h-4 w-4" />}
              {hasOpen ? 'Clôturer la caisse' : 'Ouvrir la caisse'}
            </Button>
          </form>
          ) : null}
        </Card>

        <Card className="overflow-hidden">
          <div className="flex flex-wrap items-center justify-between gap-2 border-b border-slate-100 px-4 py-3">
            <h2 className="flex items-center gap-2 text-sm font-semibold text-slate-700">
              <Coins className="h-4 w-4 text-brand-600" /> Mouvements de la session
            </h2>
            {hasOpen && isOwner ? (
              <div className="flex gap-2">
                <Button
                  tone="secondary"
                  className="px-2.5 py-1 text-xs"
                  onClick={() => {
                    saveMovement.reset();
                    setMovementModal({ mode: 'create', type: 'IN' });
                  }}
                >
                  <ArrowDownToLine className="h-3.5 w-3.5 text-emerald-600" /> Entrée
                </Button>
                <Button
                  tone="secondary"
                  className="px-2.5 py-1 text-xs"
                  onClick={() => {
                    saveMovement.reset();
                    setMovementModal({ mode: 'create', type: 'OUT' });
                  }}
                >
                  <ArrowUpFromLine className="h-3.5 w-3.5 text-red-600" /> Sortie
                </Button>
              </div>
            ) : null}
          </div>
          {current.isLoading ? (
            <div className="p-4">
              <Loading label="Lecture de la caisse…" />
            </div>
          ) : movements.length === 0 ? (
            <div className="p-4">
              <EmptyState
                icon={<Coins />}
                message={hasOpen ? 'Aucun mouvement pour cette session.' : canToggle ? 'Ouvrez la caisse pour suivre les mouvements de la session.' : 'Aucune session de caisse ouverte.'}
              />
            </div>
          ) : (
            <DataTable>
                <thead className="bg-slate-50">
                  <tr>
                    <Th>Date</Th>
                    <Th className="lg:max-xl:hidden">Origine</Th>
                    <Th>Motif</Th>
                    <Th className="text-right">Montant</Th>
                    <Th></Th>
                  </tr>
                </thead>
                <tbody>
                  {movements.map((m) => (
                    <tr key={m.id} className="border-t border-slate-100">
                      <Td className="whitespace-nowrap">{dateFr(m.movementDate)}</Td>
                      <Td label="Origine" className="lg:max-xl:hidden">
                        <span className="flex items-center gap-2">
                          {m.type === 'IN' ? (
                            <ArrowDownToLine className="h-4 w-4 shrink-0 text-emerald-600" />
                          ) : (
                            <ArrowUpFromLine className="h-4 w-4 shrink-0 text-red-600" />
                          )}
                          {MOVEMENT_SOURCE_LABEL[m.source] ?? 'Caisse'}
                        </span>
                      </Td>
                      <Td label="Motif" className="max-w-[320px]">{m.reason ?? (m.saleId ? 'Encaissement vente' : '—')}</Td>
                      <Td label="Montant" className={classNames('whitespace-nowrap text-right font-medium tabular-nums', m.type === 'IN' ? 'text-emerald-600' : 'text-red-600')}>
                        {m.type === 'IN' ? '+' : '−'} {fcfa(m.amountFcfa)}
                      </Td>
                      <Td>
                        {/* Sale, refund and expense movements are immutable. */}
                        {m.source === 'MANUAL' && isOwner ? (
                          <div className="flex justify-end gap-1">
                            <button
                              type="button"
                              aria-label="Modifier le mouvement"
                              onClick={() => {
                                saveMovement.reset();
                                setMovementModal({ mode: 'edit', movement: m });
                              }}
                              className="rounded p-1.5 text-slate-400 hover:bg-slate-100 hover:text-slate-700"
                            >
                              <Pencil className="h-4 w-4" />
                            </button>
                            <button
                              type="button"
                              aria-label="Supprimer le mouvement"
                              onClick={() => {
                                deleteMovement.reset();
                                setDeleting(m);
                              }}
                              className="rounded p-1.5 text-slate-400 hover:bg-red-50 hover:text-red-600"
                            >
                              <Trash2 className="h-4 w-4" />
                            </button>
                          </div>
                        ) : null}
                      </Td>
                    </tr>
                  ))}
                </tbody>
              </DataTable>
          )}
        </Card>
      </div>

      {sessions.isLoading ? (
        <Loading label="Chargement des sessions…" />
      ) : (
        <Card className="overflow-hidden">
          <div className="border-b border-slate-100 px-4 py-3">
            <h2 className="flex items-center gap-2 text-sm font-semibold text-slate-700">
              <History className="h-4 w-4 text-brand-600" /> Historique des sessions
            </h2>
          </div>
          {history.length === 0 ? (
            <div className="p-4">
              <EmptyState icon={<Coins />} message="Aucune session de caisse." />
            </div>
          ) : (
            <DataTable>
                <thead className="bg-slate-50">
                  <tr>
                    <Th>Ouverte</Th>
                    <Th>Fermée</Th>
                    <Th>Fonds initial</Th>
                    <Th>Attendu</Th>
                    <Th>Déclaré</Th>
                    <Th>Écart</Th>
                    <Th>Statut</Th>
                  </tr>
                </thead>
                <tbody>
                  {history.map((s) => {
                    const gap = s.closingDifferenceFcfa;
                    return (
                      <tr key={s.id} className="border-t border-slate-100">
                        <Td>{dateTimeFr(s.openedAt)}</Td>
                        <Td label="Fermée">{s.closedAt ? dateTimeFr(s.closedAt) : '—'}</Td>
                        <Td label="Fonds initial">{fcfa(s.openingBalanceFcfa)}</Td>
                        <Td label="Attendu">{s.closingExpectedFcfa != null ? fcfa(s.closingExpectedFcfa) : '—'}</Td>
                        <Td label="Déclaré">{s.closingBalanceFcfa != null ? fcfa(s.closingBalanceFcfa) : '—'}</Td>
                        <Td label="Écart">
                          {gap != null ? (
                            <span className={classNames('font-medium', gap === 0 ? 'text-emerald-600' : 'text-red-600')}>
                              {gap > 0 ? '+' : ''}
                              {fcfa(gap)}
                            </span>
                          ) : (
                            '—'
                          )}
                        </Td>
                        <Td label="Statut">
                          <StatusBadge status={s.status} />
                        </Td>
                      </tr>
                    );
                  })}
                </tbody>
              </DataTable>
          )}
        </Card>
      )}

      {closeGap ? (
        <ConfirmDialog
          title="Écart de caisse"
          confirmLabel="Clôturer quand même"
          confirmIcon={<FolderClosed className="h-4 w-4" />}
          cancelLabel="Corriger"
          busy={closeSession.isPending}
          error={closeSession.error}
          onConfirm={() => closeSession.mutate(closeGap.declared)}
          onClose={() => setCloseGap(null)}
        >
          Montant déclaré {fcfa(closeGap.declared)}, solde attendu {fcfa(closeGap.expected)} : écart de{' '}
          <span className="font-semibold text-red-600">
            {closeGap.declared > closeGap.expected ? '+' : ''}
            {fcfa(closeGap.declared - closeGap.expected)}
          </span>
          . Clôturer quand même ?
        </ConfirmDialog>
      ) : null}

      {movementModal ? (
        <MovementForm
          modal={movementModal}
          busy={saveMovement.isPending}
          error={saveMovement.error}
          onSubmit={(amountFcfa, reason) => saveMovement.mutate({ amountFcfa, reason })}
          onClose={() => setMovementModal(null)}
        />
      ) : null}

      {deleting ? (
        <ConfirmDialog
          title="Supprimer ce mouvement ?"
          confirmLabel="Supprimer"
          confirmIcon={<Trash2 className="h-4 w-4" />}
          busy={deleteMovement.isPending}
          error={deleteMovement.error}
          onConfirm={() => deleteMovement.mutate(deleting.id)}
          onClose={() => setDeleting(null)}
        >
          {deleting.type === 'OUT' ? 'Sortie' : 'Entrée'} de {fcfa(deleting.amountFcfa)}
          {deleting.reason ? ` : ${deleting.reason}` : ''}. L’écriture comptable sera contre-passée.
        </ConfirmDialog>
      ) : null}
    </div>
  );
}
