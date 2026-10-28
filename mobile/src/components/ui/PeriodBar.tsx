import React, { useCallback, useEffect, useImperativeHandle, useMemo, useRef, useState } from 'react';
import { Animated, Easing, Platform, Pressable, StyleSheet, View, type StyleProp, type ViewStyle } from 'react-native';
import DateTimePicker, { type DateTimePickerEvent } from '@react-native-community/datetimepicker';
import * as Haptics from 'expo-haptics';
import { CalendarRange, Check, ChevronDown, ChevronLeft, ChevronRight, Clock, Info, RotateCcw } from 'lucide-react-native';

import { AppText } from '@/components/ui/AppText';
import { Sheet } from '@/components/ui/Sheet';
import { palette, radii, semantic } from '@/constants/theme';

// ── Fenêtre de période exposée au parent ──
export interface PeriodWindow {
  isFiltered: boolean;
  span: number | 'all';
  from?: string; // YYYY-MM-DD (undefined = non bornée)
  to?: string;   // YYYY-MM-DD (jour de fin / jour sélectionné)
  time?: string; // HH:mm — selected time when filtered (exposed for screens that need it)
}

export function toDateStr(d: Date): string {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

/** Fenêtre initiale pour setUpstate côté parent : span jours se terminant aujourd'hui. */
export function periodWindow(defaultSpan: number | 'all', now: Date = new Date()): PeriodWindow {
  const to = toDateStr(now);
  if (defaultSpan === 'all') return { isFiltered: false, span: 'all', from: undefined, to };
  const from = new Date(now);
  from.setDate(now.getDate() - (defaultSpan - 1));
  return { isFiltered: false, span: defaultSpan, from: toDateStr(from), to };
}

const SPAN_CHOICES: { value: number | 'all'; label: string }[] = [
  { value: 7, label: '7j' },
  { value: 30, label: '30j' },
  { value: 90, label: '90j' },
  { value: 'all', label: 'Tout' },
];

// Bornes de dates stables (références constantes sur la journée) : empêcher
// les re-renders du composant de repousser un nouveau Date() au picker natif,
// ce qui le fait « sauter » au mois courant pendant la navigation au calendrier.
function buildStableDates() {
  const now = new Date();
  return {
    today: new Date(now.getFullYear(), now.getMonth(), now.getDate()),
    dayMin: new Date(now.getFullYear() - 1, now.getMonth(), now.getDate()),
    dayMax: new Date(now.getFullYear(), now.getMonth(), now.getDate(), 23, 59),
    twoYearMin: new Date(now.getFullYear() - 2, now.getMonth(), now.getDate()),
  };
}

function useStableDates() {
  const ref = useRef<{ key: string } & ReturnType<typeof buildStableDates> | null>(null);
  const key = new Date().toDateString();
  if (!ref.current || ref.current.key !== key) ref.current = { key, ...buildStableDates() };
  return ref.current;
}

// ── Pickers contrôlés « en interne » ──
// Le lib iOS ré-applique la prop `value` à chaque re-render : si le parent
// re-rend (tick « en direct » 1 s), le spinner saute au mois courant pendant
// la navigation. Ici la valeur vit dans le composant (remonté à chaque
// ouverture de champ), le composant est memoïsé et ne re-rend que si `seed`
// change réellement.
function PickerField({ seed, mode, minimumDate, maximumDate, minuteInterval, onSelect, onDismiss }: {
  seed: Date; mode: 'date' | 'time'; minimumDate?: Date; maximumDate?: Date; minuteInterval?: number;
  onSelect: (d: Date) => void; onDismiss?: () => void;
}) {
  const [value, setValue] = useState(seed);
  const onChange = (_e: DateTimePickerEvent, d?: Date) => {
    const next = d ?? value;
    setValue(next);
    onSelect(next);
    if (Platform.OS === 'android') onDismiss?.();
  };
  return (
    <DateTimePicker
      value={value}
      mode={mode}
      display={Platform.OS === 'ios' ? 'spinner' : 'default'}
      onChange={onChange}
      minimumDate={minimumDate}
      maximumDate={maximumDate}
      minuteInterval={minuteInterval}
      locale='fr-FR' />
  );
}

export const PickerFieldM = React.memo(PickerField);

interface PeriodBarProps {
  /** Fenêtre par défaut (en direct). Défaut : 30 jours. 'all' = historique complet. */
  defaultSpan?: number | 'all';
  /** Notifié quand la fenêtre change (mois, flèches, chips, date & heure). */
  onChange?: (w: PeriodWindow) => void;
  /** Notifié quand une fenêtre est réellement appliquée depuis la feuille (date unique ou période). */
  onApplied?: (source: 'single' | 'range') => void;
  /** Notifié quand la feuille se ferme SANS appliquer de fenêtre. */
  onPickerClose?: () => void;
  /** Surcharge de style sur la barre (ex. resserrer l'espace sous le header). */
  style?: StyleProp<ViewStyle>;
}

export interface PeriodBarHandle {
  /** Ouvre la feuille de sélection date & heure. */
  openPicker: () => void;
}

export function PeriodBar({ defaultSpan = 30, onChange, onApplied, onPickerClose, style, ref }: PeriodBarProps & { ref?: React.Ref<PeriodBarHandle> }) {
  const [dataAt, setDataAt] = useState<Date | null>(null); // null = en direct
  const [rangeFrom, setRangeFrom] = useState<Date | null>(null); // null = fenêtre calculée depuis span
  const [spanDays, setSpanDays] = useState<number | 'all'>(defaultSpan);
  const [showPicker, setShowPicker] = useState(false);
  const [liveNow, setLiveNow] = useState(new Date());

  useEffect(() => {
    const id = setInterval(() => setLiveNow(new Date()), 1000);
    return () => clearInterval(id);
  }, []);

  const selectedAt = dataAt ?? liveNow;
  const isFiltered = dataAt != null;
  const isToday = selectedAt.toDateString() === liveNow.toDateString();

  const formatDateFull = (d: Date) =>
    d.toLocaleDateString('fr-FR', { day: 'numeric', month: 'long', year: 'numeric' });
  const formatHour = (d: Date) =>
    d.toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit' });

  // ── Fenêtre exposée au parent ──
  const window = useMemo<PeriodWindow>(() => {
    const to = toDateStr(selectedAt);
    const time = `${String(selectedAt.getHours()).padStart(2, '0')}:${String(selectedAt.getMinutes()).padStart(2, '0')}`;
    if (rangeFrom) {
      const days = Math.max(1, Math.round((selectedAt.getTime() - rangeFrom.getTime()) / 86_400_000) + 1);
      return { isFiltered: true, span: days, from: toDateStr(rangeFrom), to, time };
    }
    if (spanDays === 'all') return { isFiltered, span: spanDays, from: undefined, to, time };
    const from = new Date(selectedAt);
    from.setDate(selectedAt.getDate() - (spanDays - 1));
    return { isFiltered, span: spanDays, from: toDateStr(from), to, time };
  }, [isFiltered, selectedAt, spanDays, rangeFrom]);

  const emitted = useRef('');
  useEffect(() => {
    const key = JSON.stringify(window);
    if (key === emitted.current) return;
    emitted.current = key;
    onChange?.(window);
  }, [window, onChange]);

  useImperativeHandle(ref, () => ({
    openPicker: () => {
      Haptics.selectionAsync().catch(() => {});
      setShowPicker(true);
    },
  }), []);

  const shiftDay = (delta: number) => {
    const copy = new Date(dataAt ?? liveNow);
    copy.setDate(copy.getDate() + delta);
    if (copy.getTime() > liveNow.getTime()) return;
    if (rangeFrom) {
      const f = new Date(rangeFrom);
      f.setDate(f.getDate() + delta);
      setRangeFrom(f);
    }
    setDataAt(copy);
    Haptics.selectionAsync().catch(() => {});
  };
  const clearFilter = () => {
    setDataAt(null);
    setRangeFrom(null);
  };
  const applyFilter = (d: Date) => {
    setDataAt(d);
    setRangeFrom(null);
    setShowPicker(false);
    onApplied?.('single');
  };
  const applyRange = (from: Date, to: Date) => {
    setRangeFrom(from);
    setDataAt(to);
    setShowPicker(false);
    Haptics.selectionAsync().catch(() => {});
    onApplied?.('range');
  };

  return (
    <>
      <View style={[styles.dateBar, style]}>
        <Pressable
          onPress={() => shiftDay(-1)}
          accessibilityRole='button'
          accessibilityLabel='Jour précédent'
          style={({ pressed }) => [styles.dateArrow, pressed && styles.dateArrowPressed]}>
          <ChevronLeft size={16} color={palette.brand[600]} />
        </Pressable>

        <Pressable
          onPress={() => {
            Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light).catch(() => {});
            setShowPicker(true);
          }}
          accessibilityRole='button'
          accessibilityLabel='Choisir la date et l’heure'
          style={({ pressed }) => [styles.datePill, pressed && styles.datePillPressed]}>
          <AppText size="small" weight="semibold" color="text" numberOfLines={1} style={styles.datePillText}>
            {formatDateFull(selectedAt)}
          </AppText>
          <View style={styles.datePillSep} />
          {!isFiltered && <PulsingLiveDot />}
          <Clock size={11} color={palette.brand[500]} />
          <AppText size="small" weight="bold" color="brand">{formatHour(selectedAt)}</AppText>
        </Pressable>

        <Pressable
          onPress={() => shiftDay(1)}
          accessibilityRole='button'
          accessibilityLabel='Jour suivant'
          disabled={isFiltered && isToday}
          style={({ pressed }) => [styles.dateArrow, pressed && styles.dateArrowPressed, (isFiltered && isToday) && styles.dateArrowDisabled]}>
          <ChevronRight size={16} color={palette.brand[600]} />
        </Pressable>
      </View>

      {/* ── ORIENTATION : fenêtre filtrée + retour en direct ── */}
      {isFiltered && (
        <View style={styles.orientRow}>
          <View style={[styles.orientChip, styles.orientChipFiltered]}>
            <Info size={12} color={palette.amber[500]} />
            <AppText size="caption" weight="semibold" color={semantic.warnText} numberOfLines={1} style={styles.orientText}>
              {rangeFrom
                ? `Période du ${formatDateFull(rangeFrom)} au ${formatDateFull(selectedAt)}`
                : `Jour du ${formatDateFull(selectedAt)}`}
            </AppText>
            <Pressable
              onPress={() => { Haptics.selectionAsync().catch(() => {}); clearFilter(); }}
              hitSlop={8}
              style={({ pressed }) => [styles.orientReset, pressed && styles.orientResetPressed]}
              accessibilityRole="button"
              accessibilityLabel="Revenir à aujourd’hui, en direct">
              <RotateCcw size={11} color={palette.brand[600]} />
              <AppText size="caption" weight="bold" color="brand">En direct</AppText>
            </Pressable>
          </View>
        </View>
      )}

      <Sheet visible={showPicker} title='Date & heure' onClose={() => { setShowPicker(false); onPickerClose?.(); }}>
        <PeriodSheet visible={showPicker} selected={selectedAt} onApply={applyFilter} onRange={applyRange} onNow={clearFilter} span={spanDays} onSelectSpan={(s) => { setRangeFrom(null); setSpanDays(s); }} rangeFrom={rangeFrom} />
      </Sheet>
    </>
  );
}

