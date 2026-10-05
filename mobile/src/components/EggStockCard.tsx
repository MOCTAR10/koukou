import React, { useState } from 'react';
import { Image, Pressable, StyleSheet, View } from 'react-native';
import { ChevronDown, Calendar } from 'lucide-react-native';
import * as Haptics from 'expo-haptics';

import { AppText } from './ui/AppText';
import { Card } from './ui/Card';
import { color, palette, radii } from '@/constants/theme';

interface DailyCount {
  day: string;
  count: number;
}

interface EggStockCardProps {
  selectedDate: Date;
  availableEggs: number;
  availableAlveoles: number;
  soldAlveoles: number;
  isFetching?: boolean;
  layRatePercent: number | null;
  pondeuseLayRate: number | null;
  dailyData: DailyCount[];
  breakdown?: { collected: number; sellable: number; cracked: number; small: number; doubleYolk: number; dirty: number };
}

const DAY_LABELS = ['L', 'M', 'M', 'J', 'V', 'S', 'D'];
const BAR_HEIGHT = 52;

function formatDateFull(d: Date): string {
  return d.toLocaleDateString('fr-FR', { day: 'numeric', month: 'long', year: 'numeric' });
}

function formatDateShort(d: Date): string {
  return d.toLocaleDateString('fr-FR', { day: 'numeric', month: 'short' });
}

