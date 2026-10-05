import React from 'react';
import { Pressable, StyleSheet, View } from 'react-native';
import { useQuery } from '@tanstack/react-query';
import { useRouter } from 'expo-router';
import { ArrowDownToLine, Banknote, BookOpen, ClipboardList, TrendingUp } from 'lucide-react-native';

import { Screen, ScreenHeader } from '@/components/ui/Screen';
import { AppText } from '@/components/ui/AppText';
import { Card } from '@/components/ui/Card';
import { Chip } from '@/components/ui/Chip';
import { SectionHeader } from '@/components/ui/SectionHeader';
import { Spinner } from '@/components/ui/Spinner';
import { useAuth } from '@/auth/AuthContext';
import { fetchDashboard, fetchCaisseCurrent } from '@/api';
import { color, palette, fmtFcfa } from '@/constants/theme';

export default function ActivitesScreen() {
  const router = useRouter();
  const { farmId } = useAuth();

  const dashboard = useQuery({ queryKey: ['dashboard', farmId], queryFn: () => fetchDashboard(farmId) });
  const caisse = useQuery({ queryKey: ['caisse', farmId], queryFn: () => fetchCaisseCurrent(farmId) });

  const d = dashboard.data;
  const c = caisse.data;

  return (
    <Screen
      bottomPad={120}
      refreshing={dashboard.isFetching || caisse.isFetching}
      onRefresh={() => { void dashboard.refetch(); void caisse.refetch(); }}
      header={<ScreenHeader title="Activités" subtitle="Toutes les opérations de la ferme" />}>


      {dashboard.isLoading ? (
        <Spinner label="Chargement…" />
      ) : d ? (
        <>
          <Card tone="brand" style={{ gap: 8, padding: 14 }}>
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
              <View style={[styles.summaryIcon, { backgroundColor: color.brand[50] }]}>
                <TrendingUp size={16} color={color.brand[600]} />
              </View>
              <AppText size="body" weight="bold" color="text">Résumé du jour</AppText>
            </View>
            <View style={styles.summaryGrid}>
              <View style={styles.summaryItem}>
                <AppText size="h3" weight="bold" color="text">{fmtFcfa(d.collectedTodayFcfa)}</AppText>
                <AppText size="small" color="muted">Encaissé</AppText>
              </View>
              <View style={styles.summaryItem}>
                <AppText size="h3" weight="bold" color="text">{d.healthOverview.length}</AppText>
                <AppText size="small" color="muted">Lots actifs</AppText>
              </View>
              <View style={styles.summaryItem}>
                <AppText size="h3" weight="bold" color={d.alerts.rouge > 0 ? 'danger' : 'text'}>{d.alerts.rouge + d.alerts.jaune}</AppText>
                <AppText size="small" color="muted">Alertes</AppText>
              </View>
            </View>
          </Card>

          <SectionHeader title="Caisse du jour" />
          {c ? (
            <Card tone={c.session.status === 'OPEN' ? 'green' : 'default'} style={{ gap: 6, padding: 14 }}>
              <View style={styles.caisseHead}>
                <AppText size="body" weight="bold" color="text">
                  Caisse {c.session.status === 'OPEN' ? 'ouverte' : 'fermée'}
                </AppText>
                <Chip
                  label={c.session.status === 'OPEN' ? 'OUVERTE' : 'FERMÉE'}
                  tone={c.session.status === 'OPEN' ? 'green' : 'neutral'}
                  dot
                />
              </View>
              <View style={styles.caisseRow}>
                <View style={styles.caisseStat}>
                  <AppText size="bodyM" weight="bold" color="success">{fmtFcfa(c.inFcfa)}</AppText>
                  <AppText size="small" color="muted">Entrées</AppText>
                </View>
                <View style={styles.caisseStat}>
                  <AppText size="bodyM" weight="bold" color="danger">{fmtFcfa(c.outFcfa)}</AppText>
                  <AppText size="small" color="muted">Sorties</AppText>
                </View>
                <View style={styles.caisseStat}>
                  <AppText size="bodyM" weight="bold" color="text">{fmtFcfa(c.expectedBalanceFcfa)}</AppText>
                  <AppText size="small" color="muted">Solde</AppText>
                </View>
              </View>
              <Pressable onPress={() => router.push('/caisse')} accessibilityRole="button">
                <AppText size="small" weight="semibold" color="brand" style={{ textAlign: 'center', marginTop: 4 }}>
                  Voir la caisse complète →
                </AppText>
              </Pressable>
            </Card>
          ) : (
            <Card tone="default" style={{ padding: 14 }}>
              <AppText size="body" color="muted">Aucune session de caisse aujourd&apos;hui.</AppText>
            </Card>
          )}

          <SectionHeader title="Dernières saisies" subtitle="Lots en cours" />
          <View style={{ gap: 8 }}>
            {d.healthOverview.slice(0, 5).map((row) => (
              <Card key={row.batchId} onPress={() => router.push(`/lot/${row.batchId}`)} style={{ padding: 12 }}>
                <View style={styles.entryRow}>
                  <View style={styles.entryIcon}>
                    <BookOpen size={14} color={color.brand[600]} />
                  </View>
                  <View style={{ flex: 1 }}>
                    <AppText size="body" weight="semibold" color="text" numberOfLines={1}>
                      {row.batchName ?? 'Lot'}
                    </AppText>
                    <AppText size="small" color="muted">
                      J{row.ageDays} · {row.liveCount} vivants · mortalité {row.mortalityPercent.toFixed(1)}%
                    </AppText>
                  </View>
                  {row.lastEntryLagDays != null && row.lastEntryLagDays > 0 ? (
                    <Chip label={`-${row.lastEntryLagDays} j`} tone="amber" />
                  ) : (
                    <Chip label="OK" tone="green" dot />
                  )}
                </View>
              </Card>
            ))}
          </View>

          <SectionHeader title="Actions rapides" />
          <View style={styles.quickGrid}>
            <Pressable onPress={() => router.push('/rapports')} style={({ pressed }) => [styles.quickTile, pressed && { opacity: 0.7 }]} accessibilityRole="button">
              <View style={[styles.quickIcon, { backgroundColor: color.green[50] }]}>
                <Banknote size={20} color={color.green[600]} />
              </View>
              <AppText size="small" weight="semibold" color="text">Rapports</AppText>
            </Pressable>
            <Pressable onPress={() => router.push('/caisse')} style={({ pressed }) => [styles.quickTile, pressed && { opacity: 0.7 }]} accessibilityRole="button">
              <View style={[styles.quickIcon, { backgroundColor: color.accent[50] }]}>
                <ArrowDownToLine size={20} color={color.accent[600]} />
              </View>
              <AppText size="small" weight="semibold" color="text">Caisse</AppText>
            </Pressable>
            <Pressable onPress={() => router.push('/clients')} style={({ pressed }) => [styles.quickTile, pressed && { opacity: 0.7 }]} accessibilityRole="button">
              <View style={[styles.quickIcon, { backgroundColor: color.brand[50] }]}>
                <ClipboardList size={20} color={color.brand[600]} />
              </View>
              <AppText size="small" weight="semibold" color="text">Clients</AppText>
            </Pressable>
          </View>
        </>
      ) : null}
    </Screen>
  );
}

const styles = StyleSheet.create({
  summaryIcon: {
    width: 28,
    height: 28,
    borderRadius: 8,
    alignItems: 'center',
    justifyContent: 'center',
  },
  summaryGrid: {
    flexDirection: 'row',
    justifyContent: 'space-between',
  },
  summaryItem: {
    flex: 1,
    gap: 1,
  },
  caisseHead: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  caisseRow: {
    flexDirection: 'row',
    gap: 12,
  },
  caisseStat: {
    flex: 1,
    gap: 1,
  },
  entryRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
  },
  entryIcon: {
    width: 28,
    height: 28,
    borderRadius: 8,
    backgroundColor: color.brand[50],
    alignItems: 'center',
    justifyContent: 'center',
  },
  quickGrid: {
    flexDirection: 'row',
    gap: 10,
  },
  quickTile: {
    flex: 1,
    backgroundColor: palette.surface,
    borderRadius: 16,
    borderWidth: 1,
    borderColor: palette.border,
    padding: 14,
    gap: 6,
    alignItems: 'center',
  },
  quickIcon: {
    width: 40,
    height: 40,
    borderRadius: 12,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 2,
  },
});
