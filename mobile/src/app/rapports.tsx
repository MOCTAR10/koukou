import React, { useMemo, useState } from 'react';
import { Alert, Pressable, StyleSheet, View } from 'react-native';
import { useQuery } from '@tanstack/react-query';
import { Download, FileBarChart2, Store, TrendingDown, TrendingUp } from 'lucide-react-native';

import { Screen, ScreenHeader } from '@/components/ui/Screen';
import { AppText } from '@/components/ui/AppText';
import { Button } from '@/components/ui/Button';
import { Card } from '@/components/ui/Card';
import { Chip } from '@/components/ui/Chip';
import { SectionHeader } from '@/components/ui/SectionHeader';
import { Spinner } from '@/components/ui/Spinner';
import { useAuth } from '@/auth/AuthContext';
import { fetchBatches, fetchPointsOfSale, fetchRentabiliteBatch, fetchRentabiliteOverview, fetchSales } from '@/api';
import { downloadPdf } from '@/api/pdf';
import type { BatchPnl, BatchStatus, OverviewPnl, RentabiliteBreakdownExpense, RentabiliteBreakdownProduct } from '@/api/types';
import { color, palette, fmt, fmtFcfa } from '@/constants/theme';

const STATUS_TONE: Record<BatchStatus, 'brand' | 'green' | 'neutral' | 'amber'> = {
  ACTIF: 'brand',
  EN_VENTE: 'green',
  FINI: 'neutral',
  CLOTURE: 'neutral',
};

function NetRow({ label, value, negative }: { label: string; value: string; negative?: boolean }) {
  return (
    <View style={styles.rowBetween}>
      <AppText size="body" color="muted">
        {label}
      </AppText>
      <AppText size="body" weight="bold" color={negative ? 'danger' : 'success'}>
        {value}
      </AppText>
    </View>
  );
}

function BreakdownRow({ label, quantity, amount }: { label: string; quantity?: number | null; amount: number | null | undefined }) {
  return (
    <View style={styles.rowBetween}>
      <AppText size="small" color="muted" style={{ flex: 1 }}>
        {label}
        {typeof quantity === 'number' && quantity !== 0 ? ` · ${fmt(quantity)}` : ''}
      </AppText>
      <AppText size="small" weight="semibold" color="text">
        {fmtFcfa(amount ?? 0)}
      </AppText>
    </View>
  );
}