// ═══════════════════════════════════════════════════════════════════════
// DATE & HEURE (copie d'Accueil) — feuille interne + point "en direct"
// ═══════════════════════════════════════════════════════════════════════

const dts = StyleSheet.create({
  wrap: { gap: 16 },
  orientTip: {
    flexDirection: 'row', alignItems: 'center', gap: 6,
    padding: 10, borderRadius: radii.md,
    backgroundColor: palette.accent[50], borderWidth: 1, borderColor: palette.accent[100],
  },
  nowBtn: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 6,
    paddingVertical: 10, borderRadius: radii.pill,
    backgroundColor: palette.brand[50], borderWidth: 1, borderColor: palette.brand[200],
  },
  field: { gap: 8 },
  spanWrap: { gap: 8 },
  hidden: { display: 'none' },
  spanRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 6 },
  spanChip: {
    paddingHorizontal: 12, paddingVertical: 6, borderRadius: radii.pill,
    backgroundColor: palette.surfaceAlt, borderWidth: 1, borderColor: 'transparent',
  },
  spanChipActive: { backgroundColor: palette.brand[50], borderWidth: 1, borderColor: palette.brand[200] },
  fieldBtn: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
    paddingHorizontal: 14, paddingVertical: 12,
    borderRadius: radii.md, backgroundColor: palette.surfaceAlt,
    borderWidth: 1, borderColor: palette.border,
  },
  timeRow: { gap: 6 },
  timeBtn: {
    flexDirection: 'row', alignItems: 'center', gap: 6,
    paddingHorizontal: 14, paddingVertical: 10,
    borderRadius: radii.md, backgroundColor: palette.surfaceAlt,
    borderWidth: 1, borderColor: palette.border,
  },
  confirmBtn: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8,
    backgroundColor: palette.brand[600], borderRadius: radii.pill, height: 48, marginTop: 4,
  },
  rangeRow: { gap: 6 },
  rangeToggle: {
    flexDirection: 'row', alignItems: 'center', gap: 8,
    paddingHorizontal: 14, paddingVertical: 12,
    borderRadius: radii.md, backgroundColor: palette.surfaceAlt,
    borderWidth: 1, borderColor: palette.border,
  },
  toggleTrack: {
    width: 40, height: 22, borderRadius: 11,
    backgroundColor: palette.border, marginLeft: 'auto',
    padding: 2,
  },
  toggleTrackOn: { backgroundColor: palette.brand[600] },
  toggleThumb: { width: 18, height: 18, borderRadius: 9, backgroundColor: '#fff' },
  toggleThumbOn: { transform: [{ translateX: 18 }] },
  rangeFields: { flexDirection: 'row', gap: 8 },
  rangeSpinners: { gap: 10 },
  rangeSpinner: { gap: 2, marginTop: 2 },
  rangeFieldBtn: {
    flex: 1, flexDirection: 'column', alignItems: 'flex-start', gap: 2,
    paddingHorizontal: 14, paddingVertical: 10,
    borderRadius: radii.md, backgroundColor: palette.surfaceAlt,
    borderWidth: 1, borderColor: palette.border,
  },
  fieldBtnDim: { opacity: 0.5 },
});

