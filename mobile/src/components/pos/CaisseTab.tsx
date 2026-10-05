import React, { useState } from 'react';
import { ActivityIndicator, Alert, Keyboard, Pressable, ScrollView, StyleSheet, TextInput, View } from 'react-native';
import { useQuery } from '@tanstack/react-query';
import { ArrowDownToLine, ArrowUpFromLine, Coins, FolderClosed, FolderOpen, Pencil, Trash2 } from 'lucide-react-native';

import { AppText } from '@/components/ui/AppText';
import { Button } from '@/components/ui/Button';
import { Card } from '@/components/ui/Card';
import { Chip } from '@/components/ui/Chip';
import { SectionHeader } from '@/components/ui/SectionHeader';
import { Sheet } from '@/components/ui/Sheet';
import { Spinner } from '@/components/ui/Spinner';
import { fetchCaisseSessions } from '@/api';
import { closeCaisse, createCashMovement, deleteCashMovement, openCaisse, updateCashMovement } from '@/api/mutations';
import type { CashMovement, CashMovementType, CashSession, CaisseSummary } from '@/api/types';
import { color, fmtFcfa, palette, radii, spacing } from '@/constants/theme';

export const SOURCE_LABEL: Record<string, string> = {
  SALE_PAYMENT: 'Vente',
  MANUAL: 'Manuel',
  REFUND: 'Remboursement',
  EXPENSE: 'Dépense',
};

interface MovementRowProps {
  m: CashMovement;
  editable: boolean;
  deleting: boolean;
  onEdit: () => void;
  onDelete: () => void;
}

function MovementRow({ m, editable, deleting, onEdit, onDelete }: MovementRowProps) {
  const negative = m.type === 'OUT';
  return (
    <View style={styles.mvRow}>
      <View style={styles.mvBadge}>
        {negative ? (
          <ArrowUpFromLine size={16} color={color.red[500]} />
        ) : (
          <ArrowDownToLine size={16} color={color.green[600]} />
        )}
      </View>
      <View style={{ flex: 1 }}>
        <AppText size="body" weight="semibold" color="text">
          {SOURCE_LABEL[m.source] ?? m.source}
        </AppText>
        <AppText size="caption" color="muted">
          {m.reason ?? (m.saleId ? 'Encaissement vente' : 'Caisse')} · {m.movementDate?.slice(0, 10)}
        </AppText>
      </View>
      <AppText size="body" weight="bold" color={negative ? 'danger' : 'success'}>
        {negative ? '-' : '+'} {fmtFcfa(m.amountFcfa)}
      </AppText>
      {editable ? (
        <View style={styles.mvActions}>
          <Pressable onPress={onEdit} hitSlop={8} style={styles.mvAction} accessibilityRole="button" accessibilityLabel="Modifier le mouvement">
            <Pencil size={15} color={color.brand[600]} />
          </Pressable>
          <Pressable onPress={onDelete} hitSlop={8} disabled={deleting} style={styles.mvAction} accessibilityRole="button" accessibilityLabel="Supprimer le mouvement">
            {deleting ? <ActivityIndicator size="small" color={color.red[500]} /> : <Trash2 size={15} color={color.red[500]} />}
          </Pressable>
        </View>
      ) : null}
    </View>
  );
}

function SessionCard({ s }: { s: CashSession }) {
  const open = s.status === 'OPEN';
  return (
    <Card tone={open ? 'green' : 'default'} style={styles.card}>
      <View style={styles.sessionHead}>
        <View style={{ gap: 2, flex: 1 }}>
          <AppText size="body" weight="bold" color="text">
            {open ? 'Session ouverte' : 'Session clôturée'}
          </AppText>
          <AppText size="caption" color="muted">
            Ouverte le {s.openedAt?.slice(0, 10) ?? '—'}{s.closedAt ? ` · clôturée le ${s.closedAt.slice(0, 10)}` : ''}
          </AppText>
        </View>
        {open ? <Chip label="OUVERTE" tone="green" dot /> : <Chip label="CLÔTURÉE" tone="neutral" />}
      </View>
      <View style={{ gap: 2 }}>
        <RowRow label="Fonds d’ouverture" value={fmtFcfa(s.openingBalanceFcfa ?? 0)} />
        <RowRow label="Attendu à la clôture" value={fmtFcfa(s.closingExpectedFcfa ?? 0)} />
        <RowRow label="Déclaré" value={fmtFcfa(s.closingBalanceFcfa ?? 0)} />
        {!open ? <RowRow label="Écart" value={fmtFcfa(s.closingDifferenceFcfa ?? 0)} warn={(s.closingDifferenceFcfa ?? 0) !== 0} /> : null}
      </View>
    </Card>
  );
}

