import React, { useMemo, useState } from 'react';
import { Image, Linking, Pressable, ScrollView, StyleSheet, TextInput, View } from 'react-native';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { ArrowDownWideNarrow, Banknote, Check, ChevronDown, ChevronRight, Pencil, Phone, Plus, Search, UserPlus, UserRound } from 'lucide-react-native';

import { Screen, ScreenHeader } from '@/components/ui/Screen';
import { AppText } from '@/components/ui/AppText';
import { Button } from '@/components/ui/Button';
import { Card } from '@/components/ui/Card';
import { Chip } from '@/components/ui/Chip';
import { PhoneInput } from '@/components/ui/PhoneInput';
import { SectionHeader } from '@/components/ui/SectionHeader';
import { Sheet } from '@/components/ui/Sheet';
import { Spinner } from '@/components/ui/Spinner';
import { CustomerTypeSheet } from '@/components/capture/CustomerTypeSheet';
import { ClientPickerSheet } from '@/components/capture/ClientPickerSheet';
import { useAuth } from '@/auth/AuthContext';
import { fetchCustomerHistory, fetchCustomerStats, fetchCustomers, fetchCustomersSummary, updateCustomer } from '@/api';
import { invalidateFarmQueries } from '@/api/invalidate';
import { createCustomer } from '@/api/mutations';
import { queueCustomerPayment } from '@/offline';
import type { Customer, CustomerSegment, CustomerSummary, CustomerType, SaleFull } from '@/api/types';
import { CUSTOMER_TYPES, customerTypeLabel } from '@/constants/customers';
import { Fonts, color, palette, fmt, fmtFcfa, radii, spacing } from '@/constants/theme';

const SEGMENT_LABEL: Record<CustomerSegment, string> = {
  NOUVEAU: 'Nouveau',
  REGULIER: 'Régulier',
  TOP: 'Top client',
};

const TYPE_HUE: Record<CustomerType, { bg: string; fg: string }> = {
  PARTICULIER: { bg: palette.ink[100], fg: palette.ink[800] },
  RESTAURANT: { bg: palette.accent[100], fg: palette.accent[800] },
  HOTEL: { bg: palette.accent[100], fg: palette.accent[800] },
  EVENEMENT: { bg: palette.accent[100], fg: palette.accent[800] },
  TRAITEUR: { bg: palette.accent[100], fg: palette.accent[800] },
  COMMERCE: { bg: palette.green[100], fg: palette.green[800] },
  REVENDEUR: { bg: palette.green[100], fg: palette.green[800] },
  BOULANGERIE: { bg: palette.green[100], fg: palette.green[800] },
  ELEVEUR: { bg: palette.green[100], fg: palette.green[800] },
  GROSSISTE: { bg: palette.amber[100], fg: palette.amber[800] },
  TRANSFORMATEUR: { bg: palette.amber[100], fg: palette.amber[800] },
  COLLECTIVITE: { bg: palette.brand[100], fg: palette.brand[800] },
  ENTREPRISE: { bg: palette.brand[100], fg: palette.brand[800] },
  ONG: { bg: palette.brand[100], fg: palette.brand[800] },
};

function typeHue(t: CustomerType | null | undefined): { bg: string; fg: string } {
  const key: CustomerType = t && t in TYPE_HUE ? (t as CustomerType) : 'PARTICULIER';
  return TYPE_HUE[key];
}

function SegmentChip({ s }: { s: CustomerSegment }) {
  const tone = s === 'TOP' ? 'green' : s === 'REGULIER' ? 'brand' : 'neutral';
  return <Chip label={SEGMENT_LABEL[s] ?? s} tone={tone} dot />;
}

function TypePill({ t }: { t: CustomerType | null | undefined }) {
  const hue = typeHue(t);
  return (
    <View style={[styles.typePill, { backgroundColor: hue.bg }]}>
      <AppText size="small" weight="semibold" color={hue.fg}>
        {customerTypeLabel(t)}
      </AppText>
    </View>
  );
}

