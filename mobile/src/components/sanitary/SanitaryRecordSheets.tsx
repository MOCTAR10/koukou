// POUFA lot A sante: the treatment register entry (CDC n° 23) and the care
// completion (CDC n° 22) on the phone, both through the offline queue.
import React, { useState } from 'react';
import { Platform, Pressable, StyleSheet, View } from 'react-native';
import { TextInput } from '@/components/ui/AppTextInput';
import DateTimePicker, { type DateTimePickerEvent } from '@react-native-community/datetimepicker';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { Calendar, Check, ChevronDown, Syringe } from 'lucide-react-native';

import { AppText } from '@/components/ui/AppText';
import { Button } from '@/components/ui/Button';
import { Chip } from '@/components/ui/Chip';
import { toast } from '@/components/ui/Feedback';
import { NumberInput } from '@/components/ui/NumberInput';
import { Sheet } from '@/components/ui/Sheet';
import { invalidateFarmQueries } from '@/api/invalidate';
import { localYmd, todayStr } from '@/api/mutations';
import { fetchProgramList } from '@/api/poufa';
import type { CareType, ProphylaxisEvent } from '@/api/types';
import { color, fontFamily, palette, semantic } from '@/constants/theme';
import { completeProphylaxisQueued, createTreatmentQueued } from '@/offline';
import { cachedRead } from '@/offline/ref-cache';
import {
  EMPTY_PRODUCT_LIST_NOTE,
  REFERENCE_STEP_LABEL,
  UNKNOWN_PRODUCT_LIST_NOTE,
  careNeedsTreatmentDetails,
  careOpensTreatment,
  careTreatmentBody,
  completionBody,
  postponedLabel,
  treatmentBody,
  withdrawalEndPreview,
} from '@/poufa/sanitary-records';
import { errorText } from '@/api/errorText';

export const CARE_TYPE_LABELS: Record<CareType, string> = {
  VACCIN: 'Vaccin',
  MEDICAMENT: 'Médicament',
  VITAMINE: 'Vitamine',
  ANTIBIOTIQUE: 'Antibiotique',
  AUTRE: 'Autre',
};

const ROUTES = [
  'Eau de boisson',
  'Injection sous-cutanée',
  'Injection intramusculaire',
  'Goutte œil / narine',
  'Nébulisation',
  'Oral / aliment',
];

/** PRODUIT_TRAITEMENT items of the veterinary services, kept on the phone for offline entries. */
export function useTreatmentProducts(enabled = true) {
  return useQuery({
    queryKey: ['programme-list', 'PRODUIT_TRAITEMENT'],
    queryFn: () => cachedRead('list.PRODUIT_TRAITEMENT', () => fetchProgramList('PRODUIT_TRAITEMENT')),
    staleTime: 10 * 60_000,
    enabled,
  });
}

function frDate(iso: string): string {
  const [y, m, d] = iso.slice(0, 10).split('-');
  return `${d}/${m}/${y}`;
}

function dateOf(iso: string): Date {
  const [y, m, d] = iso.slice(0, 10).split('-').map(Number);
  return new Date(y, m - 1, d);
}

function Label({ text }: { text: string }) {
  return (
    <AppText size="small" weight="bold" color="muted" style={styles.label}>
      {text}
    </AppText>
  );
}