function RowRow({ label, value, warn }: { label: string; value: string; warn?: boolean }) {
  return (
    <View style={styles.rowRow}>
      <AppText size="small" color="muted">
        {label}
      </AppText>
      <AppText size="small" weight="semibold" color={warn ? 'warn' : 'text'}>
        {value}
      </AppText>
    </View>
  );
}

interface CaisseTabProps {
  farmId: string;
  current: CaisseSummary | null;
  loading: boolean;
  canManage: boolean;
  onChanged: () => void;
}

export function CaisseTab({ farmId, current, loading, canManage, onChanged }: CaisseTabProps) {
  const sessions = useQuery({ queryKey: ['caisse-sessions', farmId], queryFn: () => fetchCaisseSessions(farmId) });

  const [amount, setAmount] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const [editMv, setEditMv] = useState<CashMovement | null>(null);
  const [mvAmount, setMvAmount] = useState('');
  const [mvReason, setMvReason] = useState('');
  const [mvBusy, setMvBusy] = useState(false);
  const [mvError, setMvError] = useState<string | null>(null);
  const [deletingId, setDeletingId] = useState<string | null>(null);

  const [mvCreateOpen, setMvCreateOpen] = useState(false);
  const [mvType, setMvType] = useState<CashMovementType>('IN');

  const hasOpen = !!current?.session;
  const movements = current?.movements ?? [];
  const history = sessions.data ?? [];

  const fmtDate = (d?: string) => (d ? d.slice(0, 10) : '—');

  const act = async (kind: 'open' | 'close') => {
    const value = Math.round(Number(amount.replace(/[^\d]/g, '')) || 0);
    if (kind === 'open' && value < 0) return;
    Keyboard.dismiss();
    setBusy(true);
    setError(null);
    try {
      if (kind === 'open') await openCaisse(farmId, value);
      else await closeCaisse(farmId, value);
      setAmount('');
      onChanged();
    } catch (e) {
      const message = e instanceof Error ? e.message : 'Erreur lors de l’opération de caisse.';
      setError(message);
    } finally {
      setBusy(false);
    }
  };

  const formatAmount = (t: string) =>
    t.replace(/[^\d]/g, '').replace(/\B(?=(\d{3})+(?!\d))/g, ' ');

  const openCreateMv = (type: CashMovementType) => {
    setMvType(type);
    setMvAmount('');
    setMvReason('');
    setMvError(null);
    setMvCreateOpen(true);
  };

  const saveNewMovement = async () => {
    const value = Math.round(Number(mvAmount.replace(/\s/g, '')) || 0);
    if (value <= 0) {
      setMvError('Montant invalide.');
      return;
    }
    Keyboard.dismiss();
    setMvBusy(true);
    setMvError(null);
    try {
      await createCashMovement(farmId, {
        type: mvType,
        amountFcfa: value,
        ...(mvReason.trim() ? { reason: mvReason.trim() } : {}),
      });
      setMvCreateOpen(false);
      setMvAmount('');
      setMvReason('');
      onChanged();
    } catch (e) {
      setMvError(e instanceof Error ? e.message : 'Erreur lors de l’enregistrement du mouvement.');
    } finally {
      setMvBusy(false);
    }
  };

  const saveMovement = async () => {
    if (!editMv) return;
    const next = Math.round(Number(mvAmount.replace(/\s/g, '')) || 0);
    if (next <= 0) {
      setMvError('Montant invalide.');
      return;
    }
    Keyboard.dismiss();
    setMvBusy(true);
    setMvError(null);
    try {
      await updateCashMovement(farmId, editMv.id, {
        amountFcfa: next,
        ...(mvReason.trim() ? { reason: mvReason.trim() } : {}),
      });
      setEditMv(null);
      onChanged();
    } catch (e) {
      setMvError(e instanceof Error ? e.message : 'Erreur lors de la modification du mouvement.');
    } finally {
      setMvBusy(false);
    }
  };

  const openEdit = (m: CashMovement) => {
    setEditMv(m);
    setMvAmount(String(m.amountFcfa));
    setMvReason(m.reason ?? '');
    setMvError(null);
  };

  const confirmDelete = (m: CashMovement) => {
    const line = `${m.type === 'OUT' ? 'Sortie' : 'Entrée'} de ${fmtFcfa(m.amountFcfa)}${m.reason ? ` — ${m.reason}` : ''}.`;
    Alert.alert(
      'Supprimer ce mouvement ?',
      `${line}\n\nL’écriture comptable sera contre-passée.`,
      [
        { text: 'Annuler', style: 'cancel' },
        { text: 'Supprimer', style: 'destructive', onPress: () => void doDelete(m) },
      ],
    );
  };

  const doDelete = async (m: CashMovement) => {
    setDeletingId(m.id);
    try {
      await deleteCashMovement(farmId, m.id);
      onChanged();
    } catch (e) {
      Alert.alert('Suppression impossible', e instanceof Error ? e.message : 'Erreur inattendue.');
    } finally {
      setDeletingId(null);
    }
  };

  return (
    <>
      <ScrollView style={styles.scroll} contentContainerStyle={styles.content} showsVerticalScrollIndicator={false}>
      {loading ? (
        <Spinner label="Lecture de la caisse…" />
      ) : (
        <>
          {current ? (
            <Card tone="brand" style={styles.card}>
              <View style={styles.sessionHead}>
                <View style={{ gap: 2, flex: 1 }}>
                  <AppText size="body" weight="bold" color="text">
                    Caisse {hasOpen ? 'ouverte' : 'fermée'}
                  </AppText>
                  <AppText size="caption" color="muted">
                    {current.session?.openedAt ? `Ouverte le ${fmtDate(current.session.openedAt)}` : 'Aucune session ouverte'}
                  </AppText>
                </View>
                <Chip label="ESPÈCES" tone="green" dot />
              </View>
              {hasOpen ? (
                <View style={{ gap: 2 }}>
                  <RowRow label="Solde attendu" value={fmtFcfa(current.expectedBalanceFcfa)} />
                  <RowRow label="Entrées" value={fmtFcfa(current.inFcfa)} />
                  <RowRow label="Sorties" value={fmtFcfa(current.outFcfa)} />
                </View>
              ) : null}
            </Card>
          ) : null}

          {canManage ? (
            <Card tone="default" style={styles.card}>
              <AppText size="label" color="muted" style={{ marginBottom: 6 }}>
                {hasOpen ? 'CLÔTURE DE CAISSE' : 'OUVERTURE DE CAISSE'}
              </AppText>
              <TextInput
                value={amount}
                onChangeText={(t) => {
                  setAmount(t);
                  setError(null);
                }}
                placeholder={hasOpen ? 'FCFA déclarés en caisse' : 'Fonds de caisse initial (FCFA)'}
                placeholderTextColor={color.ink[300]}
                keyboardType="number-pad"
                style={styles.input}
                editable={!busy}
              />
              {error ? (
                <AppText size="small" color="danger" style={{ marginBottom: 8 }}>
                  {error}
                </AppText>
              ) : null}
              <Button
                label={hasOpen ? 'Clôturer la caisse' : 'Ouvrir la caisse'}
                tone={hasOpen ? 'success' : 'brand'}
                icon={hasOpen ? FolderClosed : FolderOpen}
                onPress={() => act(hasOpen ? 'close' : 'open')}
                disabled={busy}
                loading={busy}
              />
            </Card>
          ) : (
            <Card tone="default" style={styles.card}>
              <AppText size="label" color="muted" style={{ marginBottom: 6 }}>
                OUVERTURE / CLÔTURE DE CAISSE
              </AppText>
              <AppText size="body" color="muted">
                Réservé au propriétaire. Vous pouvez consulter le statut de la caisse, les mouvements du jour et l’historique des sessions.
              </AppText>
            </Card>
          )}

          {canManage && hasOpen ? (
            <Card tone="default" style={styles.card}>
              <AppText size="label" color="muted" style={{ marginBottom: 4 }}>
                MOUVEMENT MANUEL
              </AppText>
              <AppText size="caption" color="muted" style={{ marginBottom: 10 }}>
                Apport ou prélèvement hors vente — comptabilisé 571/108 (ou 108/571).
              </AppText>
              <View style={styles.mvCreateActions}>
                <Button
                  label="Entrée"
                  tone="success"
                  size="md"
                  block={false}
                  icon={ArrowDownToLine}
                  onPress={() => openCreateMv('IN')}
                />
                <Button
                  label="Sortie"
                  tone="danger"
                  size="md"
                  block={false}
                  icon={ArrowUpFromLine}
                  onPress={() => openCreateMv('OUT')}
                />
              </View>
            </Card>
          ) : null}

          <SectionHeader title="Mouvements du jour" subtitle={current ? fmtDate(current.session?.openedAt) : ''} />
          <View style={{ gap: 4 }}>
            {movements.length === 0 ? (
              <AppText size="caption" color="muted">
                Aucun mouvement aujourd’hui.
              </AppText>
            ) : (
              movements.map((m) => (
                <MovementRow
                  key={m.id}
                  m={m}
                  editable={canManage && hasOpen && m.source === 'MANUAL'}
                  deleting={deletingId === m.id}
                  onEdit={() => openEdit(m)}
                  onDelete={() => confirmDelete(m)}
                />
              ))
            )}
          </View>

          <SectionHeader title="Historique des sessions" />
          <View style={{ gap: 10 }}>
            {history.length === 0 ? (
              <AppText size="caption" color="muted">
                Aucune session passée.
              </AppText>
            ) : (
              history.map((s) => <SessionCard key={s.id} s={s} />)
            )}
          </View>
        </>
      )}
      </ScrollView>

      <Sheet
        visible={mvCreateOpen}
        title="Mouvement manuel"
        subtitle={mvType === 'IN' ? 'Apport en caisse · 571 / 108' : 'Prélèvement en caisse · 108 / 571'}
        icon={<Coins size={22} color={color.brand[600]} />}
        onClose={() => {
          setMvCreateOpen(false);
          setMvError(null);
        }}>
        <View style={styles.mvTypeRow}>
          <Pressable onPress={() => setMvType('IN')} style={[styles.mvTypeOpt, mvType === 'IN' && styles.mvTypeActive]} accessibilityRole="button">
            <AppText size="body" weight={mvType === 'IN' ? 'bold' : 'medium'} color={mvType === 'IN' ? 'success' : 'muted'}>
              Entrée
            </AppText>
          </Pressable>
          <Pressable onPress={() => setMvType('OUT')} style={[styles.mvTypeOpt, mvType === 'OUT' && styles.mvTypeActiveOut]} accessibilityRole="button">
            <AppText size="body" weight={mvType === 'OUT' ? 'bold' : 'medium'} color={mvType === 'OUT' ? 'danger' : 'muted'}>
              Sortie
            </AppText>
          </Pressable>
        </View>

        <AppText size="label" color="muted" style={{ marginBottom: 6 }}>
          MONTANT (FCFA)
        </AppText>
        <TextInput
          value={mvAmount}
          onChangeText={(t) => {
            setMvAmount(formatAmount(t));
            setMvError(null);
          }}
          placeholder="0"
          placeholderTextColor={color.ink[300]}
          keyboardType="number-pad"
          style={styles.input}
          editable={!mvBusy}
          autoFocus
        />
        <AppText size="label" color="muted" style={{ marginBottom: 6 }}>
          MOTIF
        </AppText>
        <TextInput
          value={mvReason}
          onChangeText={setMvReason}
          placeholder="Ex. versement avance, dépense imprévue…"
          placeholderTextColor={color.ink[300]}
          style={styles.input}
          editable={!mvBusy}
          maxLength={160}
        />
        {mvError ? (
          <AppText size="small" color="danger" style={{ marginBottom: 8 }}>
            {mvError}
          </AppText>
        ) : null}
        <Button
          label="Enregistrer le mouvement"
          tone="brand"
          icon={Pencil}
          onPress={() => void saveNewMovement()}
          disabled={mvBusy}
          loading={mvBusy}
        />
      </Sheet>

      <Sheet
        visible={editMv !== null}
        title="Modifier le mouvement"
        subtitle={editMv ? `Mouvement manuel du ${fmtDate(editMv.movementDate)}` : undefined}
        icon={<Coins size={22} color={color.brand[600]} />}
        onClose={() => {
          setEditMv(null);
          setMvError(null);
        }}>
        <AppText size="label" color="muted" style={{ marginBottom: 6 }}>
          MONTANT (FCFA)
        </AppText>
        <TextInput
          value={mvAmount}
          onChangeText={(t) => {
            setMvAmount(formatAmount(t));
            setMvError(null);
          }}
          placeholder="0"
          placeholderTextColor={color.ink[300]}
          keyboardType="number-pad"
          style={styles.input}
          editable={!mvBusy}
          autoFocus
        />
        <AppText size="label" color="muted" style={{ marginBottom: 6 }}>
          MOTIF
        </AppText>
        <TextInput
          value={mvReason}
          onChangeText={setMvReason}
          placeholder="Ex. versement avance, dépense imprévue…"
          placeholderTextColor={color.ink[300]}
          style={styles.input}
          editable={!mvBusy}
          maxLength={160}
        />
        {mvError ? (
          <AppText size="small" color="danger" style={{ marginBottom: 8 }}>
            {mvError}
          </AppText>
        ) : null}
        <Button
          label="Enregistrer"
          tone="brand"
          icon={Pencil}
          onPress={() => void saveMovement()}
          disabled={mvBusy}
          loading={mvBusy}
        />
      </Sheet>
    </>
  );
}