function KpiHero({ summary }: { summary: CustomerSummary }) {
  const totalInvoiced = summary.totalInvoicedFcfa ?? 0;
  const paid = summary.paidFcfa ?? 0;
  const outstanding = summary.totalOutstandingFcfa ?? 0;
  const rate = totalInvoiced > 0 ? Math.min(1, paid / totalInvoiced) : 0;
  return (
    <View style={styles.hero}>
      <View style={styles.heroCols}>
        <View style={styles.heroCol}>
          <AppText size="label" style={{ color: palette.brand[200] }}>
            PORTEFEUILLE
          </AppText>
          <AppText size="h1" weight="bold" style={{ color: palette.surface }}>
            {summary.total}
          </AppText>
          <AppText size="caption" style={{ color: palette.brand[200] }}>
            clients enregistrés
          </AppText>
        </View>
        <View style={styles.heroDivider} />
        <View style={styles.heroCol}>
          <AppText size="label" style={{ color: palette.brand[200] }}>
            À RECOUVRER
          </AppText>
          <AppText size="h2" weight="bold" style={{ color: outstanding > 0 ? palette.accent[300] : palette.green[300] }}>
            {fmt(outstanding)}
          </AppText>
          <AppText size="caption" style={{ color: palette.brand[200] }}>
            {summary.debtors ?? 0} débiteur(s)
          </AppText>
        </View>
        <View style={styles.heroDivider} />
        <View style={styles.heroCol}>
          <AppText size="label" style={{ color: palette.brand[200] }}>
            RECOUVRÉ
          </AppText>
          <AppText size="h2" weight="bold" style={{ color: palette.surface }}>
            {totalInvoiced > 0 ? `${Math.round(rate * 100)} %` : '—'}
          </AppText>
          <AppText size="caption" style={{ color: palette.brand[200] }}>
            {fmt(paid)} FCFA encaissés
          </AppText>
        </View>
      </View>
      <View style={styles.heroBar}>
        <View style={[styles.heroBarFill, { width: `${Math.round(rate * 100)}%` }]} />
      </View>
      <View style={styles.heroSegments}>
        <SegmentPill label="Nouveau" count={summary.bySegment.NOUVEAU} />
        <SegmentPill label="Régulier" count={summary.bySegment.REGULIER} />
        <SegmentPill label="Top" count={summary.bySegment.TOP} />
      </View>
    </View>
  );
}

function SegmentPill({ label, count }: { label: string; count: number }) {
  return (
    <View style={styles.segPill}>
      <AppText size="caption" weight="semibold" style={{ color: palette.brand[200] }}>
        {label}
      </AppText>
      <AppText size="bodyM" weight="bold" style={{ color: palette.surface }}>
        {count}
      </AppText>
    </View>
  );
}

function FilterChip({
  label,
  count,
  active,
  onPress,
}: {
  label: string;
  count: number;
  active: boolean;
  onPress: () => void;
}) {
  return (
    <Pressable onPress={onPress} accessibilityRole="button">
      <Chip label={`${label} (${count})`} tone={active ? 'brand' : 'neutral'} selected={active} />
    </Pressable>
  );
}

function CreateClientSheet({
  visible,
  busy,
  error,
  name,
  phone,
  city,
  createType,
  onName,
  onPhone,
  onCity,
  onPickType,
  onClose,
  onSubmit,
}: {
  visible: boolean;
  busy: boolean;
  error: string | null;
  name: string;
  phone: string;
  city: string;
  createType: CustomerType;
  onName: (v: string) => void;
  onPhone: (v: string) => void;
  onCity: (v: string) => void;
  onPickType: () => void;
  onClose: () => void;
  onSubmit: () => void;
}) {
  return (
    <Sheet
      visible={visible}
      title="Nouveau client"
      subtitle="La fiche sera rattachée au point de vente."
      icon={<UserPlus size={20} color={palette.brand[600]} />}
      accentColor={palette.brand[600]}
      onClose={onClose}
      footer={
        <Button
          label="Créer la fiche"
          tone="brand"
          icon={UserPlus}
          onPress={onSubmit}
          disabled={busy || !name.trim()}
          loading={busy}
        />
      }>
      <View style={styles.sheetFields}>
        <TextInput
          value={name}
          onChangeText={onName}
          placeholder="Nom complet (restaurant, revendeur…)"
          placeholderTextColor={color.ink[300]}
          style={styles.input}
          autoFocus
          editable={!busy}
        />
        <PhoneInput value={phone} onChangeText={onPhone} compact editable={!busy} />
        <TextInput
          value={city}
          onChangeText={onCity}
          placeholder="Ville (optionnel)"
          placeholderTextColor={color.ink[300]}
          style={styles.input}
          editable={!busy}
        />
        <Pressable onPress={onPickType} style={styles.typeRow} accessibilityRole="button">
          <View style={{ flex: 1, gap: 1 }}>
            <AppText size="label" color="muted">
              TYPE DE CLIENT
            </AppText>
            <AppText size="body" weight="semibold" color="brand">
              {customerTypeLabel(createType)}
            </AppText>
          </View>
          <ChevronRight size={16} color={color.brand[600]} />
        </Pressable>
        <AppText size="caption" color="faint">
          Le type est indicatif. Le crédit éventuel se décide au moment de l’encaissement.
        </AppText>
        {error ? (
          <AppText size="small" color="danger">
            {error}
          </AppText>
        ) : null}
      </View>
    </Sheet>
  );
}

function HistoryItem({ s }: { s: SaleFull }) {
  return (
    <View style={styles.histRow}>
      <View style={{ flex: 1, gap: 1 }}>
        <AppText size="body" weight="semibold" color="text">
          {s.referenceNumber}
        </AppText>
        <AppText size="caption" color="muted">
          {s.saleDate?.slice(0, 10)} · {s.items.map((i) => `${i.label} × ${i.quantity}`).join(', ')}
        </AppText>
      </View>
      <AppText size="body" weight="bold" color="text">
        {fmtFcfa(s.totalAmountFcfa)}
      </AppText>
    </View>
  );
}