function PeriodSheet({ selected, onApply, onRange, onNow, span, onSelectSpan, rangeFrom, visible }: {
  selected: Date; onApply: (d: Date) => void; onRange: (from: Date, to: Date) => void; onNow: () => void;
  span: number | 'all'; onSelectSpan: (s: number | 'all') => void;
  rangeFrom: Date | null; visible: boolean;
}) {
  const stable = useStableDates();
  const [date, setDate] = useState(new Date(selected));
  const [time, setTime] = useState(new Date(selected));
  const [showDatePicker, setShowDatePicker] = useState(false);
  const [showTimePicker, setShowTimePicker] = useState(false);
  const [fromDate, setFromDate] = useState(rangeFrom ?? new Date(selected));
  const [toDate, setToDate] = useState(new Date(selected));
  const [showFromPicker, setShowFromPicker] = useState(false);
  const [showToPicker, setShowToPicker] = useState(false);
  const [withRange, setWithRange] = useState(rangeFrom != null);

  // Refertone de chaque picker figée à l'ouverture du champ : pendant la
  // session le composant memoïsé ne re-rend jamais (donc la molette iOS ne
  // reçoit aucune ré-application de `value`), quelle que soit la fréquence des
  // re-renders du parent (« en direct » 1 s ou mise à jour de l'étiquette).
  const dateSeed = useRef(new Date(selected));
  const timeSeed = useRef(new Date(selected));
  const fromSeed = useRef(new Date(selected));
  const toSeed = useRef(new Date(selected));
  const closeDate = useCallback(() => setShowDatePicker(false), []);
  const closeTime = useCallback(() => setShowTimePicker(false), []);
  const closeFrom = useCallback(() => setShowFromPicker(false), []);
  const closeTo = useCallback(() => setShowToPicker(false), []);

  // Re-sync les champs à chaque réouverture (le Modal garde le composant monté).
  useEffect(() => {
    if (!visible) return;
    setDate(new Date(selected));
    setTime(new Date(selected));
    setToDate(new Date(selected));
    setFromDate(rangeFrom ?? new Date(selected));
    setWithRange(rangeFrom != null);
    dateSeed.current = new Date(selected);
    timeSeed.current = new Date(selected);
    fromSeed.current = new Date(rangeFrom ?? selected);
    toSeed.current = new Date(selected);
    setShowDatePicker(false);
    setShowTimePicker(false);
    setShowFromPicker(false);
    setShowToPicker(false);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [visible]);

  const handleNow = () => {
    const n = new Date();
    setDate(n);
    setTime(n);
    setToDate(n);
    const f = new Date(n);
    if (span === 'all') {
      f.setFullYear(f.getFullYear() - 1);
      f.setDate(f.getDate() + 1);
    } else {
      f.setDate(f.getDate() - ((typeof span === 'number' ? span : 1) - 1));
    }
    setFromDate(f);
    setWithRange(false);
    Haptics.selectionAsync().catch(() => {});
    onNow();
  };

  const handleConfirm = () => {
    if (withRange) {
      let from = new Date(fromDate);
      from.setHours(0, 0, 0, 0);
      let to = new Date(toDate);
      to.setHours(23, 59, 59, 999);
      if (from.getTime() > to.getTime()) {
        const t = from;
        from = to;
        to = t;
      }
      if (to.getTime() > Date.now()) {
        const n = new Date();
        to.setDate(n.getDate());
        to.setHours(n.getHours(), n.getMinutes(), 0, 0);
      }
      Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium).catch(() => {});
      onRange(from, to);
      return;
    }
    const result = new Date(date);
    result.setHours(time.getHours(), time.getMinutes(), 0, 0);
    if (result.getTime() > Date.now()) {
      const n = new Date();
      result.setDate(n.getDate());
      result.setHours(n.getHours(), n.getMinutes(), 0, 0);
    }
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium).catch(() => {});
    onApply(result);
  };

  const fmtDate = (d: Date) =>
    d.toLocaleDateString('fr-FR', { day: 'numeric', month: 'long', year: 'numeric' });
  const fmtTime = (d: Date) =>
    d.toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit' });

  return (
    <View style={dts.wrap}>
      <View style={dts.orientTip}>
        <Info size={13} color={palette.accent[500]} />
        <AppText size="caption" color="muted" style={{ flex: 1 }}>
          Le système suit la date, l’heure et les minutes exactes de chaque saisie. Choisissez un jour précis (avec l’heure) ou une période ; « En direct » affiche les données à l’instant.
        </AppText>
      </View>
      <Pressable onPress={handleNow} style={dts.nowBtn}>
        <PulsingLiveDot size={8} />
        <Clock size={14} color={palette.brand[600]} />
        <AppText size='small' weight='bold' color='brand'>En direct — heure et minute actuelles</AppText>
      </Pressable>

      <View style={[dts.spanWrap, withRange && dts.hidden]}>
        <AppText size='label' weight='semibold' color='muted'>Fenêtre financière</AppText>
        <View style={dts.spanRow}>
          {SPAN_CHOICES.map((c) => {
            const active = span === c.value;
            return (
              <Pressable
                key={String(c.value)}
                onPress={() => {
                  Haptics.selectionAsync().catch(() => {});
                  onSelectSpan(c.value);
                }}
                style={[dts.spanChip, active && dts.spanChipActive]}>
                <AppText size='small' weight={active ? 'bold' : 'medium'} color={active ? 'brand' : 'muted'}>{c.label}</AppText>
              </Pressable>
            );
          })}
        </View>
      </View>

      <View style={dts.field}>
        <AppText size='label' weight='semibold' color='muted'>Date</AppText>
        <Pressable
          onPress={() => {
            Haptics.selectionAsync().catch(() => {});
            dateSeed.current = new Date(date);
            setShowDatePicker((v) => !v);
          }}
          style={[dts.fieldBtn, withRange && dts.fieldBtnDim]}>
          <AppText size='body' weight='bold' color={withRange ? 'muted' : 'text'}>{fmtDate(date)}</AppText>
          <ChevronDown size={14} color={palette.brand[500]} />
        </Pressable>
        <View style={dts.timeRow}>
          <AppText size='label' weight='semibold' color='muted'>Heure</AppText>
          <Pressable
            onPress={() => {
              Haptics.selectionAsync().catch(() => {});
              timeSeed.current = new Date(time);
              setShowTimePicker((v) => !v);
            }}
            style={[dts.timeBtn, withRange && dts.fieldBtnDim]}>

            <Clock size={12} color={palette.brand[500]} />
            <AppText size='body' weight='bold' color={withRange ? 'muted' : 'text'}>{fmtTime(time)}</AppText>
          </Pressable>
        </View>
        {showDatePicker && (
          <PickerFieldM seed={dateSeed.current} mode='date' maximumDate={stable.today} minimumDate={stable.dayMin} onSelect={setDate} onDismiss={closeDate} />
        )}
        {showTimePicker && (
          <PickerFieldM seed={timeSeed.current} mode='time' maximumDate={stable.dayMax} minuteInterval={1} onSelect={setTime} onDismiss={closeTime} />
        )}
      </View>

      <View style={dts.rangeRow}>
        <Pressable
          onPress={() => {
            Haptics.selectionAsync().catch(() => {});
            setWithRange((v) => {
              const next = !v;
              if (next && rangeFrom == null && fromDate.toDateString() === toDate.toDateString()) {
                const f = new Date(toDate);
                const days = typeof span === 'number' ? span : 30;
                f.setDate(toDate.getDate() - (days - 1));
                setFromDate(f);
                fromSeed.current = f;
              }
              return next;
            });
          }}
          style={dts.rangeToggle}>
          <CalendarRange size={14} color={palette.brand[600]} />
          <AppText size='body' weight={withRange ? 'bold' : 'medium'} color={withRange ? 'brand' : 'muted'}>
            Filtrer par période
          </AppText>
          <View style={[dts.toggleTrack, withRange && dts.toggleTrackOn]}>
            <View style={[dts.toggleThumb, withRange && dts.toggleThumbOn]} />
          </View>
        </Pressable>
      </View>

      {withRange && (
        <View style={dts.field}>
          <AppText size='label' weight='semibold' color='muted'>Période du … au …</AppText>
          {Platform.OS === 'ios' ? (
            <View style={dts.rangeSpinners}>
              <View style={dts.rangeSpinner}>
                <AppText size='caption' weight='semibold' color='muted'>Du</AppText>
                <PickerFieldM seed={fromSeed.current} mode='date' maximumDate={stable.today} minimumDate={stable.twoYearMin} onSelect={setFromDate} onDismiss={closeFrom} />
              </View>
              <View style={dts.rangeSpinner}>
                <AppText size='caption' weight='semibold' color='muted'>Jusqu&apos;au</AppText>
                <PickerFieldM seed={toSeed.current} mode='date' maximumDate={stable.today} minimumDate={stable.twoYearMin} onSelect={setToDate} onDismiss={closeTo} />
              </View>
            </View>
          ) : (
            <>
              <View style={dts.rangeFields}>
                <Pressable
                  onPress={() => {
                    Haptics.selectionAsync().catch(() => {});
                    setShowToPicker(false);
                    fromSeed.current = new Date(fromDate);
                    setShowFromPicker((v) => !v);
                  }}
                  style={dts.rangeFieldBtn}>
                  <AppText size='caption' color='muted'>Du</AppText>
                  <AppText size='body' weight='bold' color='text'>{fmtDate(fromDate)}</AppText>
                </Pressable>
                <Pressable
                  onPress={() => {
                    Haptics.selectionAsync().catch(() => {});
                    setShowFromPicker(false);
                    toSeed.current = new Date(toDate);
                    setShowToPicker((v) => !v);
                  }}
                  style={dts.rangeFieldBtn}>
                  <AppText size='caption' color='muted'>Jusqu&apos;au</AppText>
                  <AppText size='body' weight='bold' color='text'>{fmtDate(toDate)}</AppText>
                </Pressable>
              </View>
              {showFromPicker && (
                <PickerFieldM seed={fromSeed.current} mode='date' maximumDate={toDate > stable.today ? stable.today : toDate} minimumDate={stable.twoYearMin} onSelect={setFromDate} onDismiss={closeFrom} />
              )}
              {showToPicker && (
                <PickerFieldM seed={toSeed.current} mode='date' maximumDate={stable.today} minimumDate={stable.twoYearMin} onSelect={setToDate} onDismiss={closeTo} />
              )}
            </>
          )}
        </View>
      )}

      <Pressable onPress={handleConfirm} style={dts.confirmBtn}>
        <Check size={16} color='#fff' />
        <AppText size='body' weight='bold' color='surface'>
          {withRange
            ? `Filtrer — du ${fmtDate(fromDate)} au ${fmtDate(toDate)}`
            : `Filtrer — ${fmtDate(date)} à ${fmtTime(time)}`}
        </AppText>
      </Pressable>
    </View>
  );
}

