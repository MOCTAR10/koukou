import React, { useMemo, useState } from 'react';
import { Platform, Pressable, StyleSheet, TextInput, View } from 'react-native';
import DateTimePicker, { type DateTimePickerEvent } from '@react-native-community/datetimepicker';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { Calendar, Map, Trash2 } from 'lucide-react-native';

import { Sheet } from '../ui/Sheet';
import { AppText } from '../ui/AppText';
import { Button } from '../ui/Button';
import { NumberInput } from '../ui/NumberInput';
import { Segmented } from '../ui/Segmented';
import { Spinner } from '../ui/Spinner';
import { useAuth } from '@/auth/AuthContext';
import { createParcelle, deleteParcelle, fetchCultures, updateParcelle } from '@/api';
import { invalidateFarmQueries } from '@/api/invalidate';
import type { Culture, Parcelle, ParcelleStatus } from '@/api/types';
import {
  CROP_CATEGORY_LABELS,
  CULTURE_EMOJI,
  groupCulturesByCategory,
  PARCELLE_STATUS_LABELS,
} from '@/constants/agriculture';
import { color, palette, radii } from '@/constants/theme';

interface ParcelleSheetProps {
  visible: boolean;
  parcelle?: Parcelle | null;
  onClose: () => void;
}

const STATUS_ORDER: ParcelleStatus[] = ['PREPARATION', 'ACTIVE', 'JACHERE', 'CLOTURE'];

