import React, { useState } from 'react';
import { ActivityIndicator, Alert, Pressable, StyleSheet, TextInput, View } from 'react-native';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { Banknote, Info, Pencil, Plus, ReceiptText, Trash2 } from 'lucide-react-native';

import { Screen, ScreenHeader } from '@/components/ui/Screen';
import { AppText } from '@/components/ui/AppText';
import { Button } from '@/components/ui/Button';
import { Card } from '@/components/ui/Card';
import { Chip, type ChipTone } from '@/components/ui/Chip';
import { SectionHeader } from '@/components/ui/SectionHeader';
import { Sheet } from '@/components/ui/Sheet';
import { Spinner } from '@/components/ui/Spinner';
import { NumberInput } from '@/components/ui/NumberInput';
import { useAuth } from '@/auth/AuthContext';
import { useFarmProfile } from '@/hooks/useFarmProfile';
import { fetchExpenses } from '@/api';
import { invalidateFarmQueries } from '@/api/invalidate';
import { createExpense, deleteExpense, syncExpenses, updateExpense } from '@/api/mutations';
import type { Expense, ExpenseCategory } from '@/api/types';
import { color, fmtFcfa, radii, spacing } from '@/constants/theme';

const CATEGORIES: { key: ExpenseCategory; label: string; account: string; tone: ChipTone }[] = [
  { key: 'ACHAT_POUSSINS', label: 'Achat poussins', account: '6010', tone: 'amber' },
  { key: 'ALIMENTS', label: 'Aliments', account: '6011', tone: 'green' },
  { key: 'VETERINAIRE', label: 'Vétérinaire', account: '6012', tone: 'red' },
  { key: 'TRANSPORT', label: 'Transport', account: '604', tone: 'accent' },
  { key: 'EAU', label: 'Eau', account: '6052', tone: 'brand' },
  { key: 'ENERGIE_GAZ', label: 'Énergie & gaz', account: '6061', tone: 'brand' },
  { key: 'LOYER', label: 'Loyer', account: '613', tone: 'neutral' },
  { key: 'MAINTENANCE', label: 'Maintenance', account: '615', tone: 'neutral' },
  { key: 'ASSURANCE', label: 'Assurance', account: '616', tone: 'neutral' },
  { key: 'MAIN_D_OEUVRE', label: 'Main d’œuvre', account: '641', tone: 'neutral' },
  { key: 'COTISATIONS', label: 'Cotisations', account: '645', tone: 'neutral' },
  { key: 'FRAIS_BANCAIRES', label: 'Frais bancaires', account: '661', tone: 'outline' },
  { key: 'AUTRE', label: 'Autre', account: '65', tone: 'outline' },
];

const isAutoCreated = (e: Expense) =>
  typeof e.notes === 'string' && e.notes.startsWith('[Auto]');

function ExpenseRow({
  e,
  canEdit,
  deleting,
  onEdit,
  onDelete,
}: {
  e: Expense;
  canEdit: boolean;
  deleting: boolean;
  onEdit: () => void;
  onDelete: () => void;
}) {
  const cat = CATEGORIES.find((c) => c.key === e.category) ?? CATEGORIES[CATEGORIES.length - 1];
  const auto = isAutoCreated(e);
  return (
    <Card tone="default" style={styles.expCard}>
      <View style={styles.expHead}>
        <Chip label={`${cat.label} (${cat.account})`} tone={cat.tone} />
        <Chip label={e.paidByCaisse ? 'Caisse' : 'Fournisseur'} tone={e.paidByCaisse ? 'green' : 'neutral'} />
        {auto ? <Chip label="Auto" tone="accent" /> : null}
        <View style={{ flex: 1 }} />
        {canEdit && !auto ? (
          <View style={styles.expActions}>
            <Pressable onPress={onEdit} hitSlop={8} style={styles.expAction} accessibilityRole="button" accessibilityLabel="Modifier la dépense">
              <Pencil size={15} color={color.brand[600]} />
            </Pressable>
            <Pressable onPress={onDelete} hitSlop={8} disabled={deleting} style={styles.expAction} accessibilityRole="button" accessibilityLabel="Supprimer la dépense">
              {deleting ? <ActivityIndicator size="small" color={color.red[500]} /> : <Trash2 size={15} color={color.red[500]} />}
            </Pressable>
          </View>
        ) : null}
      </View>
      <View style={styles.expBody}>
        <View style={{ flex: 1 }}>
          <AppText size="body" weight="semibold" color="text">
            {e.label ?? cat.label}
          </AppText>
          <AppText size="caption" color="muted">
            {e.expenseDate?.slice(0, 10) ?? '—'}
            {e.supplier ? ` · ${e.supplier}` : ''}
          </AppText>
        </View>
        <AppText size="body" weight="bold" color="danger">
          - {fmtFcfa(e.amountFcfa)}
        </AppText>
      </View>
    </Card>
  );
}