function PulsingLiveDot({ size = 8 }: { size?: number }) {
  const scale = useRef(new Animated.Value(1)).current;
  const ring = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    const pulse = Animated.loop(
      Animated.sequence([
        Animated.timing(scale, {
          toValue: 1.4,
          duration: 600,
          easing: Easing.out(Easing.ease),
          useNativeDriver: true,
        }),
        Animated.timing(scale, {
          toValue: 1,
          duration: 600,
          easing: Easing.inOut(Easing.ease),
          useNativeDriver: true,
        }),
      ]),
    );
    const ripple = Animated.loop(
      Animated.sequence([
        Animated.timing(ring, {
          toValue: 1,
          duration: 1000,
          easing: Easing.out(Easing.ease),
          useNativeDriver: true,
        }),
        Animated.delay(300),
      ]),
    );
    pulse.start();
    ripple.start();
    return () => {
      pulse.stop();
      ripple.stop();
    };
  }, [scale, ring]);

  const ringScale = ring.interpolate({ inputRange: [0, 1], outputRange: [1, 2.6] });
  const ringOpacity = ring.interpolate({ inputRange: [0, 1], outputRange: [0.5, 0] });

  const box = { width: size, height: size, borderRadius: size / 2 };
  const dotColor = palette.green[500];

  return (
    <View style={{ width: size * 2.6, height: size * 2.6, alignItems: 'center', justifyContent: 'center' }}>
      <Animated.View
        pointerEvents='none'
        style={[box, {
          position: 'absolute',
          borderWidth: 1.5,
          borderColor: dotColor,
          opacity: ringOpacity,
          transform: [{ scale: ringScale }],
        }]} />
      <Animated.View style={[box, { backgroundColor: dotColor, transform: [{ scale }] }]} />
    </View>
  );
}

