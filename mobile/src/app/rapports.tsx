import React, { useCallback, useMemo, useState } from 'react';
import { Alert, Pressable, StyleSheet, View } from 'react-native';
import { useQuery, keepPreviousData } from '@tanstack/react-query';
import { Download, FileBarChart2, PieChart, Receipt, Store, TrendingUp, Wallet } from 'lucide-react-native';

import { Screen, ScreenHeader } from '@/components/ui/Screen';
import { AppText } from '@/components/ui/AppText';
import { Button } from '@/components/ui/Button';
import { Card } from '@/components/ui/Card';
import { Chip } from '@/components/ui/Chip';
import { EmptyState } from '@/components/ui/EmptyState';
import { MetricTile } from '@/components/ui/MetricTile';
import { PeriodBar, periodWindow, type PeriodWindow } from '@/components/ui/PeriodBar';
import { SectionHeader } from '@/components/ui/SectionHeader';
import { Spinner } from '@/components/ui/Spinner';
import { useAuth } from '@/auth/AuthContext';
import { fetchBatches, fetchPointsOfSale, fetchRentabiliteBatch, fetchRentabiliteOverview, fetchSales } from '@/api';
import { downloadPdf } from '@/api/pdf';
import type { BatchPnl, BatchStatus } from '@/api/types';
import { color, fmt, fmtFcfa, palette, radii } from '@/constants/theme';
import { BreakdownBars, CollectionBar } from '@/components/finance/BreakdownBars';
import { PnlHero } from '@/components/finance/PnlHero';
import {
  collectionRate,
  compactFcfa,
  deltaPct,
  marginPct,
  periodLabel,
  plainPct,
  rankBreakdown,
  shiftWindow,
  sharePct,
  sumFcfa,
} from '@/components/finance/pnlAnalytics';

const DEFAULT_SPAN = 30;

const STATUS_TONE: Record<BatchStatus, 'brand' | 'green' | 'neutral' | 'amber'> = {
  ACTIF: 'brand',
  EN_VENTE: 'green',
  FINI: 'neutral',
  CLOTURE: 'neutral',
};

