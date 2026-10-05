import React, { useState } from 'react';
import { Platform, Pressable, StyleSheet, TextInput as RNTextInput, View } from 'react-native';
import DateTimePicker, { type DateTimePickerEvent } from '@react-native-community/datetimepicker';
import { useMutation, useQueryClient } from '@tanstack/react-query';

import { Sheet } from './ui/Sheet';
import { AppText } from './ui/AppText';
import { Button } from './ui/Button';
import { color, palette, radii } from '@/constants/theme';
import { useAuth } from '@/auth/AuthContext';
import { createBuilding } from '@/api/mutations';
import { invalidateFarmQueries } from '@/api/invalidate';

/**
 * Densités recommandées au Gabon (fin de cycle) :
 * - Chair : 10 oiseaux/m² max (≈20-22 kg/m²), 8 en saison chaude
 * - Pondeuse : 5-6 oiseaux/m² au sol
 * - Poussins : 30-40 oiseaux/m² les premiers jours (à élargir progressivement)
 *
 * Règle d'or : ne jamais dépasser 20-25 kg de viande/m² en zone tropicale.
 */
const DENSITY_CHAIR = 10;
const DENSITY_CHAIR_HOT = 8;
const DENSITY_PONDEUSE = 6;
const DENSITY_POUSSEINS = 35;

const KG_TARGET_CHAIR = 2.0; // kg poids vif en fin de cycle

interface CreateBuildingSheetProps {
  visible: boolean;
  onClose: () => void;
}