function DateField({
  value,
  onChange,
  placeholder,
  min,
  max,
  onClear,
}: {
  value: string;
  onChange: (iso: string) => void;
  placeholder?: string;
  min?: string;
  max?: string;
  onClear?: () => void;
}) {
  const [open, setOpen] = useState(false);
  const picked = (_e: DateTimePickerEvent, d?: Date) => {
    setOpen(false);
    if (d) onChange(localYmd(d));
  };
  return (
    <>
      <Pressable onPress={() => setOpen(true)} style={styles.selectBtn} accessibilityRole="button">
        <Calendar size={15} color={palette.green[600]} />
        <AppText size="body" weight="semibold" color={value ? 'text' : 'muted'} style={{ flex: 1 }}>
          {value ? frDate(value) : (placeholder ?? 'Choisir')}
        </AppText>
        {value && onClear ? (
          <Pressable onPress={onClear} accessibilityRole="button" hitSlop={8}>
            <AppText size="small" color="muted">
              Effacer
            </AppText>
          </Pressable>
        ) : (
          <ChevronDown size={16} color={palette.green[600]} />
        )}
      </Pressable>
      {open ? (
        <DateTimePicker
          value={dateOf(value || min || todayStr())}
          mode="date"
          display={Platform.OS === 'ios' ? 'spinner' : 'default'}
          onChange={picked}
          minimumDate={min ? dateOf(min) : undefined}
          maximumDate={max ? dateOf(max) : undefined}
          locale="fr-FR"
        />
      ) : null}
    </>
  );
}

function RouteChips({ value, onChange, disabled }: { value: string; onChange: (r: string) => void; disabled: boolean }) {
  const options = value && !ROUTES.includes(value) ? [value, ...ROUTES] : ROUTES;
  return (
    <View style={styles.rowWrap}>
      {options.map((r) => (
        <Pressable key={r} onPress={() => onChange(value === r ? '' : r)} disabled={disabled} accessibilityRole="button">
          <Chip label={r} tone={value === r ? 'green' : 'neutral'} selected={value === r} style={styles.chip} />
        </Pressable>
      ))}
    </View>
  );
}

export interface SheetLot {
  id: string;
  batchName?: string | null;
  quantityAlive?: number | null;
}