export default function RapportsScreen() {
  const { farms, farmId } = useAuth();

  const batchesQuery = useQuery({ queryKey: ['batches', farmId], queryFn: () => fetchBatches(farmId) });
  const overviewQuery = useQuery({ queryKey: ['rentabilite', farmId], queryFn: () => fetchRentabiliteOverview(farmId) });

  const lots = (batchesQuery.data ?? []).filter((b) => b.status !== 'CLOTURE');
  const [lotId, setLotId] = useState('');
  const lot = lots.find((b) => b.id === lotId) ?? lots[0];
  const batchId = lot?.id ?? '';

  const batchQuery = useQuery({
    queryKey: ['rentabilite-batch', farmId, batchId],
    queryFn: () => fetchRentabiliteBatch(farmId, batchId),
    enabled: batchId !== '',
  });

  const ov: OverviewPnl | undefined = overviewQuery.data;

  const periodFrom = ov?.period?.from?.slice(0, 10);
  const periodTo = ov?.period?.to?.slice(0, 10);
  const salesQuery = useQuery({
    queryKey: ['sales', farmId, periodFrom ?? '', periodTo ?? ''],
    queryFn: () => fetchSales(farmId, periodFrom ?? undefined, periodTo ?? undefined),
    enabled: !!periodFrom,
  });
  const pdvQuery = useQuery({ queryKey: ['points-of-sale', farmId], queryFn: () => fetchPointsOfSale(farmId) });
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
    <Screen header={<ScreenHeader title="Rentabilité & rapports" subtitle={farms[0]?.name ?? 'Ferme'} back right={<FileBarChart2 size={18} color={color.ink[300]} />} />}>

      {overviewQuery.isLoading ? (
        <Spinner label="Calcul du P&L…" />
      ) : overviewQuery.isError ? (
        <AppText size="small" color="danger">
          Calcul du P&L indisponible pour le moment. Vérifiez la connexion au serveur.
        </AppText>
      ) : ov ? (
        <>
          <Card tone={ov.netFcfa >= 0 ? 'green' : 'alert'} style={styles.card}>
            <View style={styles.rowBetween}>
              <AppText size="label" color="muted">
                P&L — {ov.period.from?.slice(0, 10)} → {ov.period.to?.slice(0, 10) ?? 'aujourd’hui'}
              </AppText>
              {ov.netFcfa >= 0 ? <TrendingUp size={18} color={color.green[600]} /> : <TrendingDown size={18} color={color.red[500]} />}
            </View>
            <View style={{ gap: 2 }}>
              <NetRow label={`Ventes (${ov.sales?.count ?? 0})`} value={fmtFcfa(ov.sales?.totalFcfa ?? 0)} />
              <NetRow label="Encaissé" value={fmtFcfa(ov.collectedFcfa ?? 0)} />
              <NetRow label="À recouvrer" value={fmtFcfa(ov.outstandingFcfa ?? 0)} negative={(ov.outstandingFcfa ?? 0) > 0} />
              <NetRow label={`Dépenses (${ov.expenses?.count ?? 0})`} value={`- ${fmtFcfa(ov.expenses?.totalFcfa ?? 0)}`} negative />
            </View>
            <View style={styles.netBox}>
              <AppText size="h3" weight="bold" color={ov.netFcfa >= 0 ? 'success' : 'danger'}>
                Résultat net : {fmtFcfa(ov.netFcfa)}
              </AppText>
            </View>
            <Button label="Exporter le rapport PDF" tone={ov.netFcfa >= 0 ? 'success' : 'danger'} size="md" icon={Download} onPress={() => void exportOverview()} />
          </Card>

          <SectionHeader title="Répartition" />
          <Card tone="default" style={{ gap: 6, paddingVertical: 10 }}>
            <AppText size="label" color="muted">
              PAR PRODUIT
            </AppText>
            {(ov.breakdown?.byProduct ?? []).map((p: RentabiliteBreakdownProduct) => (
              <BreakdownRow key={p.productType} label={p.label} quantity={p.quantity} amount={p.amountFcfa} />
            ))}
            <View style={styles.sep} />
            <AppText size="label" color="muted">
              PAR DÉPENSE
            </AppText>
            {(ov.breakdown?.byExpenseCategory ?? []).map((e: RentabiliteBreakdownExpense) => (
              <BreakdownRow key={e.category} label={e.label} amount={e.amountFcfa} />
            ))}
          </Card>

          <SectionHeader
            title="Ventes par canal"
            subtitle={canalRows.length > 0 ? `${fmt(canalRows.length)} point(s) de vente · ${fmtFcfa(canalTotal)}` : undefined}
          />
          <Card tone="default" style={{ gap: 6, paddingVertical: 10 }}>
            {canalRows.length > 0 ? (
              <>
                {canalRows.map((r) => (
                  <View key={r.pdv.id} style={styles.canalRow}>
                    <View style={styles.canalEmoji}>
                      <Store size={15} color={color.brand[600]} />
                    </View>
                    <AppText size="small" color="muted" style={{ flex: 1 }} numberOfLines={1}>
                      {r.pdv.name}
                      {r.pdv.province ? ` · ${r.pdv.province}` : ''}
                    </AppText>
                    <AppText size="small" weight="semibold" color="text">
                      {fmtFcfa(r.amount)}
                    </AppText>
                  </View>
                ))}
                <View style={styles.sep} />
                <View style={styles.rowBetween}>
                  <AppText size="body" color="muted">
                    Total canaux
                  </AppText>
                  <AppText size="body" weight="bold" color="text">
                    {fmtFcfa(canalTotal)}
                  </AppText>
                </View>
              </>
            ) : (
              <AppText size="small" color="muted">
                Aucune vente sur la période.
              </AppText>
            )}
          </Card>
        </>
      ) : null}

      <SectionHeader title="P&L par lot" />
      <AppText size="label" color="muted" style={{ marginBottom: 6 }}>
        LOT
      </AppText>
      <View style={styles.rowWrap}>
        {lots.map((b) => (
          <Pressable key={b.id} onPress={() => setLotId(b.id)} accessibilityRole="button">
            <Chip
              label={b.batchName ?? b.id}
              tone={STYLE_TONE(b.status)}
              selected={lot?.id === b.id}
              style={styles.chip}
            />
          </Pressable>
        ))}
      </View>

      {batchId !== '' ? (
        batchQuery.isLoading ? (
          <Spinner label="P&L du lot…" />
        ) : batchQuery.data ? (
          <BatchPnlCard pnl={batchQuery.data} onExport={() => void exportBatch()} />
        ) : null
      ) : (
        <AppText size="caption" color="muted">
          Aucun lot à analyser.
        </AppText>
      )}
    </Screen>
  );
}