export function CreateBuildingSheet({ visible, onClose }: CreateBuildingSheetProps) {
  const { farmId } = useAuth();
  const qc = useQueryClient();

  const [name, setName] = useState('');
  const [area, setArea] = useState('');
  const [selectedType, setSelectedType] = useState<'CHAIR' | 'PONDEUSE'>('CHAIR');
  const [lastVideDate, setLastVideDate] = useState<Date | null>(null);
  const [showVidePicker, setShowVidePicker] = useState(false);

  // Auto-calculated capacities from surface
  const areaNum = parseFloat(area) || 0;
  const capacityChair = areaNum > 0 ? Math.round(areaNum * DENSITY_CHAIR) : 0;
  const capacityPondeuse = areaNum > 0 ? Math.round(areaNum * DENSITY_PONDEUSE) : 0;

  // Suggested capacity based on type
  const effectiveCapacity = selectedType === 'CHAIR' ? capacityChair : capacityPondeuse;

  // Actual density check
  const density = areaNum > 0 && effectiveCapacity > 0
    ? effectiveCapacity / areaNum
    : null;

  // Check density level based on selected type
  const maxDensity = selectedType === 'CHAIR' ? DENSITY_CHAIR : DENSITY_PONDEUSE;
  const densityLevel = density != null
    ? density > maxDensity * 1.8 ? 'critical'
      : density > maxDensity * 1.2 ? 'warn'
        : 'ok'
    : null;

  // kg/m² estimation for Chair
  const kgPerM2 = selectedType === 'CHAIR' && density != null
    ? density * KG_TARGET_CHAIR
    : null;
  const kgPerM2Level = kgPerM2 != null
    ? kgPerM2 > 25 ? 'critical'
      : kgPerM2 > 20 ? 'warn'
        : 'ok'
    : null;

  const createMutation = useMutation({
    mutationFn: () => {
      return createBuilding(farmId, {
        name: name.trim(),
        buildingAreaM2: areaNum > 0 ? areaNum : undefined,
        capacity: effectiveCapacity > 0 ? effectiveCapacity : undefined,
        lastVideSanitaireAt: lastVideDate ? lastVideDate.toISOString().slice(0, 10) : undefined,
      });
    },
    onSuccess: () => {
      invalidateFarmQueries(qc, { farmId });
      resetForm();
      onClose();
    },
  });

  const resetForm = () => {
    setName('');
    setArea('');
    setSelectedType('CHAIR');
    setLastVideDate(null);
  };

  const canSubmit = name.trim().length > 0;

  const onVideDateChange = (_event: DateTimePickerEvent, date?: Date) => {
    if (Platform.OS === 'android') setShowVidePicker(false);
    if (date) setLastVideDate(date);
  };

  return (
    <Sheet
      visible={visible}
      title='Ajouter un bâtiment'
      subtitle="Site d'élevage — suivi densité & vide sanitaire"
      onClose={onClose}>
      {/* ── Nom ── */}
      <Field label='Nom du bâtiment *'>
        <TextInput
          value={name}
          onChangeText={setName}
          placeholder='Ex : Bâtiment A'
        />
      </Field>

      {/* ── Surface ── */}
      <Field label='Surface (m²)'>
        <TextInput
          value={area}
          onChangeText={setArea}
          placeholder='Ex : 150'
          keyboardType='numeric'
        />
      </Field>

      {/* ── Type d'élevage prévu ── */}
      {areaNum > 0 && (
        <Field label="Type d'élevage prévu">
          <View style={styles.typeRow}>
            {(['CHAIR', 'PONDEUSE'] as const).map((t) => (
              <Pressable
                key={t}
                onPress={() => setSelectedType(t)}
                style={[styles.typeBtn, selectedType === t && styles.typeBtnActive]}>
                <AppText size='small' weight={selectedType === t ? 'bold' : 'medium'} color={selectedType === t ? 'surface' : 'muted'}>
                  {t === 'CHAIR' ? '🐔 Chair' : '🥚 Pondeuse'}
                </AppText>
              </Pressable>
            ))}
          </View>
        </Field>
      )}

      {/* ── Capacité auto-calculée ── */}
      {areaNum > 0 && (
        <View style={styles.capacityCard}>
          <AppText size='small' weight='bold' color='ink'>Capacité recommandée</AppText>

          {/* Capacity value */}
          <View style={styles.capacityValue}>
            <AppText size='h2' weight='bold' color='brand'>
              {effectiveCapacity.toLocaleString('fr-FR')}
            </AppText>
            <AppText size='body' color='muted'>oiseaux</AppText>
          </View>

          {/* Rule explanation */}
          <AppText size='small' color='faint'>
            {selectedType === 'CHAIR'
              ? `Norme Gabon : ${DENSITY_CHAIR} oiseaux/m² (fin de cycle) × ${areaNum} m²`
              : `Norme Gabon : ${DENSITY_PONDEUSE} oiseaux/m² (au sol) × ${areaNum} m²`}
          </AppText>

          {/* ── Standards table ── */}
          <View style={styles.standardsTable}>
            <View style={styles.standardsRow}>
              <AppText size='small' weight='semibold' color='muted' style={{ flex: 1 }}>Phase</AppText>
              <AppText size='small' weight='semibold' color='muted' style={{ flex: 1, textAlign: 'right' }}>Densité</AppText>
              <AppText size='small' weight='semibold' color='muted' style={{ flex: 1, textAlign: 'right' }}>Capacité</AppText>
            </View>
            {selectedType === 'CHAIR' ? (
              <>
                <StandardsRow label='Poussins (début)' density={DENSITY_POUSSEINS} area={areaNum} highlight={false} />
                <StandardsRow label='Chair (normal)' density={DENSITY_CHAIR} area={areaNum} highlight={true} />
                <StandardsRow label='Chair (saison chaude)' density={DENSITY_CHAIR_HOT} area={areaNum} highlight={false} />
              </>
            ) : (
              <>
                <StandardsRow label='Poussins (début)' density={DENSITY_POUSSEINS} area={areaNum} highlight={false} />
                <StandardsRow label='Pondeuse (au sol)' density={DENSITY_PONDEUSE} area={areaNum} highlight={true} />
              </>
            )}
          </View>

          {/* ── kg/m² estimation (Chair only) ── */}
          {selectedType === 'CHAIR' && kgPerM2 != null && (
            <View style={styles.kgRow}>
              <AppText size='small' color='faint'>Poids estimé/m² (fin cycle) : </AppText>
              <AppText size='small' weight='bold' color={
                kgPerM2Level === 'critical' ? palette.red[600]
                  : kgPerM2Level === 'warn' ? palette.amber[600]
                    : palette.green[600]
              }>
                {kgPerM2.toFixed(1)} kg/m²
              </AppText>
            </View>
          )}

          {/* ── Density advisory ── */}
          {densityLevel === 'warn' && (
            <View style={[styles.advisory, styles.advisoryWarn]}>
              <AppText size='small' weight='semibold' color={palette.amber[600]}>
                ⚠ Densité {density!.toFixed(1)} oiseaux/m² — seuil d&apos;alerte
              </AppText>
              <AppText size='small' color={palette.amber[700]}>
                {selectedType === 'CHAIR'
                  ? `La norme Chair recommande <= ${DENSITY_CHAIR} oiseaux/m². Surveillez ventilation et litière.`
                  : `La norme Pondeuse recommande <= ${DENSITY_PONDEUSE} oiseaux/m². Espace au sol insuffisant.`}
              </AppText>
            </View>
          )}
          {densityLevel === 'critical' && (
            <View style={[styles.advisory, styles.advisoryCritical]}>
              <AppText size='small' weight='semibold' color={palette.red[600]}>
                🔴 Densité {density!.toFixed(1)} oiseaux/m² — seuil critique
              </AppText>
              <AppText size='small' color={palette.red[700]}>
                Risque sanitaire et de stress thermique élevé en zone tropicale. Réduisez le cheptel ou augmentez la surface.
              </AppText>
            </View>
          )}
          {kgPerM2Level === 'critical' && (
            <View style={[styles.advisory, styles.advisoryCritical]}>
              <AppText size='small' weight='semibold' color={palette.red[600]}>
                🔴 {kgPerM2!.toFixed(1)} kg/m² — dépasse le standard tropical
              </AppText>
              <AppText size='small' color={palette.red[700]}>
                En zone tropicale (Gabon), ne jamais dépasser 20-25 kg de viande/m² en fin d&apos;élevage.
              </AppText>
            </View>
          )}
        </View>
      )}

      {/* ── Dernier vide sanitaire ── */}
      <Field label='Dernier vide sanitaire'>
        <Pressable onPress={() => setShowVidePicker(true)} style={styles.dateBtn}>
          <AppText size='body' color={lastVideDate ? 'text' : 'faint'}>
            {lastVideDate
              ? lastVideDate.toLocaleDateString('fr-FR', { day: 'numeric', month: 'long', year: 'numeric' })
              : 'Sélectionner...'}
          </AppText>
        </Pressable>
        {showVidePicker && (
          <DateTimePicker
            value={lastVideDate ?? new Date()}
            mode='date'
            display={Platform.OS === 'ios' ? 'spinner' : 'default'}
            onChange={onVideDateChange}
            maximumDate={new Date()}
            locale='fr-FR'
          />
        )}
      </Field>

      {createMutation.isError && (
        <AppText size='small' color='danger'>
          {(createMutation.error as Error).message ?? 'Erreur lors de la création'}
        </AppText>
      )}
      <Button
        label={createMutation.isPending ? 'Création…' : 'Créer le bâtiment'}
        tone='brand'
        onPress={() => createMutation.mutate()}
        disabled={!canSubmit || createMutation.isPending}
      />
    </Sheet>
  );
}