/** Treatment register entry (CDC n° 23): dates, product from the vets' list, reason, animals. */
export function TreatmentSheet({ visible, farmId, lot, onClose }: { visible: boolean; farmId: string; lot: SheetLot; onClose: () => void }) {
  const queryClient = useQueryClient();
  const products = useTreatmentProducts(visible);
  // null = the list could not be read (never cached, offline): free text, the server decides.
  const list = products.data ?? (products.isError ? null : undefined);
  const fromList = !!list && list.length > 0;
  const [careType, setCareType] = useState<CareType>('ANTIBIOTIQUE');
  const [productCode, setProductCode] = useState('');
  const [productName, setProductName] = useState('');
  const [reason, setReason] = useState('');
  const [administeredAt, setAdministeredAt] = useState(todayStr());
  const [endDate, setEndDate] = useState('');
  const [animalCount, setAnimalCount] = useState(lot.quantityAlive && lot.quantityAlive > 0 ? String(lot.quantityAlive) : '');
  const [withdrawal, setWithdrawal] = useState('');
  const [dosage, setDosage] = useState('');
  const [route, setRoute] = useState('');
  const [notes, setNotes] = useState('');
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const today = todayStr();
  const holdUntil = withdrawalEndPreview(administeredAt, endDate, withdrawal);

  const save = async () => {
    const built = treatmentBody(
      {
        careType,
        productCode,
        productName,
        dosage,
        route,
        administeredAt,
        endDate,
        reason,
        animalCount,
        withdrawalDays: withdrawal,
        notes,
      },
      list ?? null,
    );
    if (!built.ok) {
      setErr(built.error);
      return;
    }
    setErr(null);
    setBusy(true);
    try {
      const sent = await createTreatmentQueued(farmId, lot.id, { ...built.body, careType: built.body.careType as CareType });
      if (sent.status === 'queued') {
        toast.info('Traitement gardé sur le téléphone', 'Pas de connexion : il partira automatiquement dès le retour du réseau.');
      } else {
        toast.success('Traitement enregistré', holdUntil ? `Vente suspendue jusqu’au ${frDate(holdUntil)}.` : undefined);
        await invalidateFarmQueries(queryClient, { farmId, batchId: lot.id });
      }
      onClose();
    } catch (e) {
      setErr(errorText(e, 'Enregistrement du traitement impossible.'));
    } finally {
      setBusy(false);
    }
  };

  return (
    <Sheet
      visible={visible}
      title="Enregistrer un traitement"
      subtitle={lot.batchName ?? undefined}
      icon={<Syringe size={18} color={palette.green[600]} />}
      onClose={onClose}>
      <Label text="TYPE DE SOIN" />
      <View style={styles.rowWrap}>
        {(Object.keys(CARE_TYPE_LABELS) as CareType[]).map((k) => (
          <Pressable key={k} onPress={() => setCareType(k)} accessibilityRole="button">
            <Chip label={CARE_TYPE_LABELS[k]} tone={careType === k ? 'green' : 'neutral'} selected={careType === k} style={styles.chip} />
          </Pressable>
        ))}
      </View>
      <Label text="PRODUIT *" />
      {fromList && list ? (
        <View style={styles.rowWrap}>
          {list.map((p) => (
            <Pressable key={p.code} onPress={() => setProductCode(p.code)} disabled={busy} accessibilityRole="button">
              <Chip label={p.label} tone={productCode === p.code ? 'green' : 'neutral'} selected={productCode === p.code} style={styles.chip} />
            </Pressable>
          ))}
        </View>
      ) : (
        <>
          <TextInput
            value={productName}
            onChangeText={setProductName}
            placeholder="Nom du produit"
            placeholderTextColor={color.ink[300]}
            style={styles.input}
            editable={!busy && !(list === undefined && products.isLoading)}
          />
          {list === undefined && products.isLoading ? null : (
            <AppText size="caption" color="warn" style={styles.note}>
              {list === null ? UNKNOWN_PRODUCT_LIST_NOTE : EMPTY_PRODUCT_LIST_NOTE}
            </AppText>
          )}
        </>
      )}
      <Label text="MOTIF *" />
      <TextInput
        value={reason}
        onChangeText={setReason}
        placeholder="ex. diarrhée, prévention"
        placeholderTextColor={color.ink[300]}
        style={styles.input}
        editable={!busy}
      />
      <Label text="DÉBUT *" />
      <DateField value={administeredAt} onChange={setAdministeredAt} max={today} />
      <Label text="FIN (SI PLUSIEURS JOURS)" />
      <DateField value={endDate} onChange={setEndDate} min={administeredAt} placeholder="Un seul jour" onClear={() => setEndDate('')} />
      <Label text="ANIMAUX TRAITÉS *" />
      <NumberInput value={animalCount} onChangeText={setAnimalCount} suffix="sujets" placeholder="0" editable={!busy} />
      <Label text="DÉLAI D’ATTENTE AVANT VENTE (JOURS)" />
      <NumberInput value={withdrawal} onChangeText={setWithdrawal} suffix="j" placeholder="0" editable={!busy} />
      {holdUntil ? (
        <AppText size="caption" color="warn" style={styles.note}>
          Vente suspendue jusqu’au {frDate(holdUntil)} (compté depuis le dernier jour du traitement).
        </AppText>
      ) : null}
      <Label text="VOIE D'ADMINISTRATION" />
      <RouteChips value={route} onChange={setRoute} disabled={busy} />
      <Label text="DOSAGE (OPTIONNEL)" />
      <TextInput
        value={dosage}
        onChangeText={setDosage}
        placeholder="ex. 1 g / L d’eau"
        placeholderTextColor={color.ink[300]}
        style={styles.input}
        editable={!busy}
      />
      <Label text="NOTES (OPTIONNEL)" />
      <TextInput
        value={notes}
        onChangeText={setNotes}
        placeholder="Vétérinaire, observations…"
        placeholderTextColor={color.ink[300]}
        style={styles.input}
        editable={!busy}
        multiline
      />
      {err ? (
        <AppText size="caption" color="danger" style={styles.note}>
          {err}
        </AppText>
      ) : null}
      <View style={styles.actions}>
        <Button label="Annuler" tone="ghost" onPress={onClose} disabled={busy} />
        <Button label="Enregistrer" tone="success" icon={Check} onPress={() => void save()} disabled={busy} loading={busy} />
      </View>
    </Sheet>
  );
}