export default function DepensesScreen() {
  const { farmId } = useAuth();
  const { hasPermission } = useFarmProfile();
  const queryClient = useQueryClient();

  const canEdit = !!farmId && hasPermission('compta:depense');

  const [sheet, setSheet] = useState<'create' | 'edit' | null>(null);
  const [editing, setEditing] = useState<Expense | null>(null);
  const [cat, setCat] = useState<ExpenseCategory>('ALIMENTS');
  const [amount, setAmount] = useState('');
  const [label, setLabel] = useState('');
  const [supplier, setSupplier] = useState('');
  const [notes, setNotes] = useState('');
  const [paid, setPaid] = useState(true);
  const [busy, setBusy] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);
  const [deletingId, setDeletingId] = useState<string | null>(null);
  const [syncing, setSyncing] = useState(false);

  const q = useQuery({
    queryKey: ['expenses', farmId],
    queryFn: () => fetchExpenses(farmId ?? ''),
    enabled: !!farmId,
  });
  const expenses = q.data ?? [];
  const total = expenses.reduce((s, x) => s + x.amountFcfa, 0);

  const refresh = () => {
    invalidateFarmQueries(queryClient, { farmId: farmId ?? '' });
    void queryClient.invalidateQueries({ queryKey: ['expenses', farmId] });
    void queryClient.invalidateQueries({ queryKey: ['accounting-journal', farmId] });
    void queryClient.invalidateQueries({ queryKey: ['accounting-balance', farmId] });
    void queryClient.invalidateQueries({ queryKey: ['accounting-resultat', farmId] });
    void queryClient.invalidateQueries({ queryKey: ['accounting-bilan', farmId] });
  };

  const openCreate = () => {
    setCat('ALIMENTS');
    setAmount('');
    setLabel('');
    setSupplier('');
    setNotes('');
    setPaid(true);
    setFormError(null);
    setSheet('create');
  };

  const openEdit = (e: Expense) => {
    setEditing(e);
    setCat(e.category);
    setAmount('');
    setLabel(e.label ?? '');
    setSupplier(e.supplier ?? '');
    setNotes(e.notes ?? '');
    setPaid(true);
    setFormError(null);
    setSheet('edit');
  };

  const submit = async () => {
    if (sheet === 'create') {
      const value = Math.round(Number(amount) || 0);
      if (value <= 0) {
        setFormError('Montant invalide.');
        return;
      }
      setBusy(true);
      setFormError(null);
      try {
        await createExpense(farmId ?? '', {
          category: cat,
          amountFcfa: value,
          ...(label.trim() ? { label: label.trim() } : {}),
          ...(supplier.trim() ? { supplier: supplier.trim() } : {}),
          ...(notes.trim() ? { notes: notes.trim() } : {}),
          paidByCaisse: paid,
        });
        setSheet(null);
        refresh();
      } catch (e) {
        setFormError(e instanceof Error ? e.message : 'Erreur lors de l’enregistrement de la dépense.');
      } finally {
        setBusy(false);
      }
    } else if (sheet === 'edit' && editing) {
      setBusy(true);
      setFormError(null);
      try {
        await updateExpense(farmId ?? '', editing.id, {
          category: cat,
          ...(label.trim() ? { label: label.trim() } : {}),
          ...(supplier.trim() ? { supplier: supplier.trim() } : {}),
          ...(notes.trim() ? { notes: notes.trim() } : {}),
        });
        setSheet(null);
        refresh();
      } catch (e) {
        setFormError(e instanceof Error ? e.message : 'Erreur lors de la modification de la dépense.');
      } finally {
        setBusy(false);
      }
    }
  };

  const confirmDelete = (e: Expense) => {
    Alert.alert(
      'Supprimer cette dépense ?',
      `${fmtFcfa(e.amountFcfa)}${e.label ? ` — ${e.label}` : ''}.\n\nL’écriture comptable sera contre-passée.`,
      [
        { text: 'Annuler', style: 'cancel' },
        { text: 'Supprimer', style: 'destructive', onPress: () => void doDelete(e) },
      ],
    );
  };

  const doDelete = async (e: Expense) => {
    setDeletingId(e.id);
    try {
      await deleteExpense(farmId ?? '', e.id);
      refresh();
    } catch (err) {
      Alert.alert('Suppression impossible', err instanceof Error ? err.message : 'Erreur inattendue.');
    } finally {
      setDeletingId(null);
    }
  };

  const handleSync = async () => {
    setSyncing(true);
    try {
      const result = await syncExpenses(farmId ?? '');
      const total = result.batchesSynced + result.inputsSynced;
      if (total > 0) {
        Alert.alert(
          'Synchronisation terminée',
          `${result.batchesSynced} lot(s) et ${result.inputsSynced} intrant(s) synchronisés.`,
        );
      } else {
        Alert.alert('Synchronisation terminée', 'Toutes les dépenses sont déjà synchronisées.');
      }
      refresh();
    } catch (err) {
      Alert.alert('Erreur', err instanceof Error ? err.message : 'Erreur lors de la synchronisation.');
    } finally {
      setSyncing(false);
    }
  };

  return (
    <Screen
      header={
        <ScreenHeader
          title="Dépenses"
          subtitle="Suivi des charges et sorties de caisse"
          back
          right={
            canEdit ? (
              <Pressable onPress={openCreate} style={styles.addBtn} accessibilityRole="button" accessibilityLabel="Nouvelle dépense">
                <Plus size={20} color={color.surface} />
              </Pressable>
            ) : undefined
          }
        />
      }>
      {q.isLoading ? (
        <Spinner label="Chargement des dépenses…" />
      ) : (
        <>
          <Card tone="brand" style={styles.totalCard}>
            <View style={styles.totalRow}>
              <View style={styles.totalIcon}>
                <Banknote size={18} color={color.brand[600]} />
              </View>
              <View style={{ flex: 1 }}>
                <AppText size="body" weight="semibold" color="text">
                  Total des dépenses
                </AppText>
                <AppText size="caption" color="muted">
                  {expenses.length} écriture{expenses.length > 1 ? 's' : ''}
                </AppText>
              </View>
              <AppText size="h3" weight="bold" color="danger">
                - {fmtFcfa(total)}
              </AppText>
            </View>
          </Card>

          <Card tone="default" style={styles.infoBanner}>
            <View style={styles.infoRow}>
              <Info size={16} color={color.brand[600]} />
              <AppText size="caption" color="muted" style={{ flex: 1, marginLeft: 8 }}>
                Les dépenses liées aux poussins, aliments et intrants sont créées automatiquement lors de la création des lots et réceptions. Elles apparaissent ici avec le badge « Auto ».
              </AppText>
            </View>
            {canEdit ? (
              <Pressable
                onPress={() => void handleSync()}
                disabled={syncing}
                style={styles.syncBtn}
                accessibilityRole="button"
                accessibilityLabel="Synchroniser les dépenses">
                {syncing ? (
                  <ActivityIndicator size="small" color={color.brand[600]} />
                ) : (
                  <AppText size="caption" weight="semibold" color="brand">
                    Synchroniser les dépenses
                  </AppText>
                )}
              </Pressable>
            ) : null}
          </Card>

          <SectionHeader title="Liste des dépenses" />
          {expenses.length === 0 ? (
            <Card tone="default" style={styles.empty}>
              <AppText size="body" color="muted" style={styles.emptyText}>
                Aucune dépense enregistrée. Les dépenses liées au cheptel (poussins, aliments, traitement) sont comptabilisées ici.
              </AppText>
            </Card>
          ) : (
            <View style={{ gap: 10 }}>
              {expenses.map((e) => (
                <ExpenseRow
                  key={e.id}
                  e={e}
                  canEdit={canEdit}
                  deleting={deletingId === e.id}
                  onEdit={() => openEdit(e)}
                  onDelete={() => confirmDelete(e)}
                />
              ))}
            </View>
          )}

          {canEdit ? (
            <Button label="Nouvelle dépense" tone="brand" icon={Plus} onPress={openCreate} style={styles.newBtn} />
          ) : (
            <Card tone="default" style={styles.empty}>
              <AppText size="body" color="muted" style={styles.emptyText}>
                Réservé aux droits « dépenses ». Vous pouvez consulter les dépenses de la ferme.
              </AppText>
            </Card>
          )}
        </>
      )}

      <Sheet
        visible={sheet === 'create'}
        title="Nouvelle dépense"
        subtitle="Sortie de caisse ou achat à crédit, comptabilisée immédiatement."
        icon={<ReceiptText size={22} color={color.brand[600]} />}
        onClose={() => {
          setSheet(null);
          setEditing(null);
          setFormError(null);
        }}>
        <AppText size="label" color="muted" style={{ marginBottom: 6 }}>
          CATÉGORIE
        </AppText>
        <View style={styles.chips}>
          {CATEGORIES.map((c) => (
            <Pressable key={c.key} onPress={() => setCat(c.key)} accessibilityRole="button">
              <Chip label={`${c.label} (${c.account})`} tone={c.tone} selected={cat === c.key} />
            </Pressable>
          ))}
        </View>

        <AppText size="label" color="muted" style={styles.fieldLabel}>
          MONTANT (FCFA)
        </AppText>
        <NumberInput value={amount} onChangeText={setAmount} placeholder="0" maxLength={12} suffix="FCFA" editable={!busy} />

        <AppText size="label" color="muted" style={styles.fieldLabel}>
          INTITULÉ
        </AppText>
        <TextInput
          value={label}
          onChangeText={setLabel}
          placeholder="Ex. sacs d’aliment démarrage"
          placeholderTextColor={color.ink[300]}
          style={styles.input}
          editable={!busy}
          maxLength={120}
        />

        <AppText size="label" color="muted" style={styles.fieldLabel}>
          FOURNISSEUR (OPTIONNEL)
        </AppText>
        <TextInput
          value={supplier}
          onChangeText={setSupplier}
          placeholder="Ex. AgroGabon"
          placeholderTextColor={color.ink[300]}
          style={styles.input}
          editable={!busy}
          maxLength={120}
        />

        <AppText size="label" color="muted" style={styles.fieldLabel}>
          REMARQUES (OPTIONNEL)
        </AppText>
        <TextInput
          value={notes}
          onChangeText={setNotes}
          placeholder="Notes internes"
          placeholderTextColor={color.ink[300]}
          style={[styles.input, styles.multiline]}
          editable={!busy}
          maxLength={300}
          multiline
        />

        <AppText size="label" color="muted" style={styles.fieldLabel}>
          PAIEMENT
        </AppText>
        <View style={styles.payRow}>
          <Pressable onPress={() => setPaid(true)} style={[styles.payOpt, paid && styles.payOptActive]} accessibilityRole="button">
            <AppText size="body" weight={paid ? 'bold' : 'medium'} color={paid ? 'brand' : 'muted'}>
              Payée à la caisse
            </AppText>
          </Pressable>
          <Pressable onPress={() => setPaid(false)} style={[styles.payOpt, !paid && styles.payOptActive]} accessibilityRole="button">
            <AppText size="body" weight={!paid ? 'bold' : 'medium'} color={!paid ? 'brand' : 'muted'}>
              Fournisseur (crédit)
            </AppText>
          </Pressable>
        </View>
        <AppText size="caption" color="muted" style={styles.tip}>
          « Payée à la caisse » décaisse immédiatement l’espèce (session ouverte requise).
        </AppText>

        {formError ? (
          <AppText size="small" color="danger" style={styles.fieldLabel}>
            {formError}
          </AppText>
        ) : null}

        <Button
          label="Enregistrer la dépense"
          tone="brand"
          icon={Pencil}
          onPress={() => void submit()}
          disabled={busy}
          loading={busy}
        />
      </Sheet>

      <Sheet
        visible={sheet === 'edit' && editing !== null}
        title="Modifier la dépense"
        subtitle={editing ? `Écrite le ${editing.expenseDate?.slice(0, 10) ?? '—'}` : undefined}
        icon={<ReceiptText size={22} color={color.brand[600]} />}
        onClose={() => {
          setSheet(null);
          setEditing(null);
          setFormError(null);
        }}>
        <View style={styles.editAmount}>
          <AppText size="body" color="muted" style={{ flex: 1 }}>
            Montant (non modifiable)
          </AppText>
          <AppText size="body" weight="bold" color="danger">
            - {fmtFcfa(editing?.amountFcfa ?? 0)}
          </AppText>
        </View>

        <AppText size="label" color="muted" style={{ marginBottom: 6 }}>
          CATÉGORIE
        </AppText>
        <View style={styles.chips}>
          {CATEGORIES.map((c) => (
            <Pressable key={c.key} onPress={() => setCat(c.key)} accessibilityRole="button">
              <Chip label={`${c.label} (${c.account})`} tone={c.tone} selected={cat === c.key} />
            </Pressable>
          ))}
        </View>
        <AppText size="caption" color="muted" style={styles.tip}>
          Changer la catégorie reclasse automatiquement le compte de charge.
        </AppText>

        <AppText size="label" color="muted" style={styles.fieldLabel}>
          INTITULÉ
        </AppText>
        <TextInput
          value={label}
          onChangeText={setLabel}
          placeholder="Ex. sacs d’aliment démarrage"
          placeholderTextColor={color.ink[300]}
          style={styles.input}
          editable={!busy}
          maxLength={120}
        />

        <AppText size="label" color="muted" style={styles.fieldLabel}>
          FOURNISSEUR (OPTIONNEL)
        </AppText>
        <TextInput
          value={supplier}
          onChangeText={setSupplier}
          placeholder="Ex. AgroGabon"
          placeholderTextColor={color.ink[300]}
          style={styles.input}
          editable={!busy}
          maxLength={120}
        />

        <AppText size="label" color="muted" style={styles.fieldLabel}>
          REMARQUES (OPTIONNEL)
        </AppText>
        <TextInput
          value={notes}
          onChangeText={setNotes}
          placeholder="Notes internes"
          placeholderTextColor={color.ink[300]}
          style={[styles.input, styles.multiline]}
          editable={!busy}
          maxLength={300}
          multiline
        />

        {formError ? (
          <AppText size="small" color="danger" style={styles.fieldLabel}>
            {formError}
          </AppText>
        ) : null}

        <Button
          label="Enregistrer les modifications"
          tone="brand"
          icon={Pencil}
          onPress={() => void submit()}
          disabled={busy}
          loading={busy}
        />
      </Sheet>
    </Screen>
  );
}

