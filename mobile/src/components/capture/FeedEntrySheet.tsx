import React, { useMemo, useState } from 'react';
import {
  Modal,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  TextInput,
  View,
  type StyleProp,
  type ViewStyle,
} from 'react-native';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import * as Haptics from 'expo-haptics';
import DateTimePicker, { type DateTimePickerEvent } from '@react-native-community/datetimepicker';
import {
  AlertTriangle,
  Box,
  Calendar,
  Check,
  ChevronDown,
  PackageOpen,
  Pill,
  Scale,
  Truck,
  Wheat,
  X,
  type LucideIcon,
} from 'lucide-react-native';

import { AppText } from '../ui/AppText';
import { Button } from '../ui/Button';
import { Chip } from '../ui/Chip';
import { useAuth } from '@/auth/AuthContext';
import { fetchFeedStock } from '@/api';
import { invalidateFarmQueries } from '@/api/invalidate';
import { FEED_ENTRY_TYPE_LABELS, FEED_PHASE_LABELS } from '@/api/format';
import { todayStr, type CreateInputLotInput } from '@/api/mutations';
import type { FeedEntryType, FeedPhase, FeedTypeStock } from '@/api/types';
import { createFeedInputQueued } from '@/offline';
import { color, palette, radii, spacing } from '@/constants/theme';
import { FEED_STOCK_CRITICAL_DAYS, FEED_STOCK_WARN_DAYS } from '@/constants/stock';

interface FeedEntrySheetProps {
  onClose: () => void;
}

const ENTRY_TYPES: FeedEntryType[] = ['BULKER', 'BAG', 'MEDICAMENT', 'MATIERE_PREMIERE'];

const ENTRY_ICONS: Record<FeedEntryType, LucideIcon> = {
  BULKER: Truck,
  BAG: PackageOpen,
  MEDICAMENT: Pill,
  MATIERE_PREMIERE: Box,
};

const ENTRY_DESC: Record<FeedEntryType, string> = {
  BULKER: 'Vrac livré en camion, facturé au kilotonnage',
  BAG: 'Sacs de provende, taille et prix par sac',
  MEDICAMENT: 'Médicament ou additif, tracé FEFO',
  MATIERE_PREMIERE: 'Matière première en tonnage (maïs, tourteau…)',
};

const FEED_PHASES: FeedPhase[] = [
  'POUSSIN',
  'DEMARRAGE',
  'CROISSANCE',
  'PRE_PONTE',
  'PONTE_PHASE_1',
  'PONTE_PHASE_2',
  'PONTE_PHASE_3',
  'FINITION',
  'PERSONNALISE',
];

const BAG_SIZES = [10, 25, 40, 50];

const PRINCIPES_ACTIFS = [
  { id: 'vitAD3E', label: 'Vitamine AD3E' },
  { id: 'vitA', label: 'Vitamine A' },
  { id: 'vitD3', label: 'Vitamine D3' },
  { id: 'vitE', label: 'Vitamine E' },
  { id: 'vitK3', label: 'Vitamine K3' },
  { id: 'vitB', label: 'Vitamine B-complexe' },
  { id: 'oxytetracycline', label: 'Oxytetracycline' },
  { id: 'colistine', label: 'Colistine' },
  { id: 'enrofloxacine', label: 'Enrofloxacine' },
  { id: 'florfenicol', label: 'Florfenicol' },
  { id: 'avilamycine', label: 'Avilamycine' },
  { id: 'tylosine', label: 'Tylosine' },
  { id: 'salinomycine', label: 'Salinomycine' },
  { id: 'maduramycine', label: 'Maduramycine' },
  { id: 'diclazuril', label: 'Diclazuril' },
  { id: 'toltrazuril', label: 'Toltrazuril' },
  { id: 'monensine', label: 'Monensine' },
  { id: 'lasalocide', label: 'Lasalocide' },
  { id: 'phytase', label: 'Phytase' },
  { id: 'xylanase', label: 'Xylanase' },
  { id: 'betaGlucanase', label: 'Bêta-glucanase' },
  { id: 'protease', label: 'Protéase' },
  { id: 'amylase', label: 'Amylase' },
  { id: 'lactobacillus', label: 'Lactobacillus' },
  { id: 'saccharomyces', label: 'Saccharomyces' },
  { id: 'fos', label: 'FOS (fructo-oligosaccharides)' },
  { id: 'mos', label: 'MOS (manno-oligosaccharides)' },
  { id: 'ethoxyquine', label: 'Éthoxyquine' },
  { id: 'bht', label: 'BHT' },
  { id: 'astaxanthine', label: 'Astaxanthine' },
  { id: 'xanthophylle', label: 'Xanthophylle' },
  { id: 'acideFormique', label: 'Acide formique' },
  { id: 'acidePropionique', label: 'Acide propionique' },
  { id: 'acideBenzoique', label: 'Acide benzoïque' },
  { id: 'charbonActif', label: 'Charbon actif' },
  { id: 'silice', label: 'Silice / anti-poussière' },
  { id: '__custom', label: 'Autre (personnalisé…)' },
];