const styles = StyleSheet.create({
  dateBar: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    marginTop: 10,
    marginBottom: 4,
  },
  dateArrow: {
    width: 40,
    height: 40,
    borderRadius: radii.pill,
    backgroundColor: palette.surface,
    borderWidth: 1,
    borderColor: palette.border,
    alignItems: 'center',
    justifyContent: 'center',
  },
  dateArrowPressed: { transform: [{ scale: 0.96 }], opacity: 0.7 },
  dateArrowDisabled: { opacity: 0.35 },
  datePill: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingHorizontal: 12,
    paddingVertical: 7,
    borderRadius: radii.pill,
    backgroundColor: palette.surface,
    borderWidth: 1,
    borderColor: palette.border,
  },
  datePillPressed: { transform: [{ scale: 0.98 }], opacity: 0.85 },
  datePillSep: { width: 1, height: 16, backgroundColor: palette.border, marginHorizontal: 2 },
  datePillText: { maxWidth: 175 },
  orientRow: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'center',
    paddingHorizontal: 16, marginBottom: 4,
  },
  orientChip: {
    flexDirection: 'row', alignItems: 'center', gap: 6,
    borderRadius: radii.pill, paddingHorizontal: 12, paddingVertical: 5,
    backgroundColor: palette.surfaceAlt, borderWidth: 1, borderColor: palette.border,
  },
  orientChipFiltered: { backgroundColor: palette.amber[50], borderColor: palette.amber[200] },
  orientText: { flexShrink: 1, maxWidth: 240 },
  orientReset: {
    flexDirection: 'row', alignItems: 'center', gap: 4,
    backgroundColor: palette.surface, borderRadius: radii.pill, borderWidth: 1, borderColor: palette.brand[100],
    paddingHorizontal: 8, paddingVertical: 3,
  },
  orientResetPressed: { opacity: 0.7, transform: [{ scale: 0.97 }] },
});