const styles = StyleSheet.create({
  addBtn: {
    width: 38,
    height: 38,
    borderRadius: 12,
    backgroundColor: color.brand[600],
    alignItems: 'center',
    justifyContent: 'center',
  },
  totalCard: {
    flexDirection: 'row',
    padding: 14,
  },
  totalRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
  },
  totalIcon: {
    width: 36,
    height: 36,
    borderRadius: 10,
    backgroundColor: color.surface,
    alignItems: 'center',
    justifyContent: 'center',
  },
  expCard: {
    gap: 10,
    padding: 14,
  },
  expHead: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  expActions: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
  },
  expAction: {
    width: 30,
    height: 30,
    borderRadius: 8,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: color.surfaceAlt,
  },
  expBody: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
  },
  empty: {
    padding: 14,
  },
  emptyText: {
    textAlign: 'left',
  },
  newBtn: {
    marginTop: spacing.lg,
  },
  chips: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 6,
    marginTop: 4,
  },
  fieldLabel: {
    marginTop: 12,
    marginBottom: 4,
  },
  input: {
    borderWidth: 1.5,
    borderColor: color.border,
    borderRadius: radii.md,
    backgroundColor: color.surface,
    paddingHorizontal: 12,
    paddingVertical: 9,
    fontSize: 15,
    color: color.ink[900],
    marginBottom: 4,
  },
  multiline: {
    minHeight: 70,
    textAlignVertical: 'top',
  },
  payRow: {
    flexDirection: 'row',
    gap: 8,
    marginTop: 4,
  },
  payOpt: {
    flex: 1,
    alignItems: 'center',
    paddingVertical: 10,
    borderRadius: radii.md,
    borderWidth: 1.5,
    borderColor: color.border,
    backgroundColor: color.surface,
  },
  payOptActive: {
    borderColor: color.brand[500],
    backgroundColor: color.brand[50],
  },
  infoBanner: {
    padding: 12,
    marginBottom: 4,
  },
  infoRow: {
    flexDirection: 'row',
    alignItems: 'flex-start',
  },
  syncBtn: {
    marginTop: 8,
    paddingVertical: 6,
    paddingHorizontal: 12,
    borderRadius: radii.md,
    borderWidth: 1,
    borderColor: color.brand[200],
    backgroundColor: color.brand[50],
    alignSelf: 'flex-start',
  },
  tip: {
    marginTop: 6,
  },
  editAmount: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: color.surfaceAlt,
    borderRadius: radii.md,
    paddingHorizontal: 12,
    paddingVertical: 10,
  },
});