const DOSE_UNITS = [
  { id: 'sachet', label: 'Sachet' },
  { id: 'litre', label: 'Litre (L)' },
  { id: 'kg', label: 'Kilogramme (kg)' },
  { id: 'g', label: 'Gramme (g)' },
  { id: 'mg', label: 'Milligramme (mg)' },
  { id: 'ml', label: 'Millilitre (mL)' },
  { id: 'comprime', label: 'Comprimé' },
  { id: 'dose', label: 'Dose unitaire' },
  { id: '__custom', label: 'Autre (personnalisé…)' },
];

const MATIERES_PREMIERES = [
  { id: 'mais', label: 'Maïs' },
  { id: 'soja', label: 'Soja (graine)' },
  { id: 'tourteauSoja', label: 'Tourteau de soja' },
  { id: 'tourteauArachide', label: 'Tourteau d’arachide' },
  { id: 'tourteauCoton', label: 'Tourteau de coton' },
  { id: 'tourteauPalmiste', label: 'Tourteau de palmiste' },
  { id: 'farinePoisson', label: 'Farine de poisson' },
  { id: 'sonBle', label: 'Son de blé' },
  { id: 'manioc', label: 'Manioc / farine de manioc' },
  { id: 'huilePalme', label: 'Huile de palme' },
  { id: 'sel', label: 'Sel' },
  { id: 'coquilleHuitre', label: 'Coquille d’huître' },
  { id: 'phosphate', label: 'Phosphate' },
  { id: 'melasse', label: 'Mélasse' },
  { id: 'levure', label: 'Levure' },
  { id: 'grit', label: 'Grit' },
  { id: 'avocat', label: 'Avocat' },
  { id: '__custom', label: 'Autre (personnalisé…)' },
];

interface FieldProps {
  label: string;
  value: string;
  onChangeText: (t: string) => void;
  placeholder?: string;
  keyboardType?: 'number-pad' | 'default';
  suffix?: string;
  prefix?: string;
  autoCapitalize?: 'none' | 'sentences' | 'words' | 'characters';
  editable?: boolean;
  style?: StyleProp<ViewStyle>;
}

function Field({
  label,
  value,
  onChangeText,
  placeholder,
  keyboardType = 'default',
  suffix,
  prefix,
  autoCapitalize,
  editable = true,
  style,
}: FieldProps) {
  return (
    <View style={[styles.field, style]}>
      <AppText size="label" color="muted">
        {label}
      </AppText>
      <View style={styles.inputWrap}>
        {prefix ? (
          <AppText size="bodyM" color="faint">
            {prefix}
          </AppText>
        ) : null}
        <TextInput
          value={value}
          onChangeText={onChangeText}
          placeholder={placeholder}
          placeholderTextColor={color.ink[300]}
          keyboardType={keyboardType}
          autoCapitalize={autoCapitalize}
          editable={editable}
          style={styles.input}
        />
        {suffix ? (
          <AppText size="caption" color="faint">
            {suffix}
          </AppText>
        ) : null}
      </View>
    </View>
  );
}

function SectionTitle({ icon: Icon, title }: { icon: LucideIcon; title: string }) {
  return (
    <View style={styles.sectionTitleRow}>
      <View style={styles.sectionTitleIcon}>
        <Icon size={18} color={color.accent[500]} strokeWidth={2.4} />
      </View>
      <AppText size="bodyM" weight="bold" color="text">
        {title}
      </AppText>
    </View>
  );
}