export function ParcelleSheet({ visible, parcelle, onClose }: ParcelleSheetProps) {
  const qc = useQueryClient();
  const { farmId } = useAuth();
  const editing = Boolean(parcelle);

  const [name, setName] = useState('');
  const [cultureId, setCultureId] = useState('');
  const [areaHa, setAreaHa] = useState('');
  const [status, setStatus] = useState<ParcelleStatus>('ACTIVE');
  const [plantedDate, setPlantedDate] = useState<Date | null>(null);
  const [showPicker, setShowPicker] = useState(false);
  const [notes, setNotes] = useState('');
  const [cultures, setCultures] = useState<Culture[]>([]);
  const [selectedCulture, setSelectedCulture] = useState<Culture | null>(null);

  // Seed the form when opening (create ou edit), et charge le référentiel.
  React.useEffect(() => {
    if (!visible) return;
    setName(parcelle?.name ?? '');
    setCultureId(parcelle?.cultureId ?? '');
    setAreaHa(parcelle?.areaHa != null ? String(parcelle.areaHa) : '');
    setStatus(parcelle?.status ?? 'ACTIVE');
    setPlantedDate(parcelle?.plantedAt ? new Date(parcelle.plantedAt) : null);
    setNotes(parcelle?.notes ?? '');
    let cancelled = false;
    fetchCultures()
      .then((list) => {
        if (cancelled) return;
        setCultures(list);
        setSelectedCulture(parcelle ? (list.find((c) => c.id === parcelle.cultureId) ?? null) : null);
      })
      .catch(() => {});
    return () => {
      cancelled = true;
    };
  }, [visible, parcelle]);

  const groups = useMemo(() => groupCulturesByCategory(cultures), [cultures]);

  const pickCulture = (c: Culture) => {
    setCultureId(c.id);
    setSelectedCulture(c);
  };

  const saveMutation = useMutation({
    mutationFn: () => {
      const area = areaHa.trim() ? parseFloat(areaHa.replace(',', '.')) : undefined;
      if (editing && parcelle) {
        return updateParcelle(farmId, parcelle.id, {
          name: name.trim() || parcelle.name,
          cultureId: cultureId || parcelle.cultureId,
          areaHa: area,
          status,
          plantedAt: plantedDate ? plantedDate.toISOString().slice(0, 10) : null,
          notes: notes.trim() ? notes : null,
        });
      }
      return createParcelle(farmId, {
        name: name.trim(),
        cultureId,
        areaHa: area,
        status,
        plantedAt: plantedDate ? plantedDate.toISOString().slice(0, 10) : undefined,
        notes: notes.trim() ? notes : undefined,
      });
    },
    onSuccess: () => {
      invalidateFarmQueries(qc, { farmId });
      qc.invalidateQueries({ queryKey: ['parcelles', farmId] });
      onClose();
    },
  });

  const deleteMutation = useMutation({
    mutationFn: () => (parcelle ? deleteParcelle(farmId, parcelle.id) : Promise.resolve({ deleted: true })),
    onSuccess: () => {
      invalidateFarmQueries(qc, { farmId });
      qc.invalidateQueries({ queryKey: ['parcelles', farmId] });
      onClose();
    },
  });

  const canSubmit = name.trim().length > 0 && (Boolean(cultureId) || Boolean(parcelle));
  const busy = saveMutation.isPending || deleteMutation.isPending;

  const onDateChange = (_event: DateTimePickerEvent, date?: Date) => {
    if (Platform.OS === 'android') setShowPicker(false);
    if (date) setPlantedDate(date);
  };

  return (
    <Sheet
      visible={visible}
      title={editing ? 'Modifier la parcelle' : 'Nouvelle parcelle'}
      subtitle={editing ? parcelle?.name : "Ajoutez une parcelle et choisissez sa culture"}
      accentColor={palette.green[600]}
      onClose={onClose}>
      {/* ── Nom ── */}
      <Field label="Nom de la parcelle *">
        <TextInput
          value={name}
          onChangeText={setName}
          placeholder="Ex : Champ de plantain"
        />
      </Field>

      {/* ── Culture ── */}
      <Field label={selectedCulture ? 'Culture' : 'Culture *'}>
        {selectedCulture ? (
          <View style={styles.cultureSelected}>
            <View style={styles.cultureChip}>
              <AppText style={{ fontSize: 15 }}>{CULTURE_EMOJI[selectedCulture.category]}</AppText>
              <AppText size="small" weight="semibold" color="text">{selectedCulture.name}</AppText>
              <AppText size="caption" color="muted">{CROP_CATEGORY_LABELS[selectedCulture.category]}</AppText>
            </View>
            <Pressable onPress={() => { setSelectedCulture(null); setCultureId(''); }} hitSlop={8} accessibilityRole="button">
              <AppText size="small" weight="semibold" color="brand">Changer</AppText>
            </Pressable>
          </View>
        ) : (
          <View style={styles.cultureGrid}>
            {groups.length === 0 ? (
              <Spinner />
            ) : groups.map((g) => (
              <View key={g.category} style={styles.cultureGroup}>
                <AppText size="caption" weight="bold" color="muted">
                  {CULTURE_EMOJI[g.category]} {g.label}
                </AppText>
                <View style={styles.cultureChips}>
                  {g.cultures.map((c) => (
                    <Pressable
                      key={c.id}
                      onPress={() => pickCulture(c)}
                      style={[styles.cultureChip, cultureId === c.id && styles.cultureChipActive]}>
                      <AppText size="small" weight={cultureId === c.id ? 'bold' : 'medium'}
                        color={cultureId === c.id ? 'surface' : 'text'}>
                        {c.name}
                      </AppText>
                    </Pressable>
                  ))}
                </View>
              </View>
            ))}
          </View>
        )}
      </Field>

      {/* ── Surface (ha) ── */}
      <Field label="Surface">
        <NumberInput
          value={areaHa}
          onChangeText={setAreaHa}
          suffix="ha"
          decimal
          placeholder="0,00"
        />
        <AppText size="caption" color="faint">
          {fmtHaToM2(areaHa)}
        </AppText>
      </Field>

      {/* ── Note monoculture ── */}
      <View style={styles.monoNote}>
        <AppText style={{ fontSize: 13 }}>🌾</AppText>
        <AppText size="small" color="muted" style={{ flex: 1 }}>
          Une parcelle porte une seule culture (modèle parcellaire classique). Pour plusieurs
          cultures, créez plusieurs parcelles.
        </AppText>
      </View>

      {/* ── Statut ── */}
      <Field label="Statut">
        <Segmented<ParcelleStatus>
          value={status}
          onChange={setStatus}
          options={STATUS_ORDER.map((s) => ({
            key: s,
            label: s === 'ACTIVE' ? 'Active' : s === 'JACHERE' ? 'Jachère' : s === 'PREPARATION' ? 'Prépar.' : 'Clôt.',
          }))}
        />
        <AppText size="caption" color="faint" style={{ marginTop: 6 }}>
          {PARCELLE_STATUS_LABELS[status]}
        </AppText>
      </Field>

      {/* ── Date de plantation ── */}
      <Field label="Date de plantation">
        <Pressable
          onPress={() => setShowPicker(true)}
          style={styles.dateBtn}
          accessibilityRole="button">
          <View style={styles.dateRow}>
            <Calendar size={15} color={color.brand[600]} />
            <AppText size="small" color={plantedDate ? 'text' : 'faint'}>
              {plantedDate ? plantedDate.toLocaleDateString('fr-FR') : 'Aujourd’hui'}
            </AppText>
          </View>
        </Pressable>
        {showPicker && (
          <DateTimePicker
            value={plantedDate ?? new Date()}
            mode="date"
            display={Platform.OS === 'ios' ? 'spinner' : 'default'}
            onChange={onDateChange}
          />
        )}
      </Field>

      {/* ── Notes ── */}
      <Field label="Notes">
        <TextInput
          value={notes}
          onChangeText={setNotes}
          placeholder="Rotation, intrants, repères…"
          multiline
          style={{ minHeight: 56 }}
        />
      </Field>

      {/* ── Actions ── */}
      <View style={styles.actions}>
        {editing && parcelle && (
          <Button
            label="Supprimer"
            tone="ghost"
            icon={Trash2}
            onPress={() => deleteMutation.mutate()}
            disabled={busy}
            size="md"
          />
        )}
        <Button
          label={editing ? 'Enregistrer' : 'Ajouter la parcelle'}
          tone="success"
          icon={editing ? undefined : Map}
          onPress={() => saveMutation.mutate()}
          disabled={!canSubmit || busy}
          loading={busy}
        />
      </View>
    </Sheet>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <View style={styles.field}>
      <AppText size="label" weight="semibold" color="muted">{label}</AppText>
      {children}
    </View>
  );
}