export function EggStockCard({
  selectedDate,
  availableEggs,
  availableAlveoles,
  soldAlveoles,
  isFetching,
  layRatePercent,
  pondeuseLayRate,
  dailyData,
  breakdown,
}: EggStockCardProps) {
  const [showTrays, setShowTrays] = useState(false);
  const [expanded, setExpanded] = useState(false);

  const today = new Date();
  const isToday =
    selectedDate.toDateString() === today.toDateString();

  const displayValue = showTrays ? availableAlveoles : availableEggs;
  const displayUnit = showTrays ? 'alvéoles' : 'œufs';

  // Cohérence avec la « répartition » : quand le stock affiché est 0 mais que
  // la production (breakdown) est non nulle, on ne parle de « tout vendu » que
  // s'il existe réellement des ventes d'œufs (soldAlveoles > 0). Sinon le 0
  // trahit des données en cours d'actualisation (requête tableau de bord).
  const producedTotal = breakdown?.collected ?? 0;
  const stockSeenZero = availableEggs === 0 && producedTotal > 0;
  const soldOut = stockSeenZero && soldAlveoles > 0;

  const subText = soldOut
    ? `Tout le stock a été vendu · ${fmtCompact(producedTotal)} œufs produits`
    : stockSeenZero && isFetching
      ? 'Actualisation du stock…'
      : stockSeenZero
        ? `Pas de stock disponible · ${fmtCompact(producedTotal)} œufs produits`
        : showTrays
          ? `= ${(availableAlveoles * 30).toLocaleString('fr-FR')} œufs`
          : `= ${availableAlveoles} alvéole${availableAlveoles !== 1 ? 's' : ''}`;

  const maxCount = Math.max(...dailyData.map((d) => d.count), 1);
  const totalCount = dailyData.reduce((s, d) => s + d.count, 0);

  return (
    <Card tone='default' style={styles.card}>
      {/* ── Header: icon + title + date ── */}
      <View style={styles.header}>
        <View style={styles.headerLeft}>
          <Image
            source={showTrays ? require('@/assets/images/alveole2.jpg') : require('@/assets/images/oeuf2.jpg')}
            style={styles.eggImage}
            resizeMode='contain'
          />
          <AppText size='body' weight='bold' color='text'>Œufs</AppText>
          <AppText size='small' color='faint'>· {formatDateShort(today)}</AppText>
        </View>
      </View>

      {/* ── Sub-header: date display + Œufs/Alvéoles toggle + Plus ── */}
      <View style={styles.subHeader}>
        <View style={styles.datePill}>
          <Calendar size={12} color={palette.brand[600]} />
          <AppText size='small' weight='semibold' color='brand'>
            {isToday ? 'Aujourd\'hui' : formatDateFull(selectedDate)}
          </AppText>
        </View>
        <View style={styles.subHeaderRight}>
          <View style={styles.toggle}>
            <Pressable
              onPress={() => { Haptics.selectionAsync().catch(() => {}); setShowTrays(false); }}
              style={[styles.toggleBtn, !showTrays && styles.toggleActive]}
              accessibilityRole='button'>
              <AppText size='small' weight={!showTrays ? 'bold' : 'medium'} color={!showTrays ? 'surface' : 'muted'}>
                Œufs
              </AppText>
            </Pressable>
            <Pressable
              onPress={() => { Haptics.selectionAsync().catch(() => {}); setShowTrays(true); }}
              style={[styles.toggleBtn, showTrays && styles.toggleActive]}
              accessibilityRole='button'>
              <AppText size='small' weight={showTrays ? 'bold' : 'medium'} color={showTrays ? 'surface' : 'muted'}>
                Alvéoles
              </AppText>
            </Pressable>
          </View>
          <Pressable onPress={() => { Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light).catch(() => {}); setExpanded(!expanded); }} accessibilityRole='button' style={[styles.expandBtn, expanded && styles.expandBtnActive]}>
            <AppText size='small' weight='semibold' color={expanded ? 'surface' : 'brand'}>
              {expanded ? 'Moins' : 'Plus'}
            </AppText>
            <ChevronDown size={12} color={expanded ? palette.brand[50] : palette.brand[600]} style={{ transform: [{ rotate: expanded ? '180deg' : '0deg' }] }} />
          </Pressable>
        </View>
      </View>

      {/* ── Body: big number + mini metrics ── */}
      <View style={styles.bodyRow}>
        <View style={styles.bigBlock}>
          <AppText size='small' weight='semibold' color='muted'>En stock</AppText>
          <View style={styles.valueRow}>
            <AppText size='h1' weight='bold' color={palette.brand[600]} numberOfLines={1} adjustsFontSizeToFit minimumFontScale={0.5}>
              {displayValue.toLocaleString('fr-FR')}
            </AppText>
            <AppText size='body' weight='medium' color='muted'>
              {displayUnit}
            </AppText>
          </View>
          <AppText size='small' color={soldOut ? 'muted' : 'faint'}>
            {subText}
          </AppText>
        </View>

        <View style={styles.miniMetricsPill}>
          <View style={styles.miniItem}>
            <AppText size='small' weight='bold' color='brand' numberOfLines={1} adjustsFontSizeToFit minimumFontScale={0.65}>
              {layRatePercent != null ? `${layRatePercent.toFixed(0)}%` : '—'}
            </AppText>
            <AppText size='small' color='faint'>Ponte</AppText>
          </View>
        </View>
      </View>

      {/* ── Expanded: lay rates + chart ── */}
      {expanded && (
        <View style={styles.expandedSection}>
          <View style={styles.chartDivider} />
          <View style={styles.layRateRow}>
            <View style={styles.layRateTile}>
              <AppText size='small' color='muted'>Ponte</AppText>
              <AppText
                size='body'
                weight='bold'
                color={pondeuseLayRate != null && pondeuseLayRate >= 100 ? palette.red[500] : pondeuseLayRate != null && pondeuseLayRate >= 80 ? palette.green[600] : pondeuseLayRate != null ? palette.amber[600] : 'faint'}>
                {pondeuseLayRate != null ? `${pondeuseLayRate.toFixed(0)}%` : '—'}
              </AppText>
              <AppText size='small' color={pondeuseLayRate != null && pondeuseLayRate >= 100 ? palette.red[500] : 'faint'}>
                {pondeuseLayRate != null && pondeuseLayRate >= 100 ? 'Œufs ≥ effectif — à vérifier' : pondeuseLayRate != null && pondeuseLayRate >= 80 ? 'Soutenue' : pondeuseLayRate != null ? 'En montée' : 'Pas de données'}
              </AppText>
            </View>
          </View>
          <View style={styles.chartHeader}>
            <AppText size='small' weight='semibold' color='muted'>
              Récolte 7 jours
            </AppText>
            <AppText size='small' color='faint'>
              Total {fmtCompact(totalCount)}
            </AppText>
          </View>
          <View style={styles.chartRow}>
            {dailyData.map((d, i) => {
              const pct = maxCount > 0 ? d.count / maxCount : 0;
              const barH = Math.max(pct * BAR_HEIGHT, d.count > 0 ? 4 : 0);
              const isToday = i === dailyData.length - 1;
              const isMax = d.count === maxCount && d.count > 0;
              return (
                <View key={i} style={styles.barCol}>
                  <View style={styles.barValWrap}>
                    <AppText
                      size='small'
                      weight={isToday ? 'bold' : 'medium'}
                      color={isToday ? 'brand' : isMax ? 'text' : 'faint'}
                      numberOfLines={1}
                      adjustsFontSizeToFit
                      minimumFontScale={0.7}>
                      {d.count > 0 ? fmtCompact(d.count) : ''}
                    </AppText>
                  </View>
                  <View style={styles.barTrack}>
                    <View
                      style={[
                        styles.barFill,
                        {
                          height: barH,
                          backgroundColor: isToday
                            ? palette.brand[500]
                            : isMax
                              ? palette.brand[300]
                              : palette.brand[100],
                        },
                      ]}
                    />
                  </View>
                  <View style={styles.dayLabelWrap}>
                    <AppText
                      size='small'
                      weight={isToday ? 'bold' : 'medium'}
                      color={isToday ? 'brand' : 'faint'}>
                      {DAY_LABELS[i]}
                    </AppText>
                  </View>
                </View>
              );
            })}
          </View>

          {/* ── Répartition par catégorie ── */}
          {breakdown && (
            <View style={styles.categorySection}>
              <View style={styles.chartDivider} />
              <View style={styles.chartHeader}>
                <AppText size='small' weight='semibold' color='muted'>Répartition par catégorie</AppText>
                <AppText size='small' color='faint'>Total {fmtCompact(breakdown.collected)}</AppText>
              </View>
              {breakdown.collected > 0 ? (
                <>
                  <View style={styles.eggBar}>
                    {[
                      { key: 'sellable', count: breakdown.sellable, color: palette.green[600] },
                      { key: 'small', count: breakdown.small, color: palette.brand[500] },
                      { key: 'doubleYolk', count: breakdown.doubleYolk, color: palette.amber[500] },
                      { key: 'dirty', count: breakdown.dirty, color: color.ink[400] },
                      { key: 'cracked', count: breakdown.cracked, color: palette.red[500] },
                    ].filter((r) => r.count > 0).map((r) => (
                      <View key={r.key} style={[styles.eggBarSeg, { backgroundColor: r.color, flex: r.count }]} />
                    ))}
                  </View>
                  <View style={{ gap: 8 }}>
                    {[
                      { key: 'sellable', label: 'Commercialisables', count: breakdown.sellable, color: palette.green[600] },
                      { key: 'small', label: 'Petits œufs', count: breakdown.small, color: palette.brand[500] },
                      { key: 'doubleYolk', label: 'Double jaune', count: breakdown.doubleYolk, color: palette.amber[500] },
                      { key: 'dirty', label: 'Œufs sales', count: breakdown.dirty, color: color.ink[400] },
                      { key: 'cracked', label: 'Fêlés / abîmés', count: breakdown.cracked, color: palette.red[500] },
                    ].map((r) => {
                      const p = Math.round((r.count / breakdown.collected) * 100);
                      return (
                        <View key={r.key} style={{ gap: 3 }}>
                          <View style={styles.eggRow}>
                            <View style={[styles.eggRowDot, { backgroundColor: r.color }]} />
                            <AppText size='small' color='text' style={{ flex: 1 }}>{r.label}</AppText>
                            <AppText size='small' weight='bold' color='text'>{r.count.toLocaleString('fr-FR')}</AppText>
                            <AppText size='caption' color='muted' style={styles.eggRowPct}>{p}%</AppText>
                          </View>
                          <View style={styles.eggRowBar}>
                            <View style={[styles.eggRowBarFill, { backgroundColor: r.color, width: `${Math.max(1, p)}%` }]} />
                          </View>
                        </View>
                      );
                    })}
                  </View>
                </>
              ) : (
                <AppText size='small' color='faint'>Aucune répartition déclarée pour les bandes actives.</AppText>
              )}
            </View>
          )}
        </View>
      )}
    </Card>
  );
}