export function FeedEntrySheet({ onClose }: FeedEntrySheetProps) {
  const { farmId } = useAuth();
  const queryClient = useQueryClient();

  const feedStock = useQuery({
    queryKey: ['feed-stock', farmId],
    queryFn: () => fetchFeedStock(farmId),
    enabled: !!farmId,
  });
  const stockByPhase: FeedTypeStock[] = feedStock.data?.byType ?? [];

  const advisoryFor = (phase: FeedPhase | null): { level: 'ok' | 'warn' | 'crit'; text: string } | null => {
    if (!phase) return null;
    const row = stockByPhase.find((s) => s.feedPhase === phase);
    if (!row) return null;
    if (row.autonomyDays !== null && row.autonomyDays < FEED_STOCK_CRITICAL_DAYS) {
      return {
        level: 'crit',
        text: `Stock critique : ${Math.round(row.autonomyDays)} j restants sur ${FEED_PHASE_LABELS[phase]} — prévoyez un réapprovisionnement.`,
      };
    }
    if (row.autonomyDays !== null && row.autonomyDays < FEED_STOCK_WARN_DAYS) {
      return {
        level: 'warn',
        text: `Stock faible : ${Math.round(row.autonomyDays)} j restants sur ${FEED_PHASE_LABELS[phase]}.`,
      };
    }
    return {
      level: 'ok',
      text: `Disponible sur ${FEED_PHASE_LABELS[phase]} : ${Math.round(row.availableKg)} kg.`,
    };
  };

  const [entryType, setEntryType] = useState<FeedEntryType>('BAG');
  const [feedPhase, setFeedPhase] = useState<FeedPhase>('DEMARRAGE');
  const [customFeedPhaseName, setCustomFeedPhaseName] = useState('');

  const [productName, setProductName] = useState('');
  const [supplier, setSupplier] = useState('');
  const [supplierLotNumber, setSupplierLotNumber] = useState('');
  const [expirationDate, setExpirationDate] = useState('');
  const [showExpiryPicker, setShowExpiryPicker] = useState(false);

  // Quantités saisies au clavier numérique (plus simple que des steppers).
  const [tonnageMt, setTonnageMt] = useState('');
  const [costPerMtFcfa, setCostPerMtFcfa] = useState('');
  const [numberOfBags, setNumberOfBags] = useState('');
  const [bagSizeKg, setBagSizeKg] = useState<number | null>(null);
  const [unitPriceFcfa, setUnitPriceFcfa] = useState('');
  const [additiveName, setAdditiveName] = useState('');
  const [doseQuantity, setDoseQuantity] = useState('');
  const [doseUnit, setDoseUnit] = useState('');
  const [showPrincipePicker, setShowPrincipePicker] = useState(false);
  const [showDoseUnitPicker, setShowDoseUnitPicker] = useState(false);
  const [principeCustom, setPrincipeCustom] = useState(false);
  const [doseUnitCustom, setDoseUnitCustom] = useState(false);
  const [showProduitPicker, setShowProduitPicker] = useState(false);
  const [produitCustom, setProduitCustom] = useState(false);
  const [totalCostFcfa, setTotalCostFcfa] = useState('');
  const [notes, setNotes] = useState('');

  const [saved, setSaved] = useState(false);
  const [queued, setQueued] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const showPhase = entryType === 'BULKER' || entryType === 'BAG';

  const changeEntryType = (t: FeedEntryType) => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light).catch(() => {});
    setEntryType(t);
    setError(null);
  };

  const onExpiryChange = (_event: DateTimePickerEvent, date?: Date) => {
    if (Platform.OS === 'android') setShowExpiryPicker(false);
    if (date) {
      setExpirationDate(date.toISOString().slice(0, 10));
    }
  };

  const fmtExpiry = () => {
    if (!expirationDate) return 'Sélectionner une date…';
    const d = new Date(expirationDate + 'T00:00:00');
    return d.toLocaleDateString('fr-FR', { day: 'numeric', month: 'short', year: 'numeric' });
  };

  const clearExpiry = () => {
    Haptics.selectionAsync().catch(() => {});
    setExpirationDate('');
    setShowExpiryPicker(false);
  };

  // Nettoie une saisie numérique : chiffres + éventuelle virgule/décimale.
  const numeric = (raw: string, allowDecimal = true) => {
    const v = raw.replace(/[^0-9.,]/g, '');
    if (!allowDecimal) return v.replace(/[.,]/g, '');
    return v;
  };

  const parse = (raw: string): number => {
    const n = Number(raw.replace(/,/g, '.'));
    return Number.isFinite(n) ? n : 0;
  };

  const canSave = useMemo(() => {
    if (productName.trim() === '' || supplier.trim() === '' || supplierLotNumber.trim() === '') {
      return false;
    }
    if (entryType === 'BULKER') return parse(tonnageMt) > 0;
    if (entryType === 'BAG') return parse(numberOfBags) > 0;
    if (entryType === 'MATIERE_PREMIERE') return parse(tonnageMt) > 0;
    return additiveName.trim() !== '' && parse(doseQuantity) > 0;
  }, [productName, supplier, supplierLotNumber, entryType, tonnageMt, numberOfBags, additiveName, doseQuantity]);

  const save = async () => {
    setError(null);

    const intFcfa = (raw: string, msg: string): number | undefined => {
      if (raw.trim() === '') return undefined;
      const n = Number(raw.replace(/[\s,]/g, ''));
      if (!Number.isInteger(n) || n <= 0) {
        setError(msg);
        throw new Error(msg);
      }
      return n;
    };

    const common: Omit<CreateInputLotInput, 'entryType'> = {
      productName: productName.trim(),
      supplier: supplier.trim(),
      supplierLotNumber: supplierLotNumber.trim(),
      ...(expirationDate.trim() ? { expirationDate: expirationDate.trim() } : {}),
      receivedDate: todayStr(),
    };

    let typed: CreateInputLotInput;
    try {
      if (entryType === 'BULKER') {
        typed = {
          ...common,
          entryType,
          tonnageMt: parse(tonnageMt),
          ...(costPerMtFcfa.trim()
            ? { costPerMtFcfa: intFcfa(costPerMtFcfa, 'Le coût doit être un montant entier en FCFA (par tonne).') }
            : {}),
          feedPhase,
          ...(feedPhase === 'PERSONNALISE' && customFeedPhaseName.trim()
            ? { customFeedPhaseName: customFeedPhaseName.trim() }
            : {}),
        };
      } else if (entryType === 'BAG') {
        typed = {
          ...common,
          entryType,
          numberOfBags: Math.round(parse(numberOfBags)),
          ...(bagSizeKg !== null ? { bagSizeKg } : {}),
          ...(unitPriceFcfa.trim()
            ? { unitPriceFcfa: intFcfa(unitPriceFcfa, 'Le prix doit être un montant entier en FCFA (par sac).') }
            : {}),
          feedPhase,
          ...(feedPhase === 'PERSONNALISE' && customFeedPhaseName.trim()
            ? { customFeedPhaseName: customFeedPhaseName.trim() }
            : {}),
        };
      } else if (entryType === 'MEDICAMENT') {
        typed = {
          ...common,
          entryType,
          additiveName: additiveName.trim(),
          doseQuantity: parse(doseQuantity),
          ...(doseUnit.trim() ? { doseUnit: doseUnit.trim() } : {}),
          ...(notes.trim() ? { notes: notes.trim() } : {}),
        };
      } else {
        typed = {
          ...common,
          entryType,
          tonnageMt: parse(tonnageMt),
          ...(totalCostFcfa.trim()
            ? { totalCostFcfa: intFcfa(totalCostFcfa, 'Le coût total doit être un montant entier en FCFA.') }
            : {}),
        };
      }
    } catch {
      return;
    }

    setSaving(true);
    try {
      const result = await createFeedInputQueued(farmId, typed);
      if (result.status === 'sent') invalidateFarmQueries(queryClient, { farmId });
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success).catch(() => {});
      setQueued(result.status === 'queued');
      setSaved(true);
      setTimeout(onClose, 1100);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Erreur lors de l’enregistrement.');
      setSaving(false);
      return;
    }
  };

  if (saved) {
    return (
      <View style={styles.savedWrap}>
        <View style={styles.savedBadge}>
          <Check size={30} color={palette.surface} strokeWidth={3} />
        </View>
        <AppText size="h3" weight="bold" color="text">
          Entrée enregistrée
        </AppText>
        <AppText size="caption" color="muted" align="center">
          {queued
            ? 'Mise en attente · sera synchronisée le retour en ligne'
            : 'Lot HACCP créé, stock provende mis à jour.'}
        </AppText>
      </View>
    );
  }

  return (
    <ScrollView showsVerticalScrollIndicator={false} style={{ flexGrow: 0 }} keyboardShouldPersistTaps="handled">
      <View style={{ gap: spacing.lg }}>
        {/* Type d'entrée : onglets compacts avec icônes */}
        <View style={styles.typeTabs}>
          {ENTRY_TYPES.map((t) => {
            const Icon = ENTRY_ICONS[t];
            const active = t === entryType;
            return (
              <Pressable
                key={t}
                onPress={() => changeEntryType(t)}
                style={[styles.typeTab, active && styles.typeTabActive]}
                accessibilityRole="tab"
                accessibilityState={{ selected: active }}>
                <View style={[styles.typeIconBadge, active && styles.typeIconBadgeActive]}>
                  <Icon size={22} color={active ? palette.surface : color.ink[500]} strokeWidth={2.2} />
                </View>
                <AppText size="small" weight={active ? 'semibold' : 'medium'} color={active ? 'accent' : 'muted'} align="center">
                  {FEED_ENTRY_TYPE_LABELS[t]}
                </AppText>
              </Pressable>
            );
          })}
        </View>

        {/* Bandeau du type sélectionné */}
        <View style={styles.typeTitleBar}>
          <View style={styles.typeTitleBadge}>
            {(() => {
              const Icon = ENTRY_ICONS[entryType];
              return <Icon size={20} color={color.accent[600]} strokeWidth={2.2} />;
            })()}
          </View>
          <View style={{ flex: 1, gap: 3 }}>
            <AppText size="body" weight="bold" color="text">
              {FEED_ENTRY_TYPE_LABELS[entryType]}
            </AppText>
            <AppText size="small" weight="medium" color="brand">
              {ENTRY_DESC[entryType]}
            </AppText>
          </View>
        </View>

        {/* Quantité / montants selon le type (en tête, juste sous le type) */}
        {entryType === 'BULKER' ? (
          <View style={styles.section}>
            <SectionTitle icon={Scale} title="QUANTITÉ — VRAC" />
            <Field
              label="Tonnage"
              value={tonnageMt}
              onChangeText={(t) => setTonnageMt(numeric(t))}
              placeholder="0"
              keyboardType="number-pad"
              suffix="tonnes"
              editable={!saving}
            />
            <Field
              label="Coût / tonne (optionnel)"
              value={costPerMtFcfa}
              onChangeText={setCostPerMtFcfa}
              placeholder="ex. 300 000"
              keyboardType="number-pad"
              prefix="FCFA"
              editable={!saving}
            />
          </View>
        ) : null}

        {entryType === 'BAG' ? (
          <View style={styles.section}>
            <SectionTitle icon={PackageOpen} title="QUANTITÉ — SACS" />
            <AppText size="label" color="muted">
              TAILLE DU SAC
            </AppText>
            <View style={styles.bagSizeRow}>
              {BAG_SIZES.map((s) => {
                const activeBag = bagSizeKg === s;
                return (
                  <Pressable
                    key={s}
                    onPress={() => {
                      Haptics.selectionAsync().catch(() => {});
                      setBagSizeKg(s);
                    }}
                    accessibilityRole="button"
                    style={[styles.bagSizeCard, activeBag && styles.bagSizeCardActive]}>
                    <AppText size="h3" weight="bold" color={activeBag ? 'accent' : 'text'}>
                      {s}
                      <AppText size="caption" color="muted">
                        {' '}kg
                      </AppText>
                    </AppText>
                    {activeBag ? <Check size={16} color={color.accent[600]} strokeWidth={2.5} /> : null}
                  </Pressable>
                );
              })}
            </View>
            <View style={{ gap: spacing.md, marginTop: spacing.md }}>
              <Field
                label="Nombre de sacs"
                value={numberOfBags}
                onChangeText={(t) => setNumberOfBags(numeric(t, false))}
                placeholder="0"
                keyboardType="number-pad"
                suffix="sacs"
                editable={!saving}
              />
              <Field
                label="Prix / sac (optionnel)"
                value={unitPriceFcfa}
                onChangeText={setUnitPriceFcfa}
                placeholder="ex. 18 500"
                keyboardType="number-pad"
                prefix="FCFA"
                editable={!saving}
              />
              {bagSizeKg !== null && parse(numberOfBags) > 0 ? (
                <View style={styles.computedRow}>
                  <AppText size="small" color="faint">
                    Équivalent total
                  </AppText>
                  <AppText size="small" weight="semibold" color="text">
                    {Math.round(parse(numberOfBags) * bagSizeKg).toLocaleString('fr-FR')} kg
                  </AppText>
                </View>
              ) : null}
            </View>
          </View>
        ) : null}

        {entryType === 'MEDICAMENT' ? (
          <View style={styles.section}>
            <SectionTitle icon={Pill} title="QUANTITÉ — MÉDICAMENT" />
            <View style={styles.field}>
              <AppText size="label" color="muted">
                PRINCIPE ACTIF / ADDITIF
              </AppText>
              <Pressable
                onPress={() => {
                  if (!saving) {
                    Haptics.selectionAsync().catch(() => {});
                    setShowPrincipePicker(true);
                  }
                }}
                style={styles.selectBtn}
                accessibilityRole="button">
                <AppText
                  size="body"
                  color={additiveName ? 'text' : 'faint'}
                  style={{ flex: 1 }}
                  numberOfLines={1}>
                  {additiveName || 'Sélectionner un principe actif…'}
                </AppText>
                <ChevronDown size={18} color={color.ink[400]} />
              </Pressable>
              {principeCustom ? (
                <Field
                  label="SAISISSEZ LE PRINCIPE ACTIF"
                  value={additiveName}
                  onChangeText={setAdditiveName}
                  placeholder="ex. Vitamine, anticoccidien…"
                  editable={!saving}
                  style={{ marginTop: 4 }}
                />
              ) : null}
            </View>
            <Field
              label="Dose / quantité"
              value={doseQuantity}
              onChangeText={(t) => setDoseQuantity(numeric(t))}
              placeholder="0"
              keyboardType="number-pad"
              editable={!saving}
            />
            <View style={styles.field}>
              <AppText size="label" color="muted">
                UNITÉ DE DOSE (OPTIONNEL)
              </AppText>
              <Pressable
                onPress={() => {
                  if (!saving) {
                    Haptics.selectionAsync().catch(() => {});
                    setShowDoseUnitPicker(true);
                  }
                }}
                style={styles.selectBtn}
                accessibilityRole="button">
                <AppText
                  size="body"
                  color={doseUnit ? 'text' : 'faint'}
                  style={{ flex: 1 }}
                  numberOfLines={1}>
                  {doseUnit || 'Sélectionner une unité…'}
                </AppText>
                <ChevronDown size={18} color={color.ink[400]} />
              </Pressable>
              {doseUnitCustom ? (
                <Field
                  label="SAISISSEZ L'UNITÉ"
                  value={doseUnit}
                  onChangeText={setDoseUnit}
                  placeholder="ex. millilitre, comprimé…"
                  editable={!saving}
                  style={{ marginTop: 4 }}
                />
              ) : null}
            </View>
            <Field
              label="Notes (optionnel)"
              value={notes}
              onChangeText={setNotes}
              placeholder="Dose recommandée, indications…"
              editable={!saving}
            />
          </View>
        ) : null}

        {entryType === 'MATIERE_PREMIERE' ? (
          <View style={styles.section}>
            <SectionTitle icon={Box} title="QUANTITÉ — MATIÈRE PREMIÈRE" />
            <Field
              label="Quantité (tonnes)"
              value={tonnageMt}
              onChangeText={(t) => setTonnageMt(numeric(t))}
              placeholder="0"
              keyboardType="number-pad"
              suffix="tonnes"
              editable={!saving}
            />
            <Field
              label="Coût total (optionnel)"
              value={totalCostFcfa}
              onChangeText={setTotalCostFcfa}
              placeholder="ex. 150 000"
              keyboardType="number-pad"
              prefix="FCFA"
              editable={!saving}
            />
          </View>
        ) : null}

        {/* Phase d'aliment : grille claire et lisible (hors matière première) */}
        {showPhase ? (
          <View style={styles.section}>
            <View style={styles.phaseHead}>
              <View style={styles.sectionTitleIcon}>
                <Wheat size={18} color={color.accent[500]} strokeWidth={2.4} />
              </View>
              <AppText size="bodyM" weight="bold" color="text">
                PHASE D’ALIMENT
              </AppText>
              <View style={{ flex: 1 }} />
              <AppText size="small" color="faint">
                autonomie
              </AppText>
            </View>
            <View style={styles.phaseGrid}>
              {FEED_PHASES.map((t) => (
                <Pressable
                  key={t}
                  onPress={() => {
                    Haptics.selectionAsync().catch(() => {});
                    setFeedPhase(t);
                  }}
                  accessibilityRole="button">
                  <Chip
                    label={FEED_PHASE_LABELS[t]}
                    tone={feedPhase === t ? 'accent' : 'neutral'}
                    selected={feedPhase === t}
                    style={styles.phaseChip}
                  />
                </Pressable>
              ))}
            </View>
            {feedPhase === 'PERSONNALISE' ? (
              <Field
                label="NOM DE LA PHASE PERSONNALISÉE"
                value={customFeedPhaseName}
                onChangeText={setCustomFeedPhaseName}
                placeholder="ex. Finition 2"
                editable={!saving}
                style={{ marginTop: 6 }}
              />
            ) : null}
            {(() => {
              const adv = showPhase ? advisoryFor(feedPhase) : null;
              if (!adv) return null;
              const iconColor =
                adv.level === 'crit' ? color.red[600] : adv.level === 'warn' ? color.amber[600] : color.green[600];
              const textColor = adv.level === 'ok' ? 'text' : 'danger';
              const bg =
                adv.level === 'crit' ? styles.advisoryCrit : adv.level === 'warn' ? styles.advisoryWarn : styles.advisoryOk;
              return (
                <View style={[styles.advisoryBanner, bg]}>
                  <AlertTriangle size={16} color={iconColor} />
                  <AppText size="small" color={textColor} style={{ flex: 1 }}>
                    {adv.text}
                  </AppText>
                </View>
              );
            })()}
          </View>
        ) : null}

        {/* Identification produit / fournisseur */}
        <View style={styles.section}>
          <SectionTitle icon={Box} title="IDENTIFICATION" />
          {entryType === 'MATIERE_PREMIERE' ? (
            <View style={styles.field}>
              <AppText size="label" color="muted">
                PRODUIT
              </AppText>
              <Pressable
                onPress={() => {
                  if (!saving) {
                    Haptics.selectionAsync().catch(() => {});
                    setShowProduitPicker(true);
                  }
                }}
                style={styles.selectBtn}
                accessibilityRole="button">
                <AppText
                  size="body"
                  color={productName ? 'text' : 'faint'}
                  style={{ flex: 1 }}
                  numberOfLines={1}>
                  {productName || 'Sélectionner une matière première…'}
                </AppText>
                <ChevronDown size={18} color={color.ink[400]} />
              </Pressable>
              {produitCustom ? (
                <Field
                  label="SAISISSEZ LA MATIÈRE PREMIÈRE"
                  value={productName}
                  onChangeText={setProductName}
                  placeholder="ex. Maïs, soja, tourteau…"
                  editable={!saving}
                  style={{ marginTop: 4 }}
                />
              ) : null}
            </View>
          ) : (
            <Field
              label="Produit"
              value={productName}
              onChangeText={setProductName}
              placeholder={
                entryType === 'MEDICAMENT' ? 'ex. Vitamine AD3E' : 'ex. Provende Démarrage CEAG'
              }
              editable={!saving}
            />
          )}
          <Field
            label="Fournisseur"
            value={supplier}
            onChangeText={setSupplier}
            placeholder="ex. CEAG"
            editable={!saving}
          />
          <Field
            label="N° de lot fournisseur (HACCP)"
            value={supplierLotNumber}
            onChangeText={setSupplierLotNumber}
            placeholder="Référence tracée du lot"
            editable={!saving}
          />
          <View style={styles.field}>
            <AppText size="label" color="muted">
              PÉREMPTION (OPTIONNEL)
            </AppText>
            <Pressable
              onPress={() => {
                if (saving) return;
                Haptics.selectionAsync().catch(() => {});
                setShowExpiryPicker(true);
              }}
              style={[styles.dateBtn, expirationDate && styles.dateBtnSet]}
              accessibilityRole="button">
              <Calendar size={18} color={expirationDate ? color.accent[600] : color.ink[400]} />
              <AppText size="body" color={expirationDate ? 'text' : 'faint'} style={{ flex: 1 }}>
                {fmtExpiry()}
              </AppText>
              {expirationDate ? (
                <Pressable onPress={clearExpiry} hitSlop={10} style={styles.dateClear} accessibilityRole="button">
                  <X size={15} color={color.ink[500]} />
                </Pressable>
              ) : null}
            </Pressable>
            {showExpiryPicker ? (
              <DateTimePicker
                value={expirationDate ? new Date(expirationDate + 'T00:00:00') : new Date()}
                mode="date"
                display={Platform.OS === 'ios' ? 'spinner' : 'default'}
                onChange={onExpiryChange}
                minimumDate={new Date()}
                locale="fr-FR"
              />
            ) : null}
          </View>
        </View>

        <AppText size="caption" color="faint">
          {entryType === 'MEDICAMENT'
            ? 'Un médicament est tracé par FEFO dans le stock (pas dans l’autonomie en kg).'
            : 'L’entrée est déduite du coût de revient et alimente l’autonomie de la phase.'}
        </AppText>

        {error ? (
          <View style={styles.errorBanner}>
            <AppText size="small" color="danger">
              {error}
            </AppText>
          </View>
        ) : null}

        {showProduitPicker ? (
          <Modal visible transparent animationType="fade" onRequestClose={() => setShowProduitPicker(false)}>
            <Pressable style={styles.pickerBackdrop} onPress={() => setShowProduitPicker(false)}>
              <Pressable style={styles.pickerPanel}>
                <View style={styles.pickerHeader}>
                  <AppText size="body" weight="bold" color="text">
                    Matière première
                  </AppText>
                  <Pressable onPress={() => setShowProduitPicker(false)} hitSlop={10}>
                    <AppText size="small" weight="bold" color="brand">
                      Fermer
                    </AppText>
                  </Pressable>
                </View>
                <ScrollView bounces={false} style={{ maxHeight: 380 }}>
                  {MATIERES_PREMIERES.map((o) => {
                    const active = !produitCustom && productName === o.label;
                    return (
                      <Pressable
                        key={o.id}
                        onPress={() => {
                          Haptics.selectionAsync().catch(() => {});
                          if (o.id === '__custom') {
                            setProduitCustom(true);
                            setProductName('');
                          } else {
                            setProduitCustom(false);
                            setProductName(o.label);
                          }
                          setShowProduitPicker(false);
                        }}
                        style={[styles.pickerRow, active && styles.pickerRowActive]}>
                        <AppText
                          size="body"
                          weight={active ? 'bold' : 'medium'}
                          style={{ flex: 1 }}
                          color={active ? 'brand' : 'text'}>
                          {o.label}
                        </AppText>
                        {active ? <Check size={18} color={palette.brand[600]} /> : null}
                      </Pressable>
                    );
                  })}
                </ScrollView>
              </Pressable>
            </Pressable>
          </Modal>
        ) : null}

        {showPrincipePicker ? (
          <Modal visible transparent animationType="fade" onRequestClose={() => setShowPrincipePicker(false)}>
            <Pressable style={styles.pickerBackdrop} onPress={() => setShowPrincipePicker(false)}>
              <Pressable style={styles.pickerPanel}>
                <View style={styles.pickerHeader}>
                  <AppText size="body" weight="bold" color="text">
                    Principe actif / additif
                  </AppText>
                  <Pressable onPress={() => setShowPrincipePicker(false)} hitSlop={10}>
                    <AppText size="small" weight="bold" color="brand">
                      Fermer
                    </AppText>
                  </Pressable>
                </View>
                <ScrollView bounces={false} style={{ maxHeight: 380 }}>
                  {PRINCIPES_ACTIFS.map((o) => {
                    const active = !principeCustom && additiveName === o.label;
                    return (
                      <Pressable
                        key={o.id}
                        onPress={() => {
                          Haptics.selectionAsync().catch(() => {});
                          if (o.id === '__custom') {
                            setPrincipeCustom(true);
                            setAdditiveName('');
                          } else {
                            setPrincipeCustom(false);
                            setAdditiveName(o.label);
                          }
                          setShowPrincipePicker(false);
                        }}
                        style={[styles.pickerRow, active && styles.pickerRowActive]}>
                        <AppText
                          size="body"
                          weight={active ? 'bold' : 'medium'}
                          style={{ flex: 1 }}
                          color={active ? 'brand' : 'text'}>
                          {o.label}
                        </AppText>
                        {active ? <Check size={18} color={palette.brand[600]} /> : null}
                      </Pressable>
                    );
                  })}
                </ScrollView>
              </Pressable>
            </Pressable>
          </Modal>
        ) : null}

        {showDoseUnitPicker ? (
          <Modal visible transparent animationType="fade" onRequestClose={() => setShowDoseUnitPicker(false)}>
            <Pressable style={styles.pickerBackdrop} onPress={() => setShowDoseUnitPicker(false)}>
              <Pressable style={styles.pickerPanel}>
                <View style={styles.pickerHeader}>
                  <AppText size="body" weight="bold" color="text">
                    Unité de dose
                  </AppText>
                  <Pressable onPress={() => setShowDoseUnitPicker(false)} hitSlop={10}>
                    <AppText size="small" weight="bold" color="brand">
                      Fermer
                    </AppText>
                  </Pressable>
                </View>
                <ScrollView bounces={false} style={{ maxHeight: 380 }}>
                  {DOSE_UNITS.map((o) => {
                    const active = !doseUnitCustom && doseUnit === o.label;
                    return (
                      <Pressable
                        key={o.id}
                        onPress={() => {
                          Haptics.selectionAsync().catch(() => {});
                          if (o.id === '__custom') {
                            setDoseUnitCustom(true);
                            setDoseUnit('');
                          } else {
                            setDoseUnitCustom(false);
                            setDoseUnit(o.label);
                          }
                          setShowDoseUnitPicker(false);
                        }}
                        style={[styles.pickerRow, active && styles.pickerRowActive]}>
                        <AppText
                          size="body"
                          weight={active ? 'bold' : 'medium'}
                          style={{ flex: 1 }}
                          color={active ? 'brand' : 'text'}>
                          {o.label}
                        </AppText>
                        {active ? <Check size={18} color={palette.brand[600]} /> : null}
                      </Pressable>
                    );
                  })}
                </ScrollView>
              </Pressable>
            </Pressable>
          </Modal>
        ) : null}

        <View style={styles.actions}>
          <Button label="Annuler" tone="ghost" size="md" block={false} onPress={onClose} disabled={saving} />
          <View style={{ flex: 1 }}>
            <Button
              label="Enregistrer l’entrée"
              tone="accent"
              icon={Box}
              loading={saving}
              disabled={!canSave || saving}
              onPress={() => void save()}
            />
          </View>
        </View>
      </View>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  typeTabs: {
    flexDirection: 'row',
    gap: 8,
  },
  typeTab: {
    flex: 1,
    alignItems: 'center',
    gap: 6,
    paddingVertical: 10,
    paddingHorizontal: 4,
    borderRadius: radii.lg,
    borderWidth: 1,
    borderColor: palette.border,
    backgroundColor: color.surfaceAlt,
  },
  typeTabActive: {
    backgroundColor: color.accent[50],
    borderColor: color.accent[300],
    borderWidth: 1.5,
  },
  typeIconBadge: {
    width: 40,
    height: 40,
    borderRadius: 20,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: color.surface,
    borderWidth: 1,
    borderColor: palette.border,
    marginBottom: 2,
  },
  typeIconBadgeActive: {
    backgroundColor: color.accent[500],
    borderColor: color.accent[600],
  },
  typeTitleBar: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    paddingHorizontal: 12,
    paddingVertical: 10,
    borderRadius: radii.lg,
    backgroundColor: color.accent[50],
    borderWidth: 1,
    borderColor: color.accent[200],
  },
  typeTitleBadge: {
    width: 36,
    height: 36,
    borderRadius: 18,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: color.surface,
  },
  sectionTitleRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    marginBottom: 2,
  },
  sectionTitleIcon: {
    width: 24,
    height: 24,
    borderRadius: 12,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: color.accent[50],
  },
  section: {
    gap: 6,
  },
  phaseHead: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    marginBottom: 2,
  },
  phaseGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
  },
  phaseChip: {
    paddingHorizontal: 12,
    paddingVertical: 7,
  },
  bagSizeRow: {
    flexDirection: 'row',
    gap: 8,
  },
  bagSizeCard: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
    paddingVertical: 16,
    borderRadius: radii.md,
    borderWidth: 1.5,
    borderColor: palette.border,
    backgroundColor: color.surfaceAlt,
  },
  bagSizeCardActive: {
    borderColor: color.accent[500],
    backgroundColor: color.accent[50],
  },
  advisoryBanner: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    borderRadius: radii.md,
    paddingHorizontal: 12,
    paddingVertical: 10,
    marginTop: 2,
  },
  advisoryOk: {
    backgroundColor: color.green[50],
  },
  advisoryWarn: {
    backgroundColor: color.amber[50],
  },
  advisoryCrit: {
    backgroundColor: color.red[50],
  },
  field: {
    gap: 5,
  },
  inputWrap: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    borderWidth: 1,
    borderColor: palette.border,
    borderRadius: radii.md,
    paddingHorizontal: 12,
    backgroundColor: color.surface,
    minHeight: 46,
  },
  input: {
    flex: 1,
    fontSize: 15,
    color: color.ink[800],
    paddingVertical: 12,
  },
  dateBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    minHeight: 46,
    paddingHorizontal: 12,
    borderRadius: radii.md,
    borderWidth: 1,
    borderColor: palette.border,
    backgroundColor: color.surface,
  },
  dateBtnSet: {
    borderColor: color.accent[400],
  },
  dateClear: {
    width: 26,
    height: 26,
    borderRadius: 13,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: color.surfaceAlt,
  },
  computedRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    backgroundColor: color.green[50],
    borderRadius: radii.md,
    paddingHorizontal: 12,
    paddingVertical: 10,
  },
  errorBanner: {
    backgroundColor: color.red[50],
    borderRadius: radii.md,
    paddingHorizontal: 12,
    paddingVertical: 10,
  },
  actions: {
    flexDirection: 'row',
    gap: 10,
    marginTop: 6,
  },
  savedWrap: {
    alignItems: 'center',
    gap: spacing.sm,
    paddingVertical: spacing.huge,
  },
  savedBadge: {
    width: 56,
    height: 56,
    borderRadius: 28,
    backgroundColor: palette.green[600],
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 4,
  },
  selectBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    minHeight: 46,
    paddingHorizontal: 12,
    borderRadius: radii.md,
    backgroundColor: color.surface,
    borderWidth: 1,
    borderColor: palette.border,
  },
  pickerBackdrop: {
    flex: 1,
    backgroundColor: 'rgba(9, 24, 40, 0.45)',
    justifyContent: 'center',
    padding: 24,
  },
  pickerPanel: {
    backgroundColor: palette.paper,
    borderRadius: radii.lg,
    padding: 16,
    maxHeight: 460,
    borderWidth: 1,
    borderColor: color.border,
  },
  pickerHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 10,
  },
  pickerRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    paddingVertical: 12,
    paddingHorizontal: 12,
    borderRadius: radii.md,
    borderWidth: 1,
    borderColor: 'transparent',
  },
  pickerRowActive: {
    borderColor: palette.brand[200],
    backgroundColor: palette.brand[50],
  },
});