function RowRow({ label, value, warn }: { label: string; value: string; warn?: boolean }) {
  return (
    <View style={{ flex: 1, gap: 2 }}>
      <AppText size="small" color="muted">
        {label}
      </AppText>
      <AppText size="small" weight="semibold" color={warn ? 'warn' : 'text'}>
        {value}
      </AppText>
    </View>
  );
}

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <View style={{ flex: 1, gap: 2 }}>
      <AppText size="bodyM" weight="bold" color="text">
        {value}
      </AppText>
      <AppText size="caption" color="muted">
        {label}
      </AppText>
    </View>
  );
}

function QuickChip({ label, onPress }: { label: string; onPress: () => void }) {
  return (
    <Pressable onPress={onPress} style={styles.quickChip} accessibilityRole="button">
      <AppText size="small" weight="bold" color="brand">
        {label}
      </AppText>
    </Pressable>
  );
}

function CollectSheet({
  visible,
  customer,
  value,
  busy,
  error,
  result,
  onValue,
  onSubmit,
  onPickCustomer,
  onClose,
}: {
  visible: boolean;
  customer: Customer | null;
  value: string;
  busy: boolean;
  error: string | null;
  result: 'sent' | 'queued' | null;
  onValue: (v: string) => void;
  onSubmit: () => void;
  onPickCustomer: () => void;
  onClose: () => void;
}) {
  const due = customer?.balance?.outstandingFcfa ?? 0;
  const parsed = parseInt(value.replace(/\D/g, ''), 10);
  const amount = Number.isFinite(parsed) ? parsed : 0;
  const remaining = due - amount;

  if (result) {
    return (
      <Sheet visible={visible} onClose={onClose}>
        <View style={styles.savedWrap}>
          <View style={styles.checkCircle}>
            <Check size={48} color={palette.green[600]} strokeWidth={3} />
          </View>
          <AppText size="h3" weight="bold" color="text">
            Encaissement enregistré
          </AppText>
          <AppText size="caption" color="muted">
            {fmtFcfa(amount)} FCFA · {customer?.fullName ?? ''}
          </AppText>
          <AppText size="caption" color="faint">
            {result === 'queued' ? 'En attente de synchronisation' : 'Ajouté à la caisse journalière'}
          </AppText>
          <View style={{ width: '100%', marginTop: spacing.md }}>
            <Button label="Fermer" tone="ghost" onPress={onClose} />
          </View>
        </View>
      </Sheet>
    );
  }

  return (
    <Sheet
      visible={visible}
      title="Encaisser"
      icon={<Banknote size={20} color={palette.green[600]} />}
      accentColor={palette.green[600]}
      onClose={onClose}
      footer={
        <Button
          label={`Encaisser ${fmt(amount)} FCFA`}
          tone="success"
          icon={Banknote}
          onPress={onSubmit}
          disabled={busy || !customer || amount <= 0 || amount > due}
          loading={busy}
        />
      }>
      <View style={styles.sheetFields}>
        <SectionHeader
          title="Client"
          right={
            <Pressable onPress={onPickCustomer} hitSlop={6} accessibilityRole="button">
              <AppText size="small" weight="bold" color="brand">
                {customer ? 'Changer' : 'Choisir un client'}
              </AppText>
            </Pressable>
          }
        />
        {customer ? (
          <Card tone="brand" style={styles.collectClient}>
            <View style={styles.avatar}>
              <Image source={require('@/assets/images/logo-white.png')} style={styles.avatarLogo} accessibilityLabel="Logo KouKou" />
            </View>
            <View style={{ flex: 1, gap: 1 }}>
              <AppText size="bodyM" weight="semibold" color="text" numberOfLines={1}>
                {customer.fullName}
              </AppText>
              <AppText size="caption" color="muted" numberOfLines={1}>
                {[customer.code, customerTypeLabel(customer.type), customer.phone].filter(Boolean).join(' · ') || 'Aucun contact'}
              </AppText>
            </View>
            <View style={{ alignItems: 'flex-end', gap: 1 }}>
              <AppText size="small" weight="semibold" color="muted">
                Dû
              </AppText>
              <AppText size="bodyM" weight="bold" color={due > 0 ? 'danger' : 'success'}>
                {fmtFcfa(due)}
              </AppText>
            </View>
          </Card>
        ) : (
          <Pressable onPress={onPickCustomer} style={styles.collectPick} accessibilityRole="button">
            <AppText size="small" weight="semibold" color="brand">
              Choisir un client pour encaisser une dette
            </AppText>
          </Pressable>
        )}

        <SectionHeader title="Espèces reçues" />
        <View style={styles.cashRow}>
          <TextInput
            value={value}
            onChangeText={onValue}
            placeholder="Montant reçu (FCFA)"
            placeholderTextColor={color.ink[300]}
            keyboardType="number-pad"
            style={[styles.input, { flex: 1 }]}
            editable={!busy && customer !== null}
            autoFocus
          />
        </View>
        {due > 0 && customer ? (
          <View style={styles.quickRow}>
            <QuickChip label="25 %" onPress={() => onValue(String(Math.round((due * 25) / 100)))} />
            <QuickChip label="50 %" onPress={() => onValue(String(Math.round((due * 50) / 100)))} />
            <QuickChip label="75 %" onPress={() => onValue(String(Math.round((due * 75) / 100)))} />
            <QuickChip label="Tout" onPress={() => onValue(String(due))} />
          </View>
        ) : null}
        <View style={styles.recRow}>
          <AppText size="caption" color="muted">
            Le montant est réparti sur les ventes impayées les plus anciennes.
          </AppText>
          {amount > 0 && amount <= due ? (
            <AppText size="small" weight="semibold" color={remaining === 0 ? 'success' : 'muted'}>
              {remaining === 0 ? 'Soldé 🎉' : `Restant ${fmtFcfa(remaining)}`}
            </AppText>
          ) : null}
        </View>
        {error ? (
          <AppText size="small" color="danger">
            {error}
          </AppText>
        ) : null}
      </View>
    </Sheet>
  );
}

