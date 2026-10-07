import React, { useState } from 'react';
import { Platform, Pressable, StyleSheet, TextInput, View } from 'react-native';
import DateTimePicker, { type DateTimePickerEvent } from '@react-native-community/datetimepicker';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { Calendar, CheckCircle2, ChevronDown, Map, Trash2 } from 'lucide-react-native';

import { Sheet } from '../ui/Sheet';
import { AppText } from '../ui/AppText';
import { Button } from '../ui/Button';
import { NumberInput } from '../ui/NumberInput';
import { Spinner } from '../ui/Spinner';
import { CulturePicker } from './CulturePicker';
import { useAuth } from '@/auth/AuthContext';
import { createParcelle, deleteParcelle, fetchCultures, updateParcelle } from '@/api';
import { invalidateFarmQueries } from '@/api/invalidate';
import type { Culture, Parcelle, ParcelleStatus } from '@/api/types';
import { PARCELLE_STATUS_LABELS, cultureStage, formatHarvestDate, waterNeedLabel } from '@/constants/agriculture';
import { color, palette, radii } from '@/constants/theme';

interface ParcelleSheetProps {
  visible: boolean;
  parcelle?: Parcelle | null;
  onClose: () => void;
}

const STATUS_ORDER: ParcelleStatus[] = ['PREPARATION', 'ACTIVE', 'JACHERE', 'CLOTURE'];