export default function RapportsScreen() {
  const { farms, farmId } = useAuth();

  const [window, setWindow] = useState<PeriodWindow>(() => periodWindow(DEFAULT_SPAN));
  const handlePeriodChange = useCallback((w: PeriodWindow) => setWindow(w), []);

  const batchesQuery = useQuery({ queryKey: ['batches', farmId], queryFn: () => fetchBatches(farmId) });
  const overviewQuery = useQuery({
    queryKey: ['rentabilite', farmId, window.from ?? '', window.to ?? ''],
    queryFn: () => fetchRentabiliteOverview(farmId, window.from, window.to),
    placeholderData: keepPreviousData,
  });

  const prev = useMemo(() => shiftWindow(window.from, window.to), [window.from, window.to]);
  const prevQuery = useQuery({
    // Préfixe `rentabilite` volontaire : `invalidateFarmQueries()` invalide ce
    // groupe par préfixe, la fenêtre précédente doit suivre les mutations.
    queryKey: ['rentabilite', farmId, 'prev', prev.from ?? '', prev.to ?? ''],
    queryFn: () => fetchRentabiliteOverview(farmId, prev.from, prev.to),
    enabled: prev.from != null,
    placeholderData: keepPreviousData,
  });

  const lots = (batchesQuery.data ?? []).filter((b) => b.status !== 'CLOTURE');
  const [lotId, setLotId] = useState('');
  const lot = lots.find((b) => b.id === lotId) ?? lots[0];
  const batchId = lot?.id ?? '';

  const batchQuery = useQuery({
    queryKey: ['rentabilite-batch', farmId, batchId],
    queryFn: () => fetchRentabiliteBatch(farmId, batchId),
    enabled: batchId !== '',
  });

  const ov = overviewQuery.data;

  const periodFrom = ov?.period?.from?.slice(0, 10);
  const periodTo = ov?.period?.to?.slice(0, 10);
  const salesQuery = useQuery({
    queryKey: ['sales', farmId, periodFrom ?? '', periodTo ?? ''],
    queryFn: () => fetchSales(farmId, periodFrom ?? undefined, periodTo ?? undefined),
    enabled: !!periodFrom,
  });
  const pdvQuery = useQuery({ queryKey: ['points-of-sale', farmId], queryFn: () => fetchPointsOfSale(farmId) });

  const revenue = ov?.sales?.totalFcfa ?? 0;
  const expenses = ov?.expenses?.totalFcfa ?? 0;
  const net = ov?.netFcfa ?? 0;
  const margin = marginPct(net, revenue);
  const netDelta = deltaPct(ov?.netFcfa, prevQuery.data?.netFcfa);
  const revenueDelta = deltaPct(ov?.sales?.totalFcfa, prevQuery.data?.sales?.totalFcfa);
  const expenseDelta = deltaPct(ov?.expenses?.totalFcfa, prevQuery.data?.expenses?.totalFcfa);
  const rate = collectionRate(ov?.collectedFcfa ?? 0, revenue);
  const label = periodLabel(window.from, window.to, window.span);

  const productRows = useMemo(
    () => rankBreakdown(ov?.breakdown?.byProduct ?? [], sumFcfa(ov?.breakdown?.byProduct)),
    [ov?.breakdown?.byProduct],
  );
  const expenseRows = useMemo(
    () => rankBreakdown(ov?.breakdown?.byExpenseCategory ?? [], sumFcfa(ov?.breakdown?.byExpenseCategory)),
    [ov?.breakdown?.byExpenseCategory],
  );

  const canalRows = useMemo(() => {
    const map = new Map<string, number>();
    for (const s of salesQuery.data ?? []) {
      if (s.status === 'CANCELLED' || !s.pointOfSaleId) continue;
      map.set(s.pointOfSaleId, (map.get(s.pointOfSaleId) ?? 0) + s.totalAmountFcfa);
    }
    const pdvs = pdvQuery.data ?? [];
    return [...map.entries()]
      .map(([id, amount]) => ({ pdv: pdvs.find((p) => p.id === id), amount }))
      .filter((r) => r.pdv)
      .sort((a, b) => b.amount - a.amount) as { pdv: NonNullable<(typeof pdvs)[number]>; amount: number }[];
  }, [salesQuery.data, pdvQuery.data]);
  const canalTotal = useMemo(() => canalRows.reduce((a, r) => a + r.amount, 0), [canalRows]);

  const exportOverview = async () => {
    const from = ov?.period?.from?.slice(0, 10);
    const to = ov?.period?.to?.slice(0, 10);
    const query = from ? `?from=${from}${to ? `&to=${to}` : ''}` : '';
    try {
      await downloadPdf(`/farms/${farmId}/rentabilite/overview/export${query}`, 'rapport-pnl.pdf');
      Alert.alert('Rapport téléchargé', 'P&L de période exporté (PDF).');
    } catch (e) {
      Alert.alert('Téléchargement impossible', e instanceof Error ? e.message : 'Erreur inattendue.');
    }
  };

  const exportBatch = async () => {
    if (!batchId) return;
    try {
      await downloadPdf(`/farms/${farmId}/rentabilite/batches/${batchId}/export`, `pnl-lot-${batchId}.pdf`);
      Alert.alert('Rapport téléchargé', 'P&L du lot exporté (PDF).');
    } catch (e) {
      Alert.alert('Téléchargement impossible', e instanceof Error ? e.message : 'Erreur inattendue.');
    }
  };

  return (
    <Screen
      header={
        <ScreenHeader
          title="Rentabilité"
          subtitle={farms[0]?.name ?? 'Ferme'}
          back
          right={<FileBarChart2 size={18} color={color.ink[300]} />}
        />
      }>
      <View style={styles.stack}>
        <PeriodBar defaultSpan={DEFAULT_SPAN} onChange={handlePeriodChange} style={styles.periodBar} />

        {overviewQuery.isLoading ? (
          <Spinner label="Calcul du P&L…" />
        ) : overviewQuery.isError ? (
          <EmptyState
            emoji="📉"
            title="P&L indisponible"
            description="Le calcul du compte de résultat n’a pas pu aboutir. Vérifiez la connexion au serveur puis réessayez."
          />
        ) : ov ? (
          <>
            <PnlHero
              netFcfa={net}
              marginPct={margin}
              deltaPct={netDelta}
              periodLabel={label}
              revenueFcfa={revenue}
              expensesFcfa={expenses}
            />

            <View style={styles.tileRow}>
              <MetricTile
                label="Chiffre d’affaires"
                value={compactFcfa(revenue)}
                sub={revenueDelta == null ? `${ov.sales?.count ?? 0} vente(s)` : `${(ov.sales?.count ?? 0)} vente(s) · ${deltaText(revenueDelta)}`}
                tone="brand"
                icon={TrendingUp}
                compact
                threeCol
              />
              <MetricTile
                label="Dépenses"
                value={compactFcfa(expenses)}
                sub={expenseDelta == null ? `${ov.expenses?.count ?? 0} dépense(s)` : `${(ov.expenses?.count ?? 0)} dépense(s) · ${deltaText(expenseDelta)}`}
                tone="amber"
                icon={Receipt}
                compact
                threeCol
              />
              <MetricTile
                label="Marge nette"
                value={plainPct(margin) ?? '—'}
                sub="Coût de revient suivi"
                tone={margin != null && margin < 0 ? 'red' : 'green'}
                icon={PieChart}
                compact
                threeCol
              />
            </View>

            <Card tone="default" style={styles.card}>
              <CollectionBar ratePct={rate} outstandingFcfa={ov.outstandingFcfa ?? 0} />
            </Card>

            <Button
              label="Exporter le P&L de la période"
              tone="ghost"
              size="md"
              icon={Download}
              onPress={() => void exportOverview()}
            />

            <SectionHeader
              title="D’où viennent les revenus"
              subtitle={productRows.length > 0 ? `Répartition sur ${fmtFcfa(sumFcfa(ov.breakdown?.byProduct))}` : undefined}
              icon={TrendingUp}
              iconColor={palette.green[600]}
              iconBg={palette.green[50]}
            />
            <Card tone="default" style={styles.card}>
              <BreakdownBars
                rows={productRows}
                totalLabel={fmtFcfa(sumFcfa(ov.breakdown?.byProduct))}
                emptyLabel="Aucune vente enregistrée sur la période."
                renderLabel={(p) => p.label}
                renderMeta={(p) => (p.quantity ? `${fmt(p.quantity)} u.` : undefined)}
              />
            </Card>

            <SectionHeader
              title="Où part l’argent"
              subtitle={expenseRows.length > 0 ? `Postes de dépense sur ${fmtFcfa(expenses)}` : undefined}
              icon={Wallet}
              iconColor={palette.amber[600]}
              iconBg={palette.amber[50]}
            />
            <Card tone="default" style={styles.card}>
              <BreakdownBars
                rows={expenseRows}
                totalLabel={fmtFcfa(sumFcfa(ov.breakdown?.byExpenseCategory))}
                emptyLabel="Aucune dépense enregistrée sur la période."
                renderLabel={(e) => e.label}
              />
            </Card>

            <SectionHeader
              title="Ventes par canal"
              subtitle={canalRows.length > 0 ? `${fmt(canalRows.length)} point(s) de vente · ${fmtFcfa(canalTotal)}` : undefined}
              icon={Store}
            />
            <Card tone="default" style={styles.card}>
              {canalRows.length > 0 ? (
                <View style={styles.stackSm}>
                  {canalRows.map((r) => (
                    <View key={r.pdv.id} style={styles.canalRow}>
                      <View style={styles.canalIcon}>
                        <Store size={14} color={palette.brand[600]} />
                      </View>
                      <View style={{ flex: 1, gap: 5 }}>
                        <View style={styles.canalHead}>
                          <AppText size="small" weight="semibold" color="text" numberOfLines={1} style={{ flex: 1 }}>
                            {r.pdv.name}
                            {r.pdv.province ? ` · ${r.pdv.province}` : ''}
                          </AppText>
                          <AppText size="small" weight="bold" color="text">
                            {fmtFcfa(r.amount)}
                          </AppText>
                        </View>
                        <View style={styles.canalTrack}>
                          <View
                            style={[
                              styles.canalFill,
                              { width: `${Math.max(2, sharePct(r.amount, canalTotal))}%` },
                            ]}
                          />
                        </View>
                      </View>
                    </View>
                  ))}
                </View>
              ) : (
                <AppText size="small" color="muted">
                  Aucune vente sur la période.
                </AppText>
              )}
            </Card>
          </>
        ) : null}

        <SectionHeader title="P&L par lot" subtitle="Coût de revient et marge de chaque lot" icon={PieChart} />
        {lots.length === 0 ? (
          <Card tone="default" style={styles.card}>
            <AppText size="small" color="muted">
              Aucun lot actif à analyser. Créez un lot pour suivre sa rentabilité.
            </AppText>
          </Card>
        ) : (
          <>
            <View style={styles.chipRow}>
              {lots.map((b) => (
                <Pressable
                  key={b.id}
                  onPress={() => setLotId(b.id)}
                  accessibilityRole="button"
                  accessibilityState={{ selected: lot?.id === b.id }}>
                  <Chip
                    label={b.batchName ?? b.id}
                    tone={STATUS_TONE[b.status] ?? 'neutral'}
                    selected={lot?.id === b.id}
                    style={styles.chip}
                  />
                </Pressable>
              ))}
            </View>

            {batchQuery.isLoading ? (
              <Spinner label="P&L du lot…" />
            ) : batchQuery.data ? (
              <BatchPnlCard pnl={batchQuery.data} onExport={() => void exportBatch()} />
            ) : null}
          </>
        )}
      </View>
    </Screen>
  );
}