export default function ClientsScreen() {
  const { farms, farmId } = useAuth();
  const queryClient = useQueryClient();

  const [search, setSearch] = useState('');
  const [typeFilter, setTypeFilter] = useState<'TOUS' | CustomerType>('TOUS');
  const [segmentFilter, setSegmentFilter] = useState<'TOUS' | CustomerSegment>('TOUS');
  const [debtState, setDebtState] = useState<'TOUS' | 'DUES' | 'SOLVES'>('TOUS');
  const [sortKey, setSortKey] = useState<'name' | 'due'>('name');
  const [openId, setOpenId] = useState<string | null>(null);

  // ── Création (bottom sheet) ──
  const [createOpen, setCreateOpen] = useState(false);
  const [name, setName] = useState('');
  const [phone, setPhone] = useState('');
  const [city, setCity] = useState('');
  const [createType, setCreateType] = useState<CustomerType>('PARTICULIER');
  const [typeSheetOpen, setTypeSheetOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // ── Reclassement d'une fiche existante ──
  const [editTarget, setEditTarget] = useState<Customer | null>(null);
  const [editType, setEditType] = useState<CustomerType>(editTarget?.type ?? 'PARTICULIER');
  const [editSheetOpen, setEditSheetOpen] = useState(false);

  // ── Encaissement depuis la fiche (bottom sheet) ──
  const [collectTarget, setCollectTarget] = useState<Customer | null>(null);
  const [collectInput, setCollectInput] = useState('');
  const [collectBusy, setCollectBusy] = useState(false);
  const [collectError, setCollectError] = useState<string | null>(null);
  const [collectResult, setCollectResult] = useState<'sent' | 'queued' | null>(null);
  const [collectPickerOpen, setCollectPickerOpen] = useState(false);

  const customersQuery = useQuery({
    queryKey: ['customers', farmId, typeFilter, search],
    queryFn: () => fetchCustomers(farmId, { search, type: typeFilter === 'TOUS' ? undefined : typeFilter }),
  });
  const summaryQuery = useQuery({
    queryKey: ['customers-summary', farmId],
    queryFn: () => fetchCustomersSummary(farmId),
  });

  const statsQuery = useQuery({
    queryKey: ['customer-stats', farmId, openId ?? ''],
    queryFn: () => fetchCustomerStats(farmId, openId!),
    enabled: openId !== null,
  });
  const historyQuery = useQuery({
    queryKey: ['customer-history', farmId, openId ?? ''],
    queryFn: () => fetchCustomerHistory(farmId, openId!),
    enabled: openId !== null,
  });

  const add = async () => {
    if (!name.trim()) return;
    setError(null);
    setBusy(true);
    try {
      await createCustomer(farmId, {
        fullName: name.trim(),
        ...(phone.trim() ? { phone: phone.trim() } : {}),
        ...(city.trim() ? { city: city.trim() } : {}),
        type: createType,
      });
      setName('');
      setPhone('');
      setCity('');
      setCreateType('PARTICULIER');
      setCreateOpen(false);
      await invalidateFarmQueries(queryClient, { farmId });
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Erreur lors de la création du client.');
    } finally {
      setBusy(false);
    }
  };

  const saveType = async (type: CustomerType) => {
    if (!editTarget) return;
    if (type === editTarget.type) return;
    try {
      await updateCustomer(farmId, editTarget.id, { type });
      await invalidateFarmQueries(queryClient, { farmId });
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Erreur lors du changement de type.');
    }
  };

  const openCollect = (c: Customer) => {
    setCollectTarget(c);
    setCollectInput(String(c.balance?.outstandingFcfa ?? 0));
    setCollectError(null);
    setCollectResult(null);
  };

  const pickCollectTarget = (c: Customer | null) => {
    if (c) {
      setCollectTarget(c);
      setCollectInput(String(c.balance?.outstandingFcfa ?? 0));
      setCollectError(null);
      setCollectResult(null);
    }
    setCollectPickerOpen(false);
  };

  const doCollect = async () => {
    if (!collectTarget) return;
    const due = collectTarget.balance?.outstandingFcfa ?? 0;
    const parsed = parseInt(collectInput.replace(/\D/g, ''), 10);
    const amount = Number.isFinite(parsed) ? parsed : 0;
    if (amount <= 0) {
      setCollectError('Saisissez un montant supérieur à zéro.');
      return;
    }
    if (amount > due) {
      setCollectError(`Le montant dépasse le solde dû (${fmtFcfa(due)} FCFA).`);
      return;
    }
    setCollectBusy(true);
    setCollectError(null);
    try {
      const res = await queueCustomerPayment(farmId, collectTarget.id, amount);
      await invalidateFarmQueries(queryClient, { farmId });
      setCollectResult(res.status === 'sent' ? 'sent' : 'queued');
    } catch (e) {
      setCollectError(e instanceof Error ? e.message : 'Erreur lors de l’encaissement.');
    } finally {
      setCollectBusy(false);
    }
  };

  const summary: CustomerSummary | undefined = summaryQuery.data;
  const customers = customersQuery.data ?? [];
  const stats = statsQuery.data;
  const history = historyQuery.data ?? [];

  const debtorCount = customers.filter((c) => (c.balance?.outstandingFcfa ?? 0) > 0).length;
  const soldCount = customers.length - debtorCount;

  const typeTabs = useMemo(() => {
    if (!summary) return [] as { type: CustomerType; count: number }[];
    return CUSTOMER_TYPES.filter((t) => (summary.byType[t]?.count ?? 0) > 0).map((t) => ({
      type: t,
      count: summary.byType[t]?.count ?? 0,
    }));
  }, [summary]);

  const rows = useMemo(() => {
    let list = customersQuery.data ?? [];
    if (segmentFilter !== 'TOUS') list = list.filter((c) => c.segment === segmentFilter);
    if (debtState === 'DUES') list = list.filter((c) => (c.balance?.outstandingFcfa ?? 0) > 0);
    if (debtState === 'SOLVES') list = list.filter((c) => (c.balance?.outstandingFcfa ?? 0) === 0);
    const sorted = [...list];
    if (sortKey === 'due') {
      sorted.sort((a, b) => (b.balance?.outstandingFcfa ?? 0) - (a.balance?.outstandingFcfa ?? 0));
    } else {
      sorted.sort((a, b) => a.fullName.localeCompare(b.fullName, 'fr'));
    }
    return sorted;
  }, [customersQuery.data, segmentFilter, debtState, sortKey]);

  return (
    <Screen
      header={
        <ScreenHeader
          title="Clients & crédit"
          subtitle={farms[0]?.name ?? 'Ferme'}
          back
          left={<Image source={require('@/assets/images/logo-nav.png')} style={styles.headerLogo} accessibilityLabel="Logo KouKou" />}
          right={<UserRound size={18} color={color.ink[300]} />}
        />
      }>
      {customersQuery.isLoading ? (
        <Spinner label="Chargement des clients…" />
      ) : (
        <>
          {summary ? <KpiHero summary={summary} /> : null}

          <View style={styles.toolbar}>
            <View style={styles.searchRow}>
              <Search size={16} color={color.ink[300]} />
              <TextInput
                value={search}
                onChangeText={setSearch}
                placeholder="Rechercher (nom, code, téléphone)…"
                placeholderTextColor={color.ink[300]}
                style={styles.searchInput}
                autoCorrect={false}
              />
            </View>
            <Pressable onPress={() => setCreateOpen(true)} style={styles.addBtn} accessibilityRole="button">
              <Plus size={18} color={palette.surface} strokeWidth={2.6} />
              <AppText size="bodyM" weight="semibold" style={{ color: palette.surface }}>
                Ajouter
              </AppText>
            </Pressable>
          </View>

          {typeTabs.length > 0 ? (
            <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.chipRow}>
              <Pressable onPress={() => setTypeFilter('TOUS')} accessibilityRole="button">
                <Chip label={`Tous (${summary?.total ?? 0})`} tone={typeFilter === 'TOUS' ? 'brand' : 'neutral'} selected={typeFilter === 'TOUS'} />
              </Pressable>
              {typeTabs.map(({ type, count }) => (
                <Pressable key={type} onPress={() => setTypeFilter(typeFilter === type ? 'TOUS' : type)} accessibilityRole="button">
                  <Chip
                    label={`${customerTypeLabel(type)} (${count})`}
                    tone={typeFilter === type ? 'brand' : 'neutral'}
                    selected={typeFilter === type}
                  />
                </Pressable>
              ))}
            </ScrollView>
          ) : null}

          {summary ? (
            <View style={styles.filterRow}>
              <FilterChip label="Nouveau" count={summary.bySegment.NOUVEAU} active={segmentFilter === 'NOUVEAU'} onPress={() => setSegmentFilter(segmentFilter === 'NOUVEAU' ? 'TOUS' : 'NOUVEAU')} />
              <FilterChip label="Régulier" count={summary.bySegment.REGULIER} active={segmentFilter === 'REGULIER'} onPress={() => setSegmentFilter(segmentFilter === 'REGULIER' ? 'TOUS' : 'REGULIER')} />
              <FilterChip label="Top client" count={summary.bySegment.TOP} active={segmentFilter === 'TOP'} onPress={() => setSegmentFilter(segmentFilter === 'TOP' ? 'TOUS' : 'TOP')} />
              <View style={{ flex: 1 }} />
              <Pressable onPress={() => setSortKey((s) => (s === 'due' ? 'name' : 'due'))} style={styles.sortBtn} accessibilityRole="button">
                <ArrowDownWideNarrow size={13} color={color.brand[700]} />
                <AppText size="small" weight="bold" color="brand">
                  {sortKey === 'due' ? 'Dû ↓' : 'Nom A–Z'}
                </AppText>
              </Pressable>
            </View>
          ) : null}

          {customers.length > 0 ? (
            <View style={styles.filterRow}>
              <FilterChip label="Tous" count={customers.length} active={debtState === 'TOUS'} onPress={() => setDebtState('TOUS')} />
              <FilterChip label="Débiteurs" count={debtorCount} active={debtState === 'DUES'} onPress={() => setDebtState(debtState === 'DUES' ? 'TOUS' : 'DUES')} />
              <FilterChip label="Soldés" count={soldCount} active={debtState === 'SOLVES'} onPress={() => setDebtState(debtState === 'SOLVES' ? 'TOUS' : 'SOLVES')} />
            </View>
          ) : null}

          <SectionHeader
            title={`Clients (${rows.length}${typeFilter !== 'TOUS' ? ' · ' + customerTypeLabel(typeFilter) : ''})`}
            subtitle="Fiches, codes, soldes & segments"
          />
          <View style={{ gap: 10 }}>
            {rows.length === 0 ? (
              <AppText size="caption" color="muted">
                {search || typeFilter !== 'TOUS' || segmentFilter !== 'TOUS' || debtState !== 'TOUS'
                  ? 'Aucun client ne correspond à ces critères.'
                  : 'Aucun client enregistré. Le nom/mobile saisi au POS crée la fiche automatiquement.'}
              </AppText>
            ) : (
              rows.map((c) => {
                const open = openId === c.id;
                const due = c.balance?.outstandingFcfa ?? 0;
                const invoiced = c.balance?.totalInvoicedFcfa ?? 0;
                const paid = c.balance?.paidFcfa ?? 0;
                const recPct = invoiced > 0 ? Math.round(Math.min(1, paid / invoiced) * 100) : 0;
                return (
                  <Card key={c.id} tone={open ? 'brand' : 'default'} style={styles.card}>
                    <Pressable onPress={() => setOpenId(open ? null : c.id)} accessibilityRole="button">
                      <View style={styles.head}>
<View style={styles.avatar}>
                        <Image source={require('@/assets/images/logo-white.png')} style={styles.avatarLogo} accessibilityLabel="Logo KouKou" />
                      </View>
                        <View style={{ flex: 1, gap: 3 }}>
                          <View style={styles.rowBetween}>
                            <AppText size="bodyM" weight="semibold" color="text" numberOfLines={1} style={{ flex: 1 }}>
                              {c.fullName}
                            </AppText>
                            <SegmentChip s={c.segment} />
                          </View>
                          <View style={styles.rowBetween}>
                            <AppText size="caption" color="muted" numberOfLines={1} style={{ flex: 1 }}>
                              {[c.phone, c.city].filter(Boolean).join(' · ') || 'Aucun contact'}
                            </AppText>
                            <TypePill t={c.type} />
                          </View>
                          <View style={styles.rowBetween}>
                            <AppText size="bodyM" weight="semibold" color={due > 0 ? 'danger' : 'success'}>
                              {due > 0 ? `Dû : ${fmtFcfa(due)}` : 'Soldé ✓'}
                            </AppText>
                            {c.code ? (
                              <AppText size="small" weight="medium" color="faint" style={{ fontFamily: Fonts.mono }}>
                                {c.code}
                              </AppText>
                            ) : null}
                          </View>
                        </View>
                        {open ? <ChevronDown size={16} color={color.ink[300]} /> : <ChevronRight size={16} color={color.ink[300]} />}
                      </View>
                    </Pressable>

                    {open ? (
                      <View style={styles.detail}>
                        <View style={styles.rowBetween}>
                          <RowRow label="Total facturé" value={fmtFcfa(invoiced)} />
                          <RowRow label="Encaissé" value={fmtFcfa(paid)} />
                          <RowRow label="À recouvrer" value={fmtFcfa(due)} warn={due > 0} />
                        </View>
                        <View style={styles.recRow}>
                          <AppText size="caption" color="muted">
                            Recouvrement
                          </AppText>
                          <AppText size="caption" weight="semibold" color={recPct > 0 ? 'text' : 'faint'}>
                            {recPct} %
                          </AppText>
                        </View>
                        <View style={styles.microTrack}>
                          <View
                            style={[
                              styles.microFill,
                              {
                                width: `${recPct}%`,
                                backgroundColor: recPct >= 100 ? palette.green[500] : palette.accent[300],
                              },
                            ]}
                          />
                        </View>
                        <View style={styles.actionRow}>
                          {due > 0 ? (
                            <Pressable onPress={() => openCollect(c)} style={[styles.actionBtn, styles.actionPrimary]} accessibilityRole="button">
                              <Banknote size={15} color={color.surface} />
                              <AppText size="small" weight="bold" style={{ color: color.surface }}>
                                Encaisser
                              </AppText>
                            </Pressable>
                          ) : null}
                          {c.phone ? (
                            <Pressable onPress={() => Linking.openURL(`tel:${c.phone}`)} style={[styles.actionBtn, { marginLeft: due > 0 ? 0 : 'auto' }]} accessibilityRole="button" hitSlop={6}>
                              <Phone size={13} color={color.brand[700]} />
                              <AppText size="small" weight="bold" color="brand">
                                Appeler
                              </AppText>
                            </Pressable>
                          ) : null}
                          <Pressable
                            onPress={() => {
                              setEditTarget(c);
                              setEditType(c.type);
                              setEditSheetOpen(true);
                            }}
                            hitSlop={6}
                            style={[styles.actionBtn, { marginLeft: 'auto' }]}
                            accessibilityRole="button">
                            <Pencil size={13} color={color.brand[700]} />
                            <AppText size="small" weight="bold" color="brand">
                              Type
                            </AppText>
                          </Pressable>
                        </View>
                        {statsQuery.isLoading ? (
                          <Spinner label="Calcul des stats…" />
                        ) : stats ? (
                          <View style={styles.statsRow}>
                            <Stat label="Visites" value={String(stats.visits)} />
                            <Stat label="Total dépensé" value={fmtFcfa(stats.totalSpentFcfa)} />
                            <Stat label="Panier moyen" value={fmtFcfa(stats.avgBasketFcfa)} />
                          </View>
                        ) : null}
                        {stats && stats.favorites.length > 0 ? (
                          <AppText size="caption" color="muted">
                            Aime : {stats.favorites.map((f) => f.label).join(', ')}
                          </AppText>
                        ) : null}
                        {stats?.lastPurchaseDate ? (
                          <AppText size="caption" color="muted">
                            Dernier achat :{' '}
                            {new Date(stats.lastPurchaseDate + 'T00:00:00').toLocaleDateString('fr-FR', {
                              day: 'numeric',
                              month: 'short',
                              year: 'numeric',
                            })}
                          </AppText>
                        ) : null}
                        <SectionHeader title="Historique" />
                        {historyQuery.isLoading ? (
                          <Spinner label="Lecture de l’historique…" />
                        ) : history.length === 0 ? (
                          <AppText size="caption" color="muted">
                            Aucun achat pour l’instant.
                          </AppText>
                        ) : (
                          history.map((s) => <HistoryItem key={s.id} s={s} />)
                        )}
                      </View>
                    ) : null}
                  </Card>
                );
              })
            )}
          </View>

          <AppText size="caption" color="faint" style={styles.footer}>
            Le solde = total des ventes non annulées − paiements confirmés. Une vente à crédit se décide au POS (mode Crédit) et augmente le solde dû. Le type de client est indicatif ; les segments (Nouveau / Régulier / Top) sont calculés par le serveur.
          </AppText>
        </>
      )}

      <CreateClientSheet
        visible={createOpen}
        busy={busy}
        error={error}
        name={name}
        phone={phone}
        city={city}
        createType={createType}
        onName={setName}
        onPhone={setPhone}
        onCity={setCity}
        onPickType={() => setTypeSheetOpen(true)}
        onClose={() => setCreateOpen(false)}
        onSubmit={() => void add()}
      />
      <CustomerTypeSheet visible={typeSheetOpen} value={createType} onSelect={setCreateType} onClose={() => setTypeSheetOpen(false)} />
      <CustomerTypeSheet
        visible={editSheetOpen}
        value={editType}
        onSelect={(t) => {
          setEditType(t);
          void saveType(t);
        }}
        onClose={() => setEditSheetOpen(false)}
      />
      <CollectSheet
        visible={collectTarget !== null}
        customer={collectTarget}
        value={collectInput}
        busy={collectBusy}
        error={collectError}
        result={collectResult}
        onValue={setCollectInput}
        onSubmit={() => void doCollect()}
        onPickCustomer={() => setCollectPickerOpen(true)}
        onClose={() => setCollectTarget(null)}
      />
      <ClientPickerSheet
        visible={collectPickerOpen}
        farmId={farmId}
        selectedId={collectTarget?.id}
        creditMode
        onSelect={pickCollectTarget}
        onClose={() => setCollectPickerOpen(false)}
      />
    </Screen>
  );
}