/** Build 7-day estimated egg data from lay rate and live count. */
export function buildEggDailyData(
  liveCount: number,
  layRatePct: number | null,
): DailyCount[] {
  const dayNames = ['Lun', 'Mar', 'Mer', 'Jeu', 'Ven', 'Sam', 'Dim'];
  const avg = layRatePct != null && layRatePct > 0
    ? Math.round((liveCount * layRatePct) / 100)
    : 0;
  const seed = [1.02, 0.98, 1.05, 1.0, 0.95, 0.78, 0.72];
  return dayNames.map((day, i) => ({
    day,
    count: avg > 0 ? Math.round(avg * seed[i]) : 0,
  }));
}

function fmtCompact(n: number): string {
  if (n >= 10000) return `${(n / 1000).toFixed(1)}k`;
  return n.toLocaleString('fr-FR');
}

const styles = StyleSheet.create({
  card: {
    padding: 10,
    paddingTop: 2,
    marginTop: 6,
    gap: 3,
  },
  /* ── Header ── */
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  headerLeft: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  eggImage: { width: 44, height: 44 },
  /* ── Sub-header ── */
  subHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    gap: 8,
  },
  subHeaderRight: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  datePill: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 16,
    backgroundColor: palette.brand[50],
    borderWidth: 1,
    borderColor: palette.brand[200],
  },
  toggle: {
    flexDirection: 'row',
    backgroundColor: palette.surfaceAlt,
    borderRadius: radii.pill,
    padding: 2,
  },
  toggleBtn: {
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: radii.pill,
  },
  toggleActive: {
    backgroundColor: palette.brand[600],
  },
  expandBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 3,
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 20,
    backgroundColor: palette.brand[50],
    borderWidth: 1,
    borderColor: palette.brand[200],
  },
  expandBtnActive: {
    backgroundColor: palette.brand[600],
    borderColor: palette.brand[600],
  },
  /* ── Body ── */
  bodyRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-end',
    gap: 8,
  },
  bigBlock: {
    flex: 1,
    minWidth: 0,
    gap: 2,
  },
  valueRow: {
    flexDirection: 'row',
    alignItems: 'baseline',
    gap: 6,
  },
  miniItem: {
    flexShrink: 1,
    alignItems: 'center',
    paddingHorizontal: 6,
  },
  miniMetricsPill: {
    flexShrink: 1,
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: palette.brand[50],
    borderRadius: radii.lg,
    borderWidth: 1,
    borderColor: palette.brand[100],
    paddingVertical: 5,
    paddingHorizontal: 3,
  },
  /* ── Lay rate row (expanded) ── */
  layRateRow: {
    flexDirection: 'row',
    gap: 0,
  },
  layRateTile: {
    flex: 1,
    alignItems: 'center',
    paddingVertical: 8,
    gap: 2,
  },
  /* ── Expanded section ── */
  expandedSection: {
    backgroundColor: palette.brand[50],
    borderRadius: 12,
    borderWidth: 1,
    borderColor: palette.brand[100],
    padding: 12,
    gap: 8,
    marginTop: 10,
  },
  chartDivider: {
    height: StyleSheet.hairlineWidth,
    backgroundColor: color.border,
  },
  chartHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  chartRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
  },
  barCol: {
    flex: 1,
    alignItems: 'center',
    marginHorizontal: 2,
  },
  barValWrap: {
    height: 14,
    justifyContent: 'center',
    alignItems: 'center',
  },
  barTrack: {
    width: 24,
    height: BAR_HEIGHT,
    borderRadius: 5,
    backgroundColor: palette.surfaceAlt,
    justifyContent: 'flex-end',
    overflow: 'hidden',
  },
  barFill: {
    width: '100%',
    borderTopLeftRadius: 4,
    borderTopRightRadius: 4,
  },
  dayLabelWrap: {
    height: 14,
    justifyContent: 'center',
    alignItems: 'center',
    marginTop: 2,
  },
  categorySection: {
    marginTop: 10,
    gap: 8,
  },
  eggBar: {
    flexDirection: 'row',
    height: 8,
    borderRadius: 4,
    overflow: 'hidden',
    backgroundColor: palette.accent[50],
  },
  eggBarSeg: {},
  eggRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  eggRowDot: { width: 10, height: 10, borderRadius: radii.pill },
  eggRowPct: { width: 40, textAlign: 'right' },
  eggRowBar: {
    height: 4,
    borderRadius: radii.pill,
    backgroundColor: palette.surfaceAlt,
    overflow: 'hidden',
  },
  eggRowBarFill: { height: '100%', borderRadius: radii.pill },
});
