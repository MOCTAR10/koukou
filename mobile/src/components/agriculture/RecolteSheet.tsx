import React, { useState } from 'react';
import { Platform, Pressable, StyleSheet, TextInput, View } from 'react-native';
import DateTimePicker, { type DateTimePickerEvent } from '@react-native-community/datetimepicker';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { Calendar, ChevronDown, Crop } from 'lucide-react-native';

import { Sheet } from '../ui/Sheet';
import { AppText } from '../ui/AppText';
import { Button } from '../ui/Button';
import { NumberInput } from '../ui/NumberInput';
import { Chip } from '../ui/Chip';
import { useAuth } from '@/auth/AuthContext';
import { createRecolte } from '@/api/mutations';
import { invalidateFarmQueries } from '@/api/invalidate';
import type { Parcelle, RecolteUnit } from '@/api/types';
import { CULTURE_EMOJI } from '@/constants/agriculture';
import { color, palette, radii } from '@/constants/theme';

interface RecolteSheetProps {
  visible: boolean;
  parcelles: Parcelle[];
  onClose: () => void;
}

const UNITS: { key: RecolteUnit; label: string }[] = [
  { key: 'KG', label: 'kg' },
  { key: 'PIECE', label: 'pièce(s)' },
  { key: 'SAC', label: 'sac(s)' },
];