function deltaText(pct: number): string {
  const rounded = Math.round(pct * 10) / 10;
  const sign = rounded > 0 ? '+' : '';
  return `${sign}${rounded.toLocaleString('fr-FR', { maximumFractionDigits: 1 })} %`;
}

/** P&L d'un lot : marge, coût de revient et intrants déduits. */
function BatchPnlCard({ pnl, onExport }: { pnl: BatchPnl; onExport: () => void }) {
  const negative = pnl.netFcfa < 0;
  const margin = pnl.marginPct ?? marginPct(pnl.netFcfa, pnl.revenueFcfa);
  const marginWidth = margin == null ? 0 : Math.min(100, Math.max(2, Math.abs(margin)));
  const sold = [
    pnl.kgSold > 0 ? `${fmt(pnl.kgSold)} kg vendus` : null,
    pnl.birdsSold > 0 ? `${fmt(pnl.birdsSold)} poulets` : null,
    pnl.eggsSold > 0 ? `${fmt(pnl.eggsSold)} alvéoles d’œufs` : null,
  ].filter((s): s is string => s != null);

  return (
    <Card tone={negative ? 'alert' : 'default'} style={styles.card}>
      <View style={styles.batchHead}>
        <View style={{ flex: 1, gap: 3 }}>
          <AppText size="h3" weight="bold" color="text" numberOfLines={1}>
            {pnl.batchName ?? pnl.batchId}
          </AppText>
          <AppText size="caption" color="muted">
            {sold.length > 0 ? sold.join(' · ') : 'Aucune vente enregistrée pour ce lot'}
          </AppText>
        </View>
        <Chip label={pnl.status} tone={STATUS_TONE[pnl.status] ?? 'neutral'} />
      </View>

      <View style={styles.kv}>
        <Kv label="Revenus" value={fmtFcfa(pnl.revenueFcfa)} />
        <Kv label="Dépenses (hors intrants)" value={`− ${fmtFcfa(pnl.expensesFcfa)}`} muted />
        <View style={styles.kvDivider} />
        <Kv label="Résultat net" value={fmtFcfa(pnl.netFcfa)} tone={negative ? 'danger' : 'success'} bold />
      </View>

      <View style={styles.marginBlock}>
        <View style={styles.marginHead}>
          <AppText size="small" weight="semibold" color="text" style={{ flex: 1 }}>
            Marge nette
          </AppText>
          <AppText size="bodyM" weight="bold" color={negative ? 'danger' : 'success'}>
            {plainPct(margin) ?? '—'}
          </AppText>
        </View>
        <View style={styles.marginTrack}>
          <View
            style={[
              styles.marginFill,
              { width: `${marginWidth}%`, backgroundColor: negative ? palette.red[500] : palette.green[500] },
            ]}
          />
        </View>
        <View style={styles.marginHead}>
          <AppText size="small" color="muted" style={{ flex: 1 }}>
            Coût de revient / kg
          </AppText>
          <AppText size="small" weight="bold" color="text">
            {pnl.costPerKgFcfa != null ? fmtFcfa(pnl.costPerKgFcfa) : '—'}
          </AppText>
        </View>
      </View>

      {pnl.enrichment ? (
        <View style={styles.enrichment}>
          <AppText size="label" weight="bold" color="faint">
            INTRANTS DÉDUITS (HACCP)
          </AppText>
          <Kv label="Poussins" value={fmtFcfa(pnl.enrichment.chickCostFcfa ?? 0)} small />
          <Kv label="Aliments (lots liés)" value={fmtFcfa(pnl.enrichment.feedLotsCostFcfa ?? 0)} small />
          <AppText size="caption" color="faint">
            Coûts de poussins et d’aliments déduits automatiquement des intrants.
          </AppText>
        </View>
      ) : null}

      <Button label="Exporter le P&L du lot" tone="ghost" size="md" icon={Download} onPress={onExport} />
    </Card>
  );
}