/** Convertit la surface saisie en hectares → libellé ha + m² (ex. « 1,5 ha = 15 000 m² »). */
function fmtHaToM2(raw: string): string {
  const v = parseFloat(raw.replace(',', '.'));
  if (!Number.isFinite(v) || v <= 0) return '≈ 0 m²';
  return `≈ ${(v * 10_000).toLocaleString('fr-FR', { maximumFractionDigits: 0 })} m²`;
}

const styles = StyleSheet.create({
  field: { gap: 8 },
  monoNote: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    backgroundColor: color.surfaceAlt,
    borderRadius: radii.md,
    paddingHorizontal: 10,
    paddingVertical: 8,
  },
  cultureSelected: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 8,
  },
  cultureChip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    backgroundColor: color.green[50],
    borderColor: color.green[200],
    borderWidth: 1,
    borderRadius: radii.md,
    paddingHorizontal: 10,
    paddingVertical: 7,
  },
  cultureGrid: { gap: 10 },
  cultureGroup: { gap: 6 },
  cultureChips: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 6,
  },
  cultureChipActive: {
    backgroundColor: palette.green[600],
  },
  dateBtn: {
    backgroundColor: color.surfaceAlt,
    borderRadius: radii.md,
    paddingHorizontal: 12,
    paddingVertical: 10,
  },
  dateRow: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  actions: { flexDirection: 'row', gap: 10 },
});