const STATUS_META: Record<ParcelleStatus, { label: string; description: string; color: string; bg: string }> = {
  PREPARATION: {
    label: PARCELLE_STATUS_LABELS.PREPARATION,
    description: 'Sol en préparation — plantation à venir.',
    color: palette.accent[600],
    bg: palette.accent[50],
  },
  ACTIVE: {
    label: PARCELLE_STATUS_LABELS.ACTIVE,
    description: 'Culture en place, le cycle est suivi.',
    color: palette.green[600],
    bg: palette.green[50],
  },
  JACHERE: {
    label: PARCELLE_STATUS_LABELS.JACHERE,
    description: 'Parcelle au repos, non cultivée.',
    color: palette.amber[600],
    bg: palette.amber[50],
  },
  CLOTURE: {
    label: PARCELLE_STATUS_LABELS.CLOTURE,
    description: 'Parcelle arrêtée ou retirée du suivi.',
    color: palette.ink[500],
    bg: palette.ink[100],
  },
};

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
  const [cultures, setCultures] = useState<Culture[]>([]);
  const [selectedCulture, setSelectedCulture] = useState<Culture | null>(null);

  // Seed the form when opening (create ou edit), et charge le référentiel.
  React.useEffect(() => {
    if (!visible) return;
    setName(parcelle?.name ?? '');
    setCultureId(parcelle?.cultureId ?? '');
    setAreaHa(parcelle?.areaHa != null ? String(parcelle.areaHa) : '');
    setStatus(parcelle?.status ?? 'ACTIVE');
    // Nouvelle parcelle : date par défaut = aujourd'hui pour que le stade s'affiche.
    setPlantedDate(parcelle?.plantedAt ? new Date(parcelle.plantedAt) : parcelle ? null : new Date());
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
        });
      }
      return createParcelle(farmId, {
        name: name.trim(),
        cultureId,
        areaHa: area,
        status,
        plantedAt: plantedDate ? plantedDate.toISOString().slice(0, 10) : undefined,
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
      {cultures.length === 0 ? (
        <Field label="Catégorie & Culture">
          <View style={styles.cultureLoading}>
            <Spinner />
          </View>
        </Field>
      ) : (
        <CulturePicker
          cultures={cultures}
          value={selectedCulture}
          onSelect={(c) => {
            setSelectedCulture(c);
            setCultureId(c ? c.id : '');
          }}
        />
      )}

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
      <Field label="Statut" hint={STATUS_META[status].description}>
        <View style={styles.statusGrid}>
          {STATUS_ORDER.map((s) => {
            const meta = STATUS_META[s];
            const active = s === status;
            return (
              <Pressable
                key={s}
                onPress={() => setStatus(s)}
                accessibilityRole="button"
                accessibilityState={{ selected: active }}
                style={[styles.statusCard, active && { borderColor: meta.color, backgroundColor: meta.bg }]}>
                <View style={[styles.statusDot, { backgroundColor: meta.color }]} />
                <AppText
                  size="small"
                  weight={active ? 'bold' : 'semibold'}
                  color={active ? 'text' : 'text'}
                  numberOfLines={1}>
                  {meta.label}
                </AppText>
                {active ? <CheckCircle2 size={14} color={meta.color} strokeWidth={2.4} /> : null}
              </Pressable>
            );
          })}
        </View>
      </Field>

      {/* ── Date de plantation ── */}
      <Field
        label="Date de plantation *"
        hint="Indispensable pour calculer le stade et suivre la culture.">
        <Pressable
          onPress={() => setShowPicker(true)}
          style={({ pressed }) => [styles.dateBtn, pressed && styles.dateBtnPressed]}
          accessibilityRole="button">
          <View style={styles.dateIcon}>
            <Calendar size={18} color={palette.green[600]} strokeWidth={2.4} />
          </View>
          <View style={styles.dateCol}>
            <AppText size="small" weight="semibold" color={plantedDate ? 'text' : 'faint'}>
              {plantedDate
                ? plantedDate.toLocaleDateString('fr-FR', { weekday: undefined, day: 'numeric', month: 'long', year: 'numeric' })
                : 'Aucune date'}
            </AppText>
            {plantedDate && sameDay(plantedDate, new Date()) ? (
              <AppText size="caption" color="brand">Aujourd’hui</AppText>
            ) : null}
          </View>
          <View pointerEvents="none">
            <ChevronDown size={16} color={color.ink[400]} strokeWidth={2.4} />
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

      {/* ── Stade estimé (calculé depuis plantedAt + cycle, lecture seule) ── */}
      {(() => {
        if (!plantedDate || !selectedCulture?.defaultCycleDays) return null;
        const iso = plantedDate.toISOString().slice(0, 10);
        const stage = cultureStage(iso, selectedCulture.defaultCycleDays);
        if (!stage) return null;
        const pct = stage.key === 'A_RECOLTER' ? 100 : Math.min(100, Math.round(stage.progress * 100));
        const water = waterNeedLabel(selectedCulture);
        return (
          <Field label="Stade estimé">
            <View style={styles.stageCard}>
              <View style={styles.stageRow}>
                <AppText size="small" weight="bold" color="brand">{stage.label}</AppText>
                <AppText size="caption" color="muted">
                  {stage.key === 'A_RECOLTER'
                    ? 'Cycle terminé — prêt à récolter'
                    : stage.daysRemaining > 0
                      ? `J-${stage.daysRemaining}`
                      : 'À récolter'}
                </AppText>
              </View>
              <View style={styles.track}>
                <View style={[styles.fill, { width: `${pct}%` }]} />
              </View>
              <View style={styles.stageRow}>
                <AppText size="caption" color="muted">
                  {stage.harvestDate
                    ? `Récolte estimée le ${formatHarvestDate(stage.harvestDate)}`
                    : 'Cycle libre'}
                </AppText>
                {water ? <AppText size="caption" color="faint">💧 {water}</AppText> : null}
              </View>
            </View>
          </Field>
        );
      })()}

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

function Field({ label, hint, children }: { label: string; hint?: string; children: React.ReactNode }) {
  return (
    <View style={styles.field}>
      <AppText size="label" weight="semibold" color="muted">{label}</AppText>
      {children}
      {hint ? (
        <AppText size="caption" color="faint">
          {hint}
        </AppText>
      ) : null}
    </View>
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
  cultureLoading: {
    backgroundColor: color.surfaceAlt,
    borderRadius: radii.md,
    paddingVertical: 12,
    alignItems: 'center',
  },
  statusGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 6,
  },
  statusCard: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    width: '48.5%',
    backgroundColor: color.surfaceAlt,
    borderWidth: 1,
    borderColor: color.border,
    borderRadius: radii.md,
    paddingHorizontal: 10,
    paddingVertical: 9,
  },
  statusDot: {
    width: 9,
    height: 9,
    borderRadius: 5,
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
  stageCard: {
    backgroundColor: color.surfaceAlt,
    borderWidth: 1,
    borderColor: color.border,
    borderRadius: radii.md,
    paddingHorizontal: 12,
    paddingVertical: 10,
    gap: 7,
  },
  stageRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 8,
  },
  track: {
    height: 6,
    borderRadius: 3,
    backgroundColor: color.border,
    overflow: 'hidden',
  },
  fill: {
    height: '100%',
    borderRadius: 3,
    backgroundColor: palette.green[600],
  },
  actions: { flexDirection: 'row', gap: 10, marginTop: 12 },
});