const styles = StyleSheet.create({
  scroll: {
    flex: 1,
    paddingHorizontal: spacing.lg,
    paddingTop: spacing.md,
  },
  content: {
    paddingBottom: spacing.lg,
  },
  card: {
    gap: 10,
    padding: 14,
  },
  mvRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    paddingVertical: 8,
    borderBottomWidth: 1,
    borderBottomColor: palette.border,
  },
  mvBadge: {
    width: 32,
    height: 32,
    borderRadius: 10,
    backgroundColor: color.surfaceAlt,
    alignItems: 'center',
    justifyContent: 'center',
  },
  mvActions: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 2,
    marginLeft: 4,
  },
  mvAction: {
    width: 30,
    height: 30,
    borderRadius: 8,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: color.surfaceAlt,
  },
  mvCreateActions: {
    flexDirection: 'row',
    gap: 8,
  },
  mvTypeRow: {
    flexDirection: 'row',
    gap: 8,
    marginBottom: 12,
  },
  mvTypeOpt: {
    flex: 1,
    alignItems: 'center',
    paddingVertical: 10,
    borderRadius: radii.md,
    borderWidth: 1.5,
    borderColor: color.border,
    backgroundColor: color.surface,
  },
  mvTypeActive: {
    borderColor: color.green[600],
    backgroundColor: color.green[50],
  },
  mvTypeActiveOut: {
    borderColor: color.red[500],
    backgroundColor: color.red[50],
  },
  sessionHead: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  rowRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    gap: 8,
  },
  input: {
    height: 48,
    borderWidth: 1,
    borderColor: palette.border,
    borderRadius: 12,
    paddingHorizontal: 14,
    fontSize: 15,
    color: color.ink[800],
    backgroundColor: palette.surface,
    marginBottom: 10,
  },
});