export function RecolteSheet({ visible, parcelles, onClose }: RecolteSheetProps) {
  const qc = useQueryClient();
  const { farmId } = useAuth();

  const [parcelleId, setParcelleId] = useState('');
  const [harvestDate, setHarvestDate] = useState<Date>(new Date());
  const [showPicker, setShowPicker] = useState(false);
  const [quantity, setQuantity] = useState('');
  const [unit, setUnit] = useState<RecolteUnit>('KG');
  const [notes, setNotes] = useState('');

  React.useEffect(() => {
    if (!visible) return;
    setParcelleId('');
    setHarvestDate(new Date());
    setQuantity('');
    setUnit('KG');
    setNotes('');
  }, [visible]);

  const saveMutation = useMutation({
    mutationFn: () => {
      const qty = parseFloat(quantity.replace(',', '.'));
      return createRecolte(farmId, {
        parcelleId,
        harvestDate: harvestDate.toISOString().slice(0, 10),
        quantity: qty,
        unit,
        ...(notes.trim() ? { notes: notes.trim() } : {}),
      });
    },
    onSuccess: () => {
      invalidateFarmQueries(qc, { farmId });
      qc.invalidateQueries({ queryKey: ['parcelles', farmId] });
      onClose();
    },
  });

  const sortedParcelles = [...parcelles].sort((a, b) => a.name.localeCompare(b.name, 'fr'));
  const qty = parseFloat(quantity.replace(',', '.'));
  const canSubmit = parcelles.some((p) => p.id === parcelleId) && Number.isFinite(qty) && qty > 0;

  const onDateChange = (_event: DateTimePickerEvent, date?: Date) => {
    if (Platform.OS === 'android') setShowPicker(false);
    if (date) setHarvestDate(date);
  };

  return (
    <Sheet
      visible={visible}
      title="Journaliser une récolte"
      subtitle="Quantité récoltée sur une parcelle — deviendra vendable au point de vente."
      accentColor={palette.green[600]}
      onClose={onClose}>
      {/* ── Parcelle ── */}
      <View style={styles.field}>
        <AppText size="label" weight="semibold" color="muted">Parcelle *</AppText>
        <View style={styles.rowWrap}>
          {sortedParcelles.map((p) => {
            const active = p.id === parcelleId;
            return (
              <Pressable key={p.id} onPress={() => setParcelleId(p.id)} accessibilityRole="button">
                <Chip
                  label={`${CULTURE_EMOJI[p.culture?.category] ?? '🌱'} ${p.name}`}
                  tone="green"
                  selected={active}
                  style={styles.chip}
                />
              </Pressable>
            );
          })}
        </View>
        {sortedParcelles.length === 0 ? (
          <AppText size="caption" color="faint">
            Aucune parcelle créée — ajoutez-en une dans l&rsquo;onglet Parcelles.
          </AppText>
        ) : null}
      </View>

      {/* ── Date ── */}
      <View style={styles.field}>
        <AppText size="label" weight="semibold" color="muted">Date de récolte *</AppText>
        <Pressable
          onPress={() => setShowPicker(true)}
          style={({ pressed }) => [styles.dateBtn, pressed && styles.dateBtnPressed]}
          accessibilityRole="button">
          <View style={styles.dateIcon}>
            <Calendar size={18} color={palette.green[600]} strokeWidth={2.4} />
          </View>
          <View style={styles.dateCol}>
            <AppText size="small" weight="semibold" color="text">
              {harvestDate.toLocaleDateString('fr-FR', { day: 'numeric', month: 'long', year: 'numeric' })}
            </AppText>
            <AppText size="caption" color="faint">
              {sameDay(harvestDate, new Date()) ? 'Aujourd’hui' : 'Cliquez pour modifier'}
            </AppText>
          </View>
          <View pointerEvents="none">
            <ChevronDown size={16} color={color.ink[400]} strokeWidth={2.4} />
          </View>
        </Pressable>
        {showPicker ? (
          <DateTimePicker
            value={harvestDate}
            mode="date"
            maximumDate={new Date()}
            display={Platform.OS === 'ios' ? 'spinner' : 'default'}
            onChange={onDateChange}
          />
        ) : null}
      </View>

      {/* ── Quantité ── */}
      <View style={styles.field}>
        <AppText size="label" weight="semibold" color="muted">Quantité récoltée *</AppText>
        <NumberInput
          value={quantity}
          onChangeText={setQuantity}
          decimal
          placeholder="0"
          suffix={unit === 'KG' ? 'kg' : unit === 'SAC' ? 'sac(s)' : 'pièce(s)'}
        />
      </View>

      {/* ── Unité ── */}
      <View style={styles.field}>
        <AppText size="label" weight="semibold" color="muted">Unité</AppText>
        <View style={styles.rowWrap}>
          {UNITS.map((u) => (
            <Pressable key={u.key} onPress={() => setUnit(u.key)} accessibilityRole="button">
              <Chip label={u.label} tone="green" selected={unit === u.key} style={styles.chip} />
            </Pressable>
          ))}
        </View>
      </View>

      {/* ── Notes ── */}
      <View style={styles.field}>
        <AppText size="label" weight="semibold" color="muted">Notes (optionnel)</AppText>
        <TextInput
          value={notes}
          onChangeText={setNotes}
          placeholder="Ex : plantains mûrs, sacs de 25 kg…"
          multiline
          numberOfLines={2}
          style={styles.notesInput}
        />
      </View>

      {/* ── Action ── */}
      <View style={styles.actions}>
        <Button
          label="Enregistrer la récolte"
          tone="success"
          icon={Crop}
          onPress={() => saveMutation.mutate()}
          disabled={!canSubmit || saveMutation.isPending}
          loading={saveMutation.isPending}
        />
      </View>
      {saveMutation.isError ? (
        <AppText size="small" weight="semibold" color="danger">
          Impossible d&rsquo;enregistrer la récolte. Réessayez.
        </AppText>
      ) : null}
    </Sheet>
  );
}

/** Même jour calendaire (heure locale) ? */
function sameDay(a: Date, b: Date): boolean {
  return (
    a.getFullYear() === b.getFullYear() &&
    a.getMonth() === b.getMonth() &&
    a.getDate() === b.getDate()
  );
}

const styles = StyleSheet.create({
  field: { gap: 8 },
  rowWrap: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 6,
  },
  chip: {
    marginBottom: 0,
  },
  dateBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    backgroundColor: color.surfaceAlt,
    borderWidth: 1,
    borderColor: color.border,
    borderRadius: radii.md,
    paddingHorizontal: 10,
    paddingVertical: 8,
  },
  dateBtnPressed: { opacity: 0.82 },
  dateIcon: {
    width: 32,
    height: 32,
    borderRadius: 10,
    backgroundColor: palette.green[50],
    alignItems: 'center',
    justifyContent: 'center',
  },
  dateCol: { flex: 1, gap: 0 },
  notesInput: {
    minHeight: 64,
    textAlignVertical: 'top',
  },
  actions: { flexDirection: 'row', gap: 10, marginTop: 12 },
});