function Kv({
  label,
  value,
  tone,
  bold,
  muted,
  small,
}: {
  label: string;
  value: string;
  tone?: 'success' | 'danger';
  bold?: boolean;
  muted?: boolean;
  small?: boolean;
}) {
  return (
    <View style={styles.kvRow}>
      <AppText size={small ? 'small' : 'body'} color={muted ? 'faint' : 'muted'} style={{ flex: 1 }}>
        {label}
      </AppText>
      <AppText size={small ? 'small' : 'body'} weight={bold ? 'bold' : 'semibold'} color={tone ?? 'text'}>
        {value}
      </AppText>
    </View>
  );
}

const styles = StyleSheet.create({
  stack: {
    gap: 14,
  },
  stackSm: {
    gap: 12,
  },
  periodBar: {
    marginTop: 0,
  },
  tileRow: {
    flexDirection: 'row',
    gap: 8,
  },
  card: {
    gap: 10,
    padding: 14,
  },
  chipRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 6,
  },
  chip: {
    marginBottom: 2,
  },
  canalRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
  },
  canalIcon: {
    width: 28,
    height: 28,
    borderRadius: radii.sm,
    backgroundColor: palette.brand[50],
    alignItems: 'center',
    justifyContent: 'center',
  },
  canalHead: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  canalTrack: {
    height: 5,
    borderRadius: radii.pill,
    backgroundColor: palette.surfaceAlt,
    overflow: 'hidden',
  },
  canalFill: {
    height: 5,
    borderRadius: radii.pill,
    backgroundColor: palette.brand[400],
  },
  batchHead: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 10,
  },
  kv: {
    gap: 6,
  },
  kvRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
  },
  kvDivider: {
    height: 1,
    backgroundColor: palette.border,
    marginVertical: 2,
  },
  marginBlock: {
    gap: 7,
    paddingTop: 10,
    borderTopWidth: 1,
    borderTopColor: palette.border,
  },
  marginHead: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
  },
  marginTrack: {
    height: 6,
    borderRadius: radii.pill,
    backgroundColor: palette.surfaceAlt,
    overflow: 'hidden',
  },
  marginFill: {
    height: 6,
    borderRadius: radii.pill,
  },
  enrichment: {
    gap: 6,
    padding: 12,
    borderRadius: radii.md,
    backgroundColor: palette.surfaceAlt,
  },
});