function STYLE_TONE(status: BatchStatus) {
  return STATUS_TONE[status] ?? 'neutral';
}

function BatchPnlCard({ pnl, onExport }: { pnl: BatchPnl; onExport: () => void }) {
  const negative = pnl.netFcfa < 0;
  return (
    <Card tone={negative ? 'alert' : 'brand'} style={styles.card}>
      <View style={styles.rowBetween}>
        <View style={{ flex: 1, gap: 2 }}>
          <View style={styles.rowBetween}>
            <AppText size="body" weight="bold" color="text" style={{ flex: 1 }}>
              {pnl.batchName ?? pnl.batchId}
            </AppText>
            <Chip label={pnl.status} tone={STYLE_TONE(pnl.status)} />
          </View>
          <AppText size="caption" color="muted">
            {pnl.kgSold > 0 ? `${fmt(pnl.kgSold)} kg vendus · ` : ''}
            {pnl.birdsSold > 0 ? `${fmt(pnl.birdsSold)} poulets · ` : ''}
            {pnl.eggsSold > 0 ? `${fmt(pnl.eggsSold)} alvéoles d’œufs` : ''}
          </AppText>
        </View>
      </View>
      <View style={{ gap: 2 }}>
        <NetRow label="Revenus" value={fmtFcfa(pnl.revenueFcfa)} />
        <NetRow label="Dépenses (hors intrants)" value={`- ${fmtFcfa(pnl.expensesFcfa)}`} negative />
        <NetRow label="Résultat net" value={fmtFcfa(pnl.netFcfa)} negative={negative} />
        <View style={styles.rowBetween}>
          <AppText size="small" color="muted">
            Marge
          </AppText>
          <AppText size="small" weight="semibold" color={negative ? 'danger' : 'text'}>
            {typeof pnl.marginPct === 'number' ? `${pnl.marginPct.toLocaleString('fr-FR')} %` : '—'}
          </AppText>
        </View>
        <View style={styles.rowBetween}>
          <AppText size="small" color="muted">
            Coût de revient / kg
          </AppText>
          <AppText size="small" weight="semibold" color="text">
            {typeof pnl.costPerKgFcfa === 'number' ? fmtFcfa(pnl.costPerKgFcfa) : '—'}
          </AppText>
        </View>
      </View>
      {pnl.enrichment ? (
        <View style={{ gap: 2 }}>
          <View style={styles.sep} />
          <AppText size="label" color="faint">
            COÛTS D’INTRANTS DÉDUITS AUTOMATIQUEMENT
          </AppText>
          <View style={styles.rowBetween}>
            <AppText size="small" color="muted">
              Poussins
            </AppText>
            <AppText size="small" weight="semibold" color="text">
              {fmtFcfa(pnl.enrichment.chickCostFcfa ?? 0)}
            </AppText>
          </View>
          <View style={styles.rowBetween}>
            <AppText size="small" color="muted">
              Aliments (lots liés)
            </AppText>
            <AppText size="small" weight="semibold" color="text">
              {fmtFcfa(pnl.enrichment.feedLotsCostFcfa ?? 0)}
            </AppText>
          </View>
        </View>
      ) : null}
      <AppText size="caption" color="faint" style={{ textAlign: 'center' }}>
        Coûts de poussins et aliments déduits automatiquement des intrants HACCP.
      </AppText>
      <Button label="Exporter le P&L du lot" tone="ghost" size="md" icon={Download} onPress={onExport} />
    </Card>
  );
}

const styles = StyleSheet.create({
  card: {
    gap: 10,
    padding: 14,
  },
  rowBetween: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 8,
  },
  netBox: {
    borderTopWidth: 1,
    borderTopColor: palette.border,
    paddingTop: 8,
  },
  sep: {
    height: 1,
    backgroundColor: palette.border,
    marginVertical: 6,
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
  canalRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  canalEmoji: {
    width: 26,
    height: 26,
    borderRadius: 7,
    backgroundColor: palette.brand[50],
    alignItems: 'center',
    justifyContent: 'center',
  },
});