function StandardsRow({ label, density, area, highlight }: {
  label: string;
  density: number;
  area: number;
  highlight: boolean;
}) {
  const capacity = Math.round(area * density);
  return (
    <View style={[styles.standardsRow, highlight && styles.standardsRowHighlight]}>
      <AppText size='small' color={highlight ? 'brand' : 'faint'} style={{ flex: 1 }}>
        {label}
      </AppText>
      <AppText size='small' color={highlight ? 'brand' : 'faint'} style={{ flex: 1, textAlign: 'right' }}>
        {density}/m²
      </AppText>
      <AppText size='small' weight={highlight ? 'bold' : 'medium'} color={highlight ? 'brand' : 'faint'} style={{ flex: 1, textAlign: 'right' }}>
        {capacity.toLocaleString('fr-FR')}
      </AppText>
    </View>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <View style={styles.field}>
      <AppText size='small' weight='bold' color='ink'>{label}</AppText>
      {children}
    </View>
  );
}

function TextInput({ value, onChangeText, placeholder, keyboardType }: {
  value: string;
  onChangeText: (t: string) => void;
  placeholder?: string;
  keyboardType?: 'default' | 'numeric';
}) {
  const [focused, setFocused] = useState(false);
  return (
    <View style={[styles.inputWrap, focused && styles.inputWrapFocused]}>
      <RNTextInput
        value={value}
        onChangeText={onChangeText}
        placeholder={placeholder}
        placeholderTextColor={color.ink[300]}
        keyboardType={keyboardType}
        style={styles.input}
        onFocus={() => setFocused(true)}
        onBlur={() => setFocused(false)}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  dateBtn: {
    paddingVertical: 12,
    paddingHorizontal: 14,
    borderRadius: radii.md,
    backgroundColor: palette.surface,
    borderWidth: 1.5,
    borderColor: color.border,
  },
  field: {
    gap: 6,
  },
  inputWrap: {
    borderWidth: 1.5,
    borderColor: color.border,
    borderRadius: radii.md,
    backgroundColor: palette.surface,
  },
  inputWrapFocused: {
    borderColor: palette.brand[500],
    backgroundColor: palette.surface,
  },
  input: {
    paddingHorizontal: 14,
    paddingVertical: 12,
    fontSize: 16,
    color: color.ink[900],
  },
  /* ── Type selector ── */
  typeRow: {
    flexDirection: 'row',
    gap: 8,
  },
  typeBtn: {
    flex: 1,
    paddingVertical: 10,
    alignItems: 'center',
    borderRadius: radii.md,
    backgroundColor: palette.surfaceAlt,
    borderWidth: 1.5,
    borderColor: color.border,
  },
  typeBtnActive: {
    backgroundColor: palette.brand[600],
    borderColor: palette.brand[600],
  },
  /* ── Capacity card ── */
  capacityCard: {
    backgroundColor: palette.brand[50],
    borderWidth: 1,
    borderColor: palette.brand[100],
    borderRadius: radii.lg,
    padding: 14,
    gap: 8,
  },
  capacityValue: {
    flexDirection: 'row',
    alignItems: 'baseline',
    gap: 6,
  },
  /* ── Standards table ── */
  standardsTable: {
    gap: 4,
    marginTop: 4,
  },
  standardsRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 4,
    paddingHorizontal: 6,
    borderRadius: 6,
  },
  standardsRowHighlight: {
    backgroundColor: palette.brand[100],
  },
  kgRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginTop: 4,
  },
  /* ── Advisory ── */
  advisory: {
    borderRadius: radii.md,
    padding: 10,
    gap: 4,
    marginTop: 4,
  },
  advisoryWarn: {
    backgroundColor: palette.amber[50],
    borderWidth: 1,
    borderColor: palette.amber[200],
  },
  advisoryCritical: {
    backgroundColor: palette.red[50],
    borderWidth: 1,
    borderColor: palette.red[200],
  },
});