const styles = StyleSheet.create({
  hero: {
    backgroundColor: palette.brand[800],
    borderRadius: radii.xl,
    padding: spacing.lg,
    gap: spacing.md,
  },
  heroCols: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: spacing.md,
  },
  heroCol: {
    flex: 1,
    minWidth: 0,
    gap: 2,
  },
  heroDivider: {
    width: 1,
    alignSelf: 'stretch',
    backgroundColor: 'rgba(255, 255, 255, 0.12)',
  },
  heroBar: {
    height: 6,
    borderRadius: radii.pill,
    backgroundColor: 'rgba(255, 255, 255, 0.15)',
    overflow: 'hidden',
  },
  heroBarFill: {
    height: 6,
    borderRadius: radii.pill,
    backgroundColor: palette.accent[300],
  },
  heroSegments: {
    flexDirection: 'row',
    gap: spacing.sm,
    marginTop: spacing.xs,
  },
  segPill: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: radii.pill,
    backgroundColor: 'rgba(255, 255, 255, 0.08)',
  },
  filterRow: {
    flexDirection: 'row',
    alignItems: 'center',
    flexWrap: 'wrap',
    gap: 6,
    marginTop: spacing.sm,
  },
  sortBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    height: 30,
    paddingHorizontal: 10,
    borderRadius: radii.pill,
    borderWidth: 1,
    borderColor: palette.border,
    backgroundColor: color.surface,
  },
  recRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  microTrack: {
    height: 6,
    borderRadius: radii.pill,
    backgroundColor: palette.ink[100],
    overflow: 'hidden',
  },
  microFill: {
    height: 6,
    borderRadius: radii.pill,
  },
  toolbar: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    marginTop: spacing.md,
  },
  searchRow: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    paddingHorizontal: 12,
    height: 44,
    borderRadius: radii.md,
    borderWidth: 1,
    borderColor: palette.border,
    backgroundColor: color.surface,
  },
  searchInput: {
    flex: 1,
    fontSize: 15,
    color: color.ink[800],
  },
  addBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    height: 44,
    paddingHorizontal: spacing.md,
    borderRadius: radii.md,
    backgroundColor: palette.brand[600],
  },
  chipRow: {
    gap: 6,
    paddingVertical: spacing.xs,
  },
  card: {
    gap: 10,
    padding: 14,
  },
  head: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
  },
  avatar: {
    width: 42,
    height: 42,
    borderRadius: 21,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: palette.brand[600],
  },
  avatarLogo: {
    width: 24,
    height: 24,
  },
  typePill: {
    borderRadius: radii.pill,
    paddingHorizontal: 8,
    paddingVertical: 2,
  },
  rowBetween: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 8,
  },
  detail: {
    gap: 8,
    borderTopWidth: 1,
    borderTopColor: palette.border,
    paddingTop: 10,
    marginTop: 4,
  },
  statsRow: {
    flexDirection: 'row',
    gap: 8,
    paddingVertical: 2,
  },
  histRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    paddingVertical: 8,
    borderBottomWidth: 1,
    borderBottomColor: palette.border,
  },
  input: {
    height: 44,
    borderWidth: 1,
    borderColor: palette.border,
    borderRadius: 12,
    paddingHorizontal: 12,
    fontSize: 15,
    color: color.ink[800],
    backgroundColor: color.surface,
  },
  typeRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    paddingVertical: 10,
    paddingHorizontal: 12,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: color.brand[200],
    backgroundColor: color.brand[50],
  },
  sheetFields: {
    gap: 10,
    paddingBottom: 8,
  },
  editBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    paddingHorizontal: 8,
    paddingVertical: 6,
    borderRadius: 10,
    backgroundColor: color.brand[50],
  },
  actionRow: {    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  actionBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
    paddingHorizontal: 10,
    paddingVertical: 7,
    borderRadius: 10,
    backgroundColor: color.brand[50],
  },
  actionPrimary: {
    backgroundColor: palette.green[600],
  },
  cashRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  quickRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 6,
  },
  quickChip: {
    paddingHorizontal: 12,
    paddingVertical: 7,
    borderRadius: radii.pill,
    borderWidth: 1,
    borderColor: palette.border,
    backgroundColor: color.surface,
  },
  collectClient: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    padding: 10,
  },
  collectPick: {
    alignItems: 'center',
    paddingVertical: 14,
    borderRadius: 12,
    borderWidth: 1,
    borderStyle: 'dashed',
    borderColor: palette.border,
    backgroundColor: color.surfaceAlt,
  },
  savedWrap: {
    alignItems: 'center',
    gap: 8,
    paddingVertical: spacing.lg,
    paddingHorizontal: spacing.md,
  },
  checkCircle: {
    width: 84,
    height: 84,
    borderRadius: 42,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: palette.green[50],
    marginBottom: spacing.sm,
  },
  headerLogo: {
    width: 38,
    height: 38,
  },
  footer: {
    textAlign: 'center',
    marginTop: 20,
  },
});