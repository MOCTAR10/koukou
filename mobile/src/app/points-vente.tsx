import React, { useEffect, useMemo, useState } from 'react';
import { Alert, Image, Pressable, StyleSheet, Text, TextInput, View, type TextInputProps } from 'react-native';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { ArrowRightLeft, Check, ChevronDown, Map as MapIcon, MapPin, Plus, Star, Store, Trash2, TrendingUp, X } from 'lucide-react-native';

import { AppText } from '@/components/ui/AppText';
import { Button } from '@/components/ui/Button';
import { Card } from '@/components/ui/Card';
import { EmptyState } from '@/components/ui/EmptyState';
import { Screen, ScreenHeader } from '@/components/ui/Screen';
import { Sheet } from '@/components/ui/Sheet';
import { Spinner } from '@/components/ui/Spinner';
import { useAuth } from '@/auth/AuthContext';
import { fetchStockTransfers, fetchPointsOfSale, fetchSales } from '@/api';
import { invalidateFarmQueries } from '@/api/invalidate';
import type { PointOfSaleInput } from '@/api/mutations';
import { todayStr } from '@/api/mutations';
import { createPointOfSaleQueued, deletePointOfSaleQueued, updatePointOfSaleQueued } from '@/offline/engine';
import { transferRemaining } from '@/components/pos/catalog';
import { canManageFarm } from '@/api/roles';
import type { PointOfSale, SaleSummary } from '@/api/types';
import { color, palette, radii, spacing, fmt, fmtFcfa } from '@/constants/theme';
import { GABON_PROVINCES } from '@/constants/gabon';
import { geocodeGabonAddress, suggestGabonAddress, type GeoSuggest } from '@/utils/geocode';

function addDaysIso(iso: string, days: number): string {
  const [y, m, d] = iso.split('-').map(Number);
  return new Date(Date.UTC(y, m - 1, d + days)).toISOString().slice(0, 10);
}

type PeriodKey = 'today' | 'week' | 'month';

const PERIODS: { key: PeriodKey; label: string }[] = [
  { key: 'today', label: 'Aujourd’hui' },
  { key: 'week', label: '7 j' },
  { key: 'month', label: '30 j' },
];

const PERIOD_LABEL: Record<PeriodKey, string> = { today: 'aujourd’hui', week: '7 jours', month: '30 jours' };

const PRODUCT_BUCKET: Record<string, string> = {
  POULET_PIECE: 'Vivant',
  POULET_KG: 'Vivant',
  ABATTU_PIECE: 'Abattu',
  ABATTU_KG: 'Abattu',
  OEUFS: 'Œufs',
  PROVENDE: 'Provende',
  AUTRE: 'Autre',
};

interface PdvRangeStats {
  revenue: number;
  count: number;
  products: Record<string, number>;
}

type PdvStats = Record<PeriodKey, PdvRangeStats>;

const emptyRange = (): PdvRangeStats => ({ revenue: 0, count: 0, products: {} });
const emptyStats = (): PdvStats => ({ today: emptyRange(), week: emptyRange(), month: emptyRange() });

function FieldLabel({ children }: { children: React.ReactNode }) {
  return (
    <AppText size="label" color="muted" style={{ letterSpacing: 0.8, marginBottom: 8 }}>
      {children}
    </AppText>
  );
}

function IconInput({
  icon,
  value,
  onChangeText,
  placeholder,
  autoCapitalize,
}: {
  icon: React.ReactNode;
  value: string;
  onChangeText: (t: string) => void;
  placeholder: string;
  autoCapitalize?: TextInputProps['autoCapitalize'];
}) {
  return (
    <View style={styles.inputWrap}>
      <View style={styles.inputIcon}>{icon}</View>
      <TextInput
        value={value}
        onChangeText={onChangeText}
        placeholder={placeholder}
        placeholderTextColor={color.ink[300]}
        style={styles.input}
        autoCapitalize={autoCapitalize}
      />
    </View>
  );
}

function StatusTile({
  label,
  hint,
  selected,
  onPress,
}: {
  label: string;
  hint: string;
  selected: boolean;
  onPress: () => void;
}) {
  return (
    <Pressable
      onPress={onPress}
      accessibilityRole="button"
      style={[styles.statusTile, selected ? styles.statusTileOn : styles.statusTileOff]}>
      <View style={[styles.statusCheck, selected ? styles.statusCheckOn : styles.statusCheckOff]}>
        {selected ? <Check size={14} color="#ffffff" strokeWidth={3} /> : null}
      </View>
      <View style={{ flex: 1, gap: 1 }}>
        <AppText size="small" weight="semibold" color={selected ? 'success' : 'muted'}>
          {label}
        </AppText>
        <AppText size="caption" color="faint">
          {hint}
        </AppText>
      </View>
    </Pressable>
  );
}

function AddressSearchSheet({
  visible,
  province,
  onPick,
  onManual,
  onClose,
}: {
  visible: boolean;
  province?: string | null;
  onPick: (r: GeoSuggest) => void;
  onManual: (text: string) => void;
  onClose: () => void;
}) {
  const [query, setQuery] = useState('');
  const [suggestions, setSuggestions] = useState<GeoSuggest[]>([]);
  const [searching, setSearching] = useState(false);

  useEffect(() => {
    if (!visible) return;
    setQuery('');
    setSuggestions([]);
  }, [visible]);

  useEffect(() => {
    const q = query.trim();
    if (q.length < 3 || !visible) {
      setSuggestions([]);
      setSearching(false);
      return;
    }
    setSearching(true);
    const timer = setTimeout(() => {
      suggestGabonAddress(q, province ?? undefined)
        .then(setSuggestions)
        .catch(() => setSuggestions([]))
        .finally(() => setSearching(false));
    }, 300);
    return () => clearTimeout(timer);
  }, [query, province, visible]);

  return (
    <Sheet
      visible={visible}
      onClose={onClose}
      title="Adresse"
      subtitle={province ? `Recherche · ${province}, Gabon` : 'Recherche sur OpenStreetMap (Gabon)'}
      icon={<MapIcon size={22} color={color.brand[600]} />}
      stickyHeader={
        <View style={styles.inputWrap}>
          <View style={styles.inputIcon}>
            <MapIcon size={18} color={color.ink[400]} />
          </View>
          <TextInput
            value={query}
            onChangeText={setQuery}
            placeholder="Marché, rue, lieu-dit, quartier…"
            placeholderTextColor={color.ink[300]}
            style={styles.input}
            autoFocus
            autoCorrect={false}
          />
          {query.length > 0 ? (
            <Pressable onPress={() => setQuery('')} style={styles.inputIcon}>
              <X size={16} color={color.ink[400]} />
            </Pressable>
          ) : null}
        </View>
      }
      footer={
        <Button
          label="Ajouter cette adresse manuellement"
          tone="ghost"
          size="md"
          disabled={query.trim().length === 0}
          onPress={() => onManual(query.trim())}
        />
      }>
      <View style={{ gap: spacing.sm }}>
        {searching ? <Spinner label="Recherche…" /> : null}
        {suggestions.length > 0 ? (
          <View style={styles.suggestWrap}>
            {suggestions.map((s) => (
              <Pressable
                key={`${s.latitude}-${s.longitude}-${s.label}`}
                onPress={() => onPick(s)}
                accessibilityRole="button"
                style={styles.suggestRow}>
                <MapPin size={14} color={color.accent[600]} />
                <View style={{ flex: 1, gap: 1 }}>
                  <AppText size="small" weight="semibold" color="text" numberOfLines={1}>
                    {s.label.split(',')[0]}
                  </AppText>
                  <AppText size="caption" color="muted" numberOfLines={2}>
                    {s.label}
                  </AppText>
                </View>
              </Pressable>
            ))}
          </View>
        ) : !searching && query.trim().length >= 3 ? (
          <View style={styles.suggestEmpty}>
            <AppText size="small" color="muted">
              Aucun résultat pour « {query.trim()} » — utilisez le bouton ci-dessous pour saisir manuellement.
            </AppText>
          </View>
        ) : !searching ? (
          <AppText size="caption" color="faint">
            Tapez au moins 3 lettres pour rechercher (rue, marché, quartier, ville…).
          </AppText>
        ) : null}
      </View>
    </Sheet>
  );
}