/** The planned care a completion closes (band calendar or advice list). */
export type CompletableCare = Pick<ProphylaxisEvent, 'id' | 'batchId' | 'name' | 'route' | 'withdrawalDays' | 'protocolStepId'> & {
  careType: CareType | string;
  productCode?: string | null;
  isReference?: boolean;
  originalDate?: string | null;
};

/**
 * Completion of a planned care (CDC n° 22: date, vaccine, route, number of
 * animals). POUFA lot A2 sante: every « Fait » of the phone goes through it;
 * a manual care with a withdrawal period asks the treatment register's data
 * (product from the vets' list, end day, reason, CDC n° 23).
 */
export function CompleteCareSheet({
  visible,
  farmId,
  event,
  defaultCount,
  onClose,
}: {
  visible: boolean;
  farmId: string;
  event: CompletableCare;
  /** Live birds of the band: the usual answer, the farmer corrects it. */
  defaultCount: number | null | undefined;
  onClose: () => void;
}) {
  const queryClient = useQueryClient();
  const [completedAt, setCompletedAt] = useState(todayStr());
  const [animalCount, setAnimalCount] = useState(defaultCount && defaultCount > 0 ? String(defaultCount) : '');
  const [route, setRoute] = useState(event.route ?? '');
  const [notes, setNotes] = useState('');
  const [productCode, setProductCode] = useState(event.productCode ?? '');
  const [endDate, setEndDate] = useState(todayStr());
  const [reason, setReason] = useState('');
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const care = {
    name: event.name,
    withdrawalDays: event.withdrawalDays,
    protocolStepId: event.protocolStepId,
    productCode: event.productCode ?? null,
    isReference: event.isReference,
    originalDate: event.originalDate ?? null,
  };
  const opens = careOpensTreatment(care);
  const details = careNeedsTreatmentDetails(care);
  const products = useTreatmentProducts(visible && details);
  const list = products.data ?? (products.isError ? null : undefined);
  const listed = list && list.length > 0 ? list : null;
  const postponed = postponedLabel(care, frDate);

  const save = async () => {
    const base = completionBody({ completedAt, animalCount, route, notes }, event.route);
    if (!base.ok) {
      setErr(base.error);
      return;
    }
    const extra = careTreatmentBody(care, { productCode, endDate, reason }, completedAt, list ?? null);
    if (!extra.ok) {
      setErr(extra.error);
      return;
    }
    const built = { body: { ...base.body, ...extra.body } };
    setErr(null);
    setBusy(true);
    try {
      const sent = await completeProphylaxisQueued(farmId, event.batchId, event.id, built.body);
      if (sent.status === 'queued') {
        toast.info('Soin gardé sur le téléphone', 'Pas de connexion : il sera marqué fait dès le retour du réseau.');
      } else {
        toast.success('Soin réalisé', `${event.name} · ${built.body.animalCount} sujets.`);
        await invalidateFarmQueries(queryClient, { farmId, batchId: event.batchId });
      }
      onClose();
    } catch (e) {
      setErr(errorText(e, 'Impossible de marquer le soin comme réalisé.'));
    } finally {
      setBusy(false);
    }
  };

  return (
    <Sheet
      visible={visible}
      title="Soin réalisé"
      subtitle={`${event.name} · ${CARE_TYPE_LABELS[event.careType as CareType] ?? event.careType}`}
      icon={<Check size={18} color={palette.green[600]} />}
      onClose={onClose}>
      <Label text="DATE DE RÉALISATION *" />
      <DateField value={completedAt} onChange={setCompletedAt} max={todayStr()} />
      <Label text="NOMBRE D'ANIMAUX *" />
      <NumberInput value={animalCount} onChangeText={setAnimalCount} suffix="sujets" placeholder="0" editable={!busy} />
      <Label text="VOIE D'ADMINISTRATION" />
      <RouteChips value={route} onChange={setRoute} disabled={busy} />
      {event.isReference ? (
        <AppText size="caption" color="muted" style={styles.note}>
          {REFERENCE_STEP_LABEL}
          {postponed ? ` · ${postponed}` : ''}
        </AppText>
      ) : null}
      {opens ? (
        <>
          <AppText size="caption" color="muted" style={styles.note}>
            Délai d’attente de {event.withdrawalDays} j : le soin est inscrit au registre des traitements.
          </AppText>
          {details ? (
            listed ? (
              <>
                <Label text="PRODUIT (LISTE DES VÉTÉRINAIRES) *" />
                <View style={styles.rowWrap}>
                  {listed.map((p) => (
                    <Pressable key={p.code} onPress={() => setProductCode(p.code)} disabled={busy} accessibilityRole="button">
                      <Chip label={p.label} tone={productCode === p.code ? 'green' : 'neutral'} selected={productCode === p.code} style={styles.chip} />
                    </Pressable>
                  ))}
                </View>
              </>
            ) : list === undefined && products.isLoading ? null : (
              <AppText size="caption" color="muted" style={styles.note}>
                {list === null ? UNKNOWN_PRODUCT_LIST_NOTE : EMPTY_PRODUCT_LIST_NOTE} Produit enregistré : « {event.name} ».
              </AppText>
            )
          ) : null}
          <Label text={details ? 'FIN DU TRAITEMENT *' : 'FIN DU TRAITEMENT'} />
          <DateField value={endDate} onChange={setEndDate} />
          <Label text={details ? 'MOTIF *' : 'MOTIF'} />
          <TextInput
            value={reason}
            onChangeText={setReason}
            placeholder={details ? 'Ex. : coryza, diarrhée' : 'Calendrier sanitaire (prévention)'}
            placeholderTextColor={color.ink[300]}
            style={styles.input}
            editable={!busy}
          />
        </>
      ) : null}
      <Label text="REMARQUES (LOT DU VACCIN, RÉACTION…)" />
      <TextInput
        value={notes}
        onChangeText={setNotes}
        placeholder="Optionnel"
        placeholderTextColor={color.ink[300]}
        style={styles.input}
        editable={!busy}
        multiline
      />
      {err ? (
        <AppText size="caption" color="danger" style={styles.note}>
          {err}
        </AppText>
      ) : null}
      <View style={styles.actions}>
        <Button label="Annuler" tone="ghost" onPress={onClose} disabled={busy} />
        <Button label="Marquer fait" tone="success" icon={Check} onPress={() => void save()} disabled={busy} loading={busy} />
      </View>
    </Sheet>
  );
}

const styles = StyleSheet.create({
  label: {
    marginTop: 4,
    marginBottom: 6,
    letterSpacing: 0.4,
  },
  rowWrap: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 6,
    marginBottom: 10,
  },
  chip: {
    marginBottom: 2,
  },
  input: {
    fontFamily: fontFamily.regular,
    minHeight: 46,
    borderWidth: 1,
    borderColor: semantic.border,
    borderRadius: 12,
    paddingHorizontal: 12,
    fontSize: 15,
    color: color.ink[800],
    backgroundColor: color.surface,
    marginBottom: 14,
  },
  selectBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    height: 46,
    borderWidth: 1,
    borderColor: palette.green[200],
    borderRadius: 12,
    paddingHorizontal: 12,
    backgroundColor: color.surface,
    marginBottom: 14,
  },
  note: {
    marginTop: -6,
    marginBottom: 12,
  },
  actions: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 10,
    marginTop: 16,
  },
});