function PdvForm({
  initial,
  onClose,
}: {
  initial?: PointOfSale;
  onClose: () => void;
}) {
  const { farmId } = useAuth();
  const queryClient = useQueryClient();
  const [name, setName] = useState(initial?.name ?? '');
  const kind: 'FERME' | 'BOUTIQUE' = initial?.kind ?? 'BOUTIQUE';
  const [address, setAddress] = useState(initial?.address ?? '');
  const [province, setProvince] = useState<string | null>(initial?.province ?? null);
  const [provinceSheetOpen, setProvinceSheetOpen] = useState(false);
  const [addressSheetOpen, setAddressSheetOpen] = useState(false);
  const [latitude, setLatitude] = useState<number | null>(initial?.latitude ?? null);
  const [longitude, setLongitude] = useState<number | null>(initial?.longitude ?? null);
  const [activity, setActivity] = useState(initial?.isActive ?? true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const submit = async () => {
    if (!name.trim()) {
      setError('Nom du point de vente requis.');
      return;
    }
    setBusy(true);
    setError(null);
    const input: PointOfSaleInput = {
      name: name.trim(),
      kind,
      isActive: activity,
      ...(address.trim() ? { address: address.trim() } : {}),
      ...(province ? { province } : {}),
    };
    if (latitude != null && longitude != null) {
      input.latitude = latitude;
      input.longitude = longitude;
    }
    try {
      if (latitude == null || longitude == null) {
        const geo = await geocodeGabonAddress({ province: province ?? undefined, address: address.trim() }).catch(() => null);
        if (geo) {
          input.latitude = geo.latitude;
          input.longitude = geo.longitude;
        }
      }
      const res = initial
        ? await updatePointOfSaleQueued(farmId, initial.id, input)
        : await createPointOfSaleQueued(farmId, input);
      invalidateFarmQueries(queryClient, { farmId });
      onClose();
      if (res.status === 'queued') {
        setBusy(false);
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Erreur lors de l’enregistrement.');
      setBusy(false);
    }
  };

  const isBoutique = kind === 'BOUTIQUE';
  const isDefault = initial?.isDefault === true;
  const kindBg = isBoutique ? palette.accent[50] : palette.brand[50];

  const onAddressPick = (r: GeoSuggest) => {
    setAddress(r.label);
    setLatitude(r.latitude);
    setLongitude(r.longitude);
    setAddressSheetOpen(false);
  };

  const onAddressManual = (text: string) => {
    setAddress(text);
    setLatitude(null);
    setLongitude(null);
    setAddressSheetOpen(false);
  };

  return (
    <View style={{ gap: spacing.md }}>
      <Card tone={isBoutique ? 'accent' : 'brand'} padding={false} style={styles.hintCard}>
        <View style={[styles.hintIcon, { backgroundColor: kindBg }]}>
          <AppText>{isBoutique ? '🏪' : '🏡'}</AppText>
        </View>
        <View style={{ flex: 1, gap: 2 }}>
          <AppText size="small" weight="semibold" color={isBoutique ? 'accent' : 'brand'}>
            {isDefault ? 'Ferme — point de vente mère' : 'Point de vente — rattaché à la ferme'}
          </AppText>
          <AppText size="caption" color="muted">
            {isDefault
              ? 'Un seul par exploitation — toujours actif.'
              : 'Point de vente autonome : mêmes produits que la ferme, + transferts de stock (abattu, œufs, provende).'}
          </AppText>
        </View>
      </Card>

      <View style={styles.formSection}>
        <FieldLabel>IDENTITÉ</FieldLabel>
        <IconInput
          icon={<Store size={18} color={color.ink[400]} />}
          value={name}
          onChangeText={setName}
          placeholder={isDefault ? 'Ex. Ferme KouKou' : 'Ex. Point de vente Occéan'}
          autoCapitalize="words"
        />
        <FieldLabel>LOCALISATION</FieldLabel>
        <Pressable
          onPress={() => setProvinceSheetOpen(true)}
          accessibilityRole="button"
          style={styles.inputWrap}>
          <View style={styles.inputIcon}>
            <MapPin size={18} color={color.ink[400]} />
          </View>
          <View style={{ flex: 1, justifyContent: 'center', height: 42, paddingLeft: 10 }}>
            <AppText size="body" color={province ? 'text' : 'muted'} numberOfLines={1}>
              {province || 'Province — ex. Estuaire'}
            </AppText>
          </View>
          <View style={styles.inputIcon}>
            <ChevronDown size={18} color={color.ink[400]} />
          </View>
        </Pressable>
        <Pressable
          onPress={() => setAddressSheetOpen(true)}
          accessibilityRole="button"
          style={styles.inputWrap}>
          <View style={styles.inputIcon}>
            <MapIcon size={18} color={color.ink[400]} />
          </View>
          <View style={{ flex: 1, justifyContent: 'center', height: 42, paddingLeft: 10 }}>
            <AppText size="body" color={address ? 'text' : 'muted'} numberOfLines={1}>
              {address || 'Adresse — rue, marché, repère'}
            </AppText>
          </View>
          {latitude != null && longitude != null ? (
            <Check size={16} color={palette.green[600]} style={styles.inputIcon} />
          ) : (
            <ChevronDown size={18} color={color.ink[400]} style={styles.inputIcon} />
          )}
        </Pressable>
      </View>

      <Sheet
        visible={provinceSheetOpen}
        onClose={() => setProvinceSheetOpen(false)}
        title="Province"
        subtitle="Sélectionnez la province au Gabon"
        icon={<MapPin size={22} color={color.brand[600]} />}>
        <View style={{ gap: spacing.sm }}>
          {GABON_PROVINCES.map((p) => (
            <Pressable
              key={p.name}
              onPress={() => {
                setProvince(p.name);
                setProvinceSheetOpen(false);
              }}
              accessibilityRole="button"
              style={[
                styles.inputWrap,
                province === p.name ? { borderColor: palette.brand[600], backgroundColor: palette.brand[50] } : undefined,
              ]}>
              <View style={{ flex: 1, gap: 1, paddingLeft: 14, height: 42, justifyContent: 'center' }}>
                <AppText size="body" weight={province === p.name ? 'bold' : 'semibold'} color={province === p.name ? 'brand' : 'text'}>
                  {p.name}
                </AppText>
                <AppText size="caption" color="muted">
                  {p.capital}
                </AppText>
              </View>
              {province === p.name ? (
                <Check size={18} color={palette.brand[600]} style={{ paddingRight: 14 }} />
              ) : (
                <View style={{ width: 18, paddingRight: 14 }} />
              )}
            </Pressable>
          ))}
        </View>
      </Sheet>

      <AddressSearchSheet
        visible={addressSheetOpen}
        province={province}
        onPick={onAddressPick}
        onManual={onAddressManual}
        onClose={() => setAddressSheetOpen(false)}
      />

      {isDefault ? (
        <View style={styles.gpsNote}>
          <Check size={14} color={palette.green[600]} />
          <AppText size="caption" color="muted" style={{ flex: 1 }}>
            Ferme mère : toujours active — non désactivable, non supprimable.
          </AppText>
        </View>
      ) : (
        <View style={styles.formSection}>
          <FieldLabel>ACTIVATION</FieldLabel>
          <View style={styles.statusRow}>
            <StatusTile
              label="Actif"
              hint="Visible dans la caisse"
              selected={activity}
              onPress={() => setActivity(true)}
            />
            <StatusTile
              label="En pause"
              hint="Masqué de la caisse"
              selected={!activity}
              onPress={() => setActivity(false)}
            />
          </View>
        </View>
      )}

      <View style={styles.summaryCard}>
<AppText size="label" color="muted" style={{ letterSpacing: 0.8, marginBottom: 6 }}>
          RÉCAPITULATIF
        </AppText>
        <View style={styles.summaryRow}>
          <AppText size="caption" color="muted">
            Type
          </AppText>
          <AppText size="caption" weight="semibold" color="text">
            {isDefault ? '🏡 Ferme (mère)' : '🏪 Point de vente'}
          </AppText>
        </View>
        <View style={styles.summaryRow}>
          <AppText size="caption" color="muted">
            Produits
          </AppText>
          <AppText size="caption" weight="semibold" color="text" numberOfLines={1} adjustsFontSizeToFit style={{ flexShrink: 1 }}>
            Vivant · abattu · œufs · provende
          </AppText>
        </View>
        <View style={styles.summaryRow}>
          <AppText size="caption" color="muted">
            Lieu
          </AppText>
          <AppText size="caption" weight="semibold" color="text" numberOfLines={1} style={{ flexShrink: 1 }}>
            {province || '—'} · {address.trim() || 'sans adresse'}
          </AppText>
        </View>
        <View style={styles.summaryRow}>
          <AppText size="caption" color="muted">
            Statut
          </AppText>
          <AppText size="caption" weight="semibold" color={activity ? 'success' : 'muted'}>
            {activity ? 'Actif' : 'En pause'}
          </AppText>
        </View>
      </View>

      {error ? (
        <View style={styles.errorBox}>
          <AppText size="small" color="danger">
            {error}
          </AppText>
        </View>
      ) : null}

      <Button
        label={initial ? 'Enregistrer les modifications' : 'Créer le point de vente'}
        tone="accent"
        loading={busy}
        disabled={!name.trim() || busy}
        onPress={() => void submit()}
      />
    </View>
  );
}

export default function PointsVenteScreen() {
  const { farmId, user } = useAuth();
  const queryClient = useQueryClient();
  const canManage = canManageFarm(user.role);

  const today = todayStr();
  const from7 = addDaysIso(today, -6);
  const from30 = addDaysIso(today, -29);

  const pdvQuery = useQuery({ queryKey: ['points-of-sale', farmId], queryFn: () => fetchPointsOfSale(farmId) });
  const salesTodayQuery = useQuery({ queryKey: ['sales', farmId, today, today], queryFn: () => fetchSales(farmId, today, today) });
  const salesWeekQuery = useQuery({ queryKey: ['sales', farmId, from7, today], queryFn: () => fetchSales(farmId, from7, today) });
  const salesMonthQuery = useQuery({ queryKey: ['sales', farmId, from30, today], queryFn: () => fetchSales(farmId, from30, today) });
  const transfersQuery = useQuery({ queryKey: ['stock-transfers', farmId], queryFn: () => fetchStockTransfers(farmId) });

  const [formOpen, setFormOpen] = useState(false);
  const [editing, setEditing] = useState<PointOfSale | undefined>(undefined);
  const [confirmDelete, setConfirmDelete] = useState<PointOfSale | null>(null);
  const [deleting, setDeleting] = useState(false);
  const [filterStatus, setFilterStatus] = useState<'ALL' | 'ACTIVE' | 'PAUSED'>('ALL');
  const [filterProvince, setFilterProvince] = useState<string | null>(null);
  const [provinceFilterOpen, setProvinceFilterOpen] = useState(false);
  const [period, setPeriod] = useState<PeriodKey>('week');

  const pdvs = useMemo(() => pdvQuery.data ?? [], [pdvQuery.data]);
  const boutiques = useMemo(() => pdvs.filter((p) => p.kind === 'BOUTIQUE'), [pdvs]);
  const farms = useMemo(() => pdvs.filter((p) => p.kind === 'FERME'), [pdvs]);
  const activeCount = useMemo(() => pdvs.filter((p) => p.isActive).length, [pdvs]);
  const filteredBoutiques = useMemo(
    () =>
      boutiques.filter((p) => {
        if (filterStatus === 'ACTIVE' && !p.isActive) return false;
        if (filterStatus === 'PAUSED' && p.isActive) return false;
        if (filterProvince && p.province !== filterProvince) return false;
        return true;
      }),
    [boutiques, filterStatus, filterProvince],
  );

  const statsByPdv = useMemo(() => {
    const map = new Map<string, PdvStats>();
    const ranges: [PeriodKey, SaleSummary[] | undefined][] = [
      ['today', salesTodayQuery.data],
      ['week', salesWeekQuery.data],
      ['month', salesMonthQuery.data],
    ];
    for (const [rangeKey, sales] of ranges) {
      for (const s of sales ?? []) {
        if (s.status === 'CANCELLED' || !s.pointOfSaleId) continue;
        const entry = map.get(s.pointOfSaleId) ?? emptyStats();
        const range = entry[rangeKey];
        range.revenue += s.totalAmountFcfa;
        range.count += 1;
        for (const it of s.items ?? []) {
          const bucket = PRODUCT_BUCKET[it.productType] ?? 'Autre';
          range.products[bucket] = (range.products[bucket] ?? 0) + it.amountFcfa;
        }
        map.set(s.pointOfSaleId, entry);
      }
    }
    return map;
  }, [salesTodayQuery.data, salesWeekQuery.data, salesMonthQuery.data]);

  const stockByPdv = useMemo(() => {
    const map = new Map<string, { carried: number; remaining: number }>();
    for (const t of transfersQuery.data ?? []) {
      if (t.status !== 'TRANSFERRED') continue;
      const rem = transferRemaining(t.quantity, t.quantitySold);
      if (rem <= 0) continue;
      const cur = map.get(t.pointOfSaleId) ?? { carried: 0, remaining: 0 };
      cur.carried += 1;
      cur.remaining += rem;
      map.set(t.pointOfSaleId, cur);
    }
    return map;
  }, [transfersQuery.data]);

  const weekTotal = useMemo(
    () => pdvs.reduce((a, p) => a + (statsByPdv.get(p.id)?.week.revenue ?? 0), 0),
    [pdvs, statsByPdv],
  );
  const weekCount = useMemo(
    () => pdvs.reduce((a, p) => a + (statsByPdv.get(p.id)?.week.count ?? 0), 0),
    [pdvs, statsByPdv],
  );
  const topPdvToday = useMemo(() => {
    let best: { pdv: PointOfSale; revenue: number } | null = null;
    for (const p of pdvs) {
      const revenue = statsByPdv.get(p.id)?.today.revenue ?? 0;
      if (revenue > 0 && (best === null || revenue > best.revenue)) {
        best = { pdv: p, revenue };
      }
    }
    return best;
  }, [pdvs, statsByPdv]);

  const remove = async () => {
    if (!confirmDelete) return;
    setDeleting(true);
    try {
      const res = await deletePointOfSaleQueued(farmId, confirmDelete.id);
      invalidateFarmQueries(queryClient, { farmId });
      setConfirmDelete(null);
      Alert.alert(
        'Point de vente supprimé',
        res.status === 'queued' ? 'Suppression mise en file, synchronisation en attente.' : 'Le point de vente a été retiré de la liste.',
      );
    } catch (e) {
      setConfirmDelete(null);
      Alert.alert('Suppression impossible', e instanceof Error ? e.message : 'Erreur inattendue.');
    } finally {
      setDeleting(false);
    }
  };

  const openNew = () => {
    setEditing(undefined);
    setFormOpen(true);
  };

  const openEdit = (p: PointOfSale) => {
    setEditing(p);
    setFormOpen(true);
  };

  const renderCard = (p: PointOfSale) => {
    const st = statsByPdv.get(p.id) ?? emptyStats();
    const range = st[period];
    const products = Object.entries(range.products).sort((a, b) => b[1] - a[1]);
    const isBoutique = p.kind === 'BOUTIQUE';
    const accent = isBoutique ? color.accent[600] : color.brand[600];
    const stock = stockByPdv.get(p.id);
    return (
      <Card key={p.id} onPress={() => openEdit(p)} style={styles.pdvCard}>
        <View style={styles.cardHeader}>
          <View style={[styles.emojiTile, { backgroundColor: isBoutique ? palette.accent[50] : palette.brand[50] }]}>
            <AppText>{isBoutique ? '🏪' : '🏡'}</AppText>
          </View>
          <View style={{ flex: 1, gap: 1 }}>
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
              <AppText size="body" weight="bold" color="text" numberOfLines={1} style={{ flexShrink: 1 }}>
                {p.name}
              </AppText>
              {p.isDefault ? <Star size={14} color={color.amber[500]} fill={color.amber[400]} /> : null}
            </View>
            <AppText size="caption" color="muted" numberOfLines={1}>
              {[p.province, p.address].filter(Boolean).join(' · ') || '—'}
            </AppText>
          </View>
          <View style={{ alignItems: 'flex-end', gap: 4 }}>
            <View style={[styles.statusPill, { backgroundColor: p.isActive ? palette.green[50] : palette.surfaceAlt }]}>
              <View style={[styles.statusDot, { backgroundColor: p.isActive ? palette.green[600] : palette.ink[300] }]} />
              <AppText size="small" weight="semibold" color={p.isActive ? 'success' : 'muted'}>
                {p.isActive ? 'Actif' : 'Pause'}
              </AppText>
            </View>
            {!p.isDefault && canManage ? (
              <Pressable
                onPress={() => setConfirmDelete(p)}
                hitSlop={8}
                style={styles.deleteBtn}
                accessibilityRole="button">
                <Trash2 size={15} color={color.red[500]} />
              </Pressable>
            ) : null}
          </View>
        </View>

        <View style={styles.cardDivider} />

        <AppText size="small" color="muted" numberOfLines={1} adjustsFontSizeToFit minimumFontScale={0.85}>
          <Text style={{ fontWeight: '700', color: accent, fontSize: 16 }}>{fmt(range.revenue)} FCFA</Text>
          {'  '}
          {fmt(range.count)} ticket(s) · {PERIOD_LABEL[period]}
        </AppText>

        {range.revenue > 0 && products.length > 0 ? (
          <View style={styles.productRow}>
            {products.slice(0, 4).map(([label, amount]) => (
              <View key={label} style={styles.productChip}>
                <AppText size="caption" weight="semibold" color="brand">
                  {label}
                </AppText>
                <AppText size="caption" color="muted">
                  {fmt(amount)}
                </AppText>
              </View>
            ))}
          </View>
        ) : null}

{isBoutique ? (
            <View style={styles.contextRow}>
              <ArrowRightLeft size={13} color={accent} />
              <AppText size="caption" color={accent} numberOfLines={1} style={{ flexShrink: 1 }}>
                {stock
                  ? `${fmt(stock.remaining)} unité(s) de stock · ${fmt(stock.carried)} transfert(s)`
                  : 'Aucun transfert — transférez du stock depuis la ferme'}
              </AppText>
            </View>
          ) : (
          <View style={styles.contextRow}>
            <AppText size="caption" color="brand" numberOfLines={1} style={{ flexShrink: 1 }}>
              🏡 Mère — vivant, abattu, œufs & provende
            </AppText>
          </View>
        )}
      </Card>
    );
  };

  return (
    <Screen
      header={
        <ScreenHeader
          title="Points de vente"
          subtitle="Vue d’ensemble & gestion"
          back
          left={<Image source={require('@/assets/images/logo-nav.png')} style={styles.headerLogo} accessibilityLabel="Logo KouKou" />}
          right={
            canManage ? (
              <Pressable onPress={openNew} style={styles.addBtn} accessibilityRole="button">
                <Plus size={22} color={color.surface} />
              </Pressable>
            ) : undefined
          }
        />
      }
      bottomPad={96}>
      {pdvQuery.isLoading ? (
        <Spinner label="Chargement des points de vente…" />
      ) : pdvs.length === 0 ? (
        <EmptyState
          emoji="🏪"
          title="Aucun point de vente"
          description="La ferme est votre point de vente mère. Ajoutez ensuite des points de vente partout au Gabon."
          actionLabel={canManage ? 'Créer un point de vente' : undefined}
          onAction={openNew}
        />
      ) : (
        <View style={{ gap: spacing.lg }}>
          <View>
            <AppText size="label" color="muted" style={{ marginBottom: spacing.sm }}>
              FERME MÈRE · {fmt(farms.length)}
            </AppText>
            {farms.length > 0 ? (
              farms.map(renderCard)
            ) : (
              <Card tone="default">
                <AppText size="small" color="muted">
                  Aucune ferme. Le point « ferme » vend directement sur l’exploitation.
                </AppText>
              </Card>
            )}
          </View>

          <Card tone="brand" style={styles.heroCard}>
            <View style={styles.heroTop}>
              <View style={styles.heroIcon}>
                <TrendingUp size={22} color={color.brand[600]} />
              </View>
              <View style={{ flex: 1 }}>
                <AppText size="caption" color="muted">
                  VUE D’ENSEMBLE · {today}
                </AppText>
                <AppText size="h2" weight="bold" color="brand">
                  {fmtFcfa(weekTotal)}
                </AppText>
                <AppText size="caption" color="faint">
                  Revenu 7 jours · {fmt(weekCount)} vente(s)
                </AppText>
              </View>
              <View style={{ gap: 8 }}>
                <View style={styles.heroStat}>
                  <AppText size="small" weight="bold" color="text">
                    {fmt(activeCount)}
                  </AppText>
                  <AppText size="caption" color="muted">
                    actifs
                  </AppText>
                </View>
                <View style={styles.heroStat}>
                  <AppText size="small" weight="bold" color="text">
                    {fmt(boutiques.length)}
                  </AppText>
                  <AppText size="caption" color="muted">
                    rattachés
                  </AppText>
                </View>
              </View>
            </View>
            <View style={styles.heroDivider} />
            <AppText size="small" weight="semibold" color="brand">
              {topPdvToday
                ? `⭐ Meilleur canal aujourd’hui : ${topPdvToday.pdv.name} · ${fmtFcfa(topPdvToday.revenue)}`
                : '⭐ Aucune vente enregistrée aujourd’hui'}
            </AppText>
            <AppText size="caption" color="faint">
              Ferme mère → points de vente rattachés, partout au Gabon · vivant, abattu, œufs & provende — le système conseille sans bloquer.
            </AppText>
          </Card>

          <View style={styles.sectionRow}>
            <AppText size="label" color="muted">
                  POINTS DE VENTE · {fmt(filteredBoutiques.length)}
                </AppText>
            {canManage ? (
              <Pressable onPress={openNew} accessibilityRole="button">
                <AppText size="small" weight="bold" color="accent">
                  + Nouvelle
                </AppText>
              </Pressable>
            ) : null}
          </View>
          <View style={styles.filterRow}>
            {PERIODS.map(({ key, label }) => (
              <Pressable
                key={key}
                onPress={() => setPeriod(key)}
                accessibilityRole="button"
                style={[styles.filterPill, period === key ? styles.filterPillOn : undefined]}>
                <AppText size="small" weight="semibold" color={period === key ? 'surface' : 'muted'}>
                  {label}
                </AppText>
              </Pressable>
            ))}
          </View>
          <View style={styles.filterRow}>
            {([
              ['ALL', 'Tous'],
              ['ACTIVE', 'Actifs'],
              ['PAUSED', 'Pause'],
            ] as const).map(([key, label]) => (
              <Pressable
                key={key}
                onPress={() => setFilterStatus(key)}
                accessibilityRole="button"
                style={[styles.filterPill, filterStatus === key ? styles.filterPillOn : undefined]}>
                <AppText size="small" weight="semibold" color={filterStatus === key ? 'surface' : 'muted'}>
                  {label}
                </AppText>
              </Pressable>
            ))}
            <Pressable
              onPress={() => setProvinceFilterOpen(true)}
              accessibilityRole="button"
              style={[styles.filterPill, filterProvince ? styles.filterPillOn : undefined]}>
              <MapPin size={12} color={filterProvince ? '#ffffff' : color.ink[400]} />
              <AppText size="small" weight="semibold" color={filterProvince ? 'surface' : 'muted'} numberOfLines={1} style={{ flexShrink: 1 }}>
                {filterProvince ?? 'Province'}
              </AppText>
            </Pressable>
            {filterProvince ? (
              <Pressable onPress={() => setFilterProvince(null)} hitSlop={6} accessibilityRole="button" style={{ padding: 4 }}>
                <X size={14} color={color.ink[400]} />
              </Pressable>
            ) : null}
          </View>
          {boutiques.length > 0 ? (
            filteredBoutiques.length > 0 ? (
              filteredBoutiques.map(renderCard)
            ) : (
              <Card tone="default">
                <View style={{ gap: spacing.sm }}>
                  <AppText size="bodyM" weight="semibold" color="text">
                    Aucun point de vente ne correspond aux filtres
                  </AppText>
                  <AppText size="caption" color="muted">
                    Ajustez le statut ou la province pour élargir la liste.
                  </AppText>
                  <Pressable
                    onPress={() => { setFilterStatus('ALL'); setFilterProvince(null); }}
                    accessibilityRole="button">
                    <AppText size="small" weight="bold" color="accent">
                      Réinitialiser les filtres
                    </AppText>
                  </Pressable>
                </View>
              </Card>
            )
          ) : (
            <Card tone="default">
              <View style={{ gap: spacing.sm }}>
                <AppText size="bodyM" weight="semibold" color="text">
                  🏪 Ouvrez un point de vente près de vos clients
                </AppText>
                <AppText size="caption" color="muted">
                  Mêmes produits qu’à la ferme : vivant, abattu, œufs & provende — partout au Gabon.
                </AppText>
                {canManage ? (
                  <Button label="Créer mon premier point de vente" tone="accent" size="md" onPress={openNew} />
                ) : null}
              </View>
            </Card>
          )}
        </View>
      )}

      <Sheet
        visible={provinceFilterOpen}
        onClose={() => setProvinceFilterOpen(false)}
        title="Filtrer par province"
        subtitle="Limitez la liste aux points de vente d’une province"
        icon={<MapPin size={22} color={color.brand[600]} />}>
        <View style={{ gap: spacing.sm }}>
          <Pressable
            onPress={() => { setFilterProvince(null); setProvinceFilterOpen(false); }}
            accessibilityRole="button"
            style={[styles.provRow, filterProvince == null ? styles.provRowOn : undefined]}>
            <View style={{ flex: 1 }}>
              <AppText size="body" weight="semibold" color={filterProvince == null ? 'brand' : 'text'}>
                Toutes les provinces
              </AppText>
              <AppText size="caption" color="muted">
                Afficher les points de vente de tout le pays
              </AppText>
            </View>
            {filterProvince == null ? <Check size={18} color={palette.brand[600]} /> : null}
          </Pressable>
          {GABON_PROVINCES.map((p) => (
            <Pressable
              key={p.name}
              onPress={() => { setFilterProvince(p.name); setProvinceFilterOpen(false); }}
              accessibilityRole="button"
              style={[styles.provRow, filterProvince === p.name ? styles.provRowOn : undefined]}>
              <View style={{ flex: 1, gap: 1 }}>
                <AppText size="body" weight="semibold" color={filterProvince === p.name ? 'brand' : 'text'}>
                  {p.name}
                </AppText>
                <AppText size="caption" color="muted">
                  {p.capital}
                </AppText>
              </View>
              {filterProvince === p.name ? <Check size={18} color={palette.brand[600]} /> : null}
            </Pressable>
          ))}
        </View>
      </Sheet>

      <Sheet
        visible={formOpen}
        onClose={() => setFormOpen(false)}
        title={editing?.isDefault ? 'Modifier la ferme — point de vente mère' : editing ? 'Modifier le point de vente' : 'Nouveau point de vente'}
        subtitle={editing?.isDefault ? 'La ferme elle-même — point de vente unique' : 'Rattaché à la ferme mère — partout au Gabon'}
        icon={editing ? <Store size={22} color={color.brand[600]} /> : <Plus size={22} color={color.brand[600]} />}>
        <PdvForm
          key={editing?.id ?? 'new'}
          initial={editing}
          onClose={() => setFormOpen(false)}
        />
      </Sheet>

      <Sheet visible={confirmDelete != null} onClose={() => setConfirmDelete(null)} title="Supprimer ce point de vente ?" subtitle={confirmDelete?.name}>
        <View style={{ gap: spacing.lg }}>
          <AppText size="body" color="muted">
            Les ventes restent liées au point de vente mais celui-ci disparaîtra de la caisse. La ferme par défaut ne peut pas être supprimée.
          </AppText>
          <Button label="Supprimer définitivement" tone="danger" loading={deleting} onPress={() => void remove()} />
          <Button label="Annuler" tone="ghost" onPress={() => setConfirmDelete(null)} />
        </View>
      </Sheet>
    </Screen>
  );
}

const styles = StyleSheet.create({
  headerLogo: {
    width: 38,
    height: 38,
  },
  inputWrap: {
    flexDirection: 'row',
    alignItems: 'center',
    borderWidth: 1,
    borderColor: palette.border,
    borderRadius: radii.md,
    backgroundColor: color.surface,
  },
  inputIcon: {
    paddingLeft: 12,
  },
  input: {
    flex: 1,
    height: 42,
    paddingHorizontal: 10,
    fontSize: 14,
    color: color.ink[800],
  },
  hintCard: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    marginTop: 0,
    paddingVertical: 8,
    paddingHorizontal: 10,
  },
  hintIcon: {
    width: 34,
    height: 34,
    borderRadius: radii.md,
    alignItems: 'center',
    justifyContent: 'center',
  },
  formSection: {
    gap: spacing.sm,
  },
  gpsNote: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    backgroundColor: palette.surfaceAlt,
    borderRadius: radii.md,
    padding: 10,
  },
  suggestWrap: {
    borderRadius: radii.md,
    borderWidth: 1,
    borderColor: palette.border,
    backgroundColor: color.surface,
    overflow: 'hidden',
  },
  suggestRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    paddingHorizontal: 10,
    paddingVertical: 8,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: palette.border,
  },
  suggestEmpty: {
    backgroundColor: palette.surfaceAlt,
    borderRadius: radii.md,
    padding: 10,
  },
  statusRow: {
    flexDirection: 'row',
    gap: 8,
  },
  statusTile: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    borderWidth: 1,
    borderRadius: radii.md,
    padding: 8,
  },
  statusTileOn: {
    borderColor: palette.green[300],
    backgroundColor: palette.green[50],
  },
  statusTileOff: {
    borderColor: palette.border,
    backgroundColor: color.surface,
  },
  statusCheck: {
    width: 20,
    height: 20,
    borderRadius: 10,
    borderWidth: 2,
    alignItems: 'center',
    justifyContent: 'center',
  },
  statusCheckOn: {
    borderColor: palette.green[500],
    backgroundColor: palette.green[500],
  },
  statusCheckOff: {
    borderColor: palette.ink[300],
    backgroundColor: color.surface,
  },
  summaryCard: {
    backgroundColor: palette.surfaceAlt,
    borderRadius: radii.lg,
    padding: 10,
  },
  summaryRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 12,
    paddingVertical: 2,
  },
  errorBox: {
    backgroundColor: color.red[50],
    padding: 10,
    borderRadius: radii.md,
  },
  pdvCard: {
    marginBottom: spacing.sm,
  },
  deleteBtn: {
    width: 30,
    height: 30,
    borderRadius: radii.sm,
    backgroundColor: color.red[50],
    alignItems: 'center',
    justifyContent: 'center',
  },
  addBtn: {
    width: 36,
    height: 36,
    borderRadius: radii.md,
    backgroundColor: color.accent[500],
    alignItems: 'center',
    justifyContent: 'center',
  },
  filterRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    marginBottom: spacing.xxs,
  },
  filterPill: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    borderWidth: 1,
    borderColor: palette.border,
    borderRadius: radii.pill,
    paddingHorizontal: 10,
    paddingVertical: 5,
  },
  filterPillOn: {
    backgroundColor: color.brand[600],
    borderColor: color.brand[600],
  },
  productRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 6,
    marginTop: 8,
  },
  productChip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
    backgroundColor: palette.surfaceAlt,
    borderRadius: radii.pill,
    paddingHorizontal: 9,
    paddingVertical: 3,
  },
  provRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    borderWidth: 1,
    borderColor: palette.border,
    borderRadius: radii.md,
    padding: 10,
  },
  provRowOn: {
    borderColor: palette.brand[600],
    backgroundColor: palette.brand[50],
  },
  heroCard: {
    gap: 10,
  },
  heroTop: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
  },
  heroIcon: {
    width: 44,
    height: 44,
    borderRadius: radii.md,
    backgroundColor: palette.brand[100],
    alignItems: 'center',
    justifyContent: 'center',
  },
  heroStat: {
    alignItems: 'flex-end',
  },
  heroDivider: {
    height: 1,
    backgroundColor: palette.border,
  },
  cardHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
  },
  emojiTile: {
    width: 40,
    height: 40,
    borderRadius: radii.md,
    alignItems: 'center',
    justifyContent: 'center',
  },
  cardDivider: {
    height: 1,
    backgroundColor: palette.border,
    marginVertical: 10,
  },
  statusPill: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
    borderRadius: radii.pill,
    paddingHorizontal: 10,
    paddingVertical: 4,
  },
  statusDot: {
    width: 7,
    height: 7,
    borderRadius: 4,
  },
  contextRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    marginTop: 6,
  },
  sectionRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginTop: spacing.sm,
  },
});