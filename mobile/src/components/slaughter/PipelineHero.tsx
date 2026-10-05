import React from 'react';
import { Pressable, StyleSheet, TextInput, View } from 'react-native';
import { Check, Package, Scale, Send, Truck } from 'lucide-react-native';

import { AppText } from '@/components/ui/AppText';
import { Card } from '@/components/ui/Card';
import { Chip } from '@/components/ui/Chip';
import { MetricTile } from '@/components/ui/MetricTile';
import { pipelineOrders, reserveCarcasses, slaughterRefs, type Horizon, type HorizonKind } from '@/utils/slaughterInsights';
import type { SlaughterOrder } from '@/api/types';
import { color, palette, spacing } from '@/constants/theme';

const SCOPE_OPTIONS: readonly { key: HorizonKind; label: string }[] = [
  { key: 'today', label: "Aujourd'hui" },
  { key: 'week', label: '7 j' },
  { key: 'month', label: '30 j' },
  { key: 'all', label: 'Tout' },
  { key: 'custom', label: 'Date perso' },
];

function formatKg(n: number): string {
  return `${Math.round(n)} kg`;
}

export interface PipelineHeroProps {
  orders: SlaughterOrder[];
  horizon: Horizon;
  onHorizonChange: (h: Horizon) => void;
  today: string;
}

export function PipelineHero({ orders, horizon, onHorizonChange, today }: PipelineHeroProps) {
  const p = pipelineOrders(orders, horizon, today);
  const reserve = reserveCarcasses(orders);
  const refs = slaughterRefs(orders);
  const pending = p.drafts.count + p.sent.count;
  const intro =
    pending > 0
      ? `${p.drafts.count} brouillon(s) prêt(s) à envoyer · ${p.sent.count} envoyé(s) à réceptionner`
      : p.processed.count > 0
        ? `Aucun ordre en attente · ${p.processed.count} traitement(s) dans la période`
        : 'Aucun ordre planifié dans cette période.';

  return (
    <Card style={styles.hero}>
      <View style={styles.heroHead}>
        <AppText size="label" color="muted">
          PIPELINE ABATTOIR
        </AppText>
        <View style={styles.scopeRow}>
          {SCOPE_OPTIONS.map((o) => (
            <Pressable
              key={o.key}
              onPress={() => onHorizonChange({ kind: o.key, date: o.key === 'custom' ? (horizon.date ?? today) : undefined })}
              accessibilityRole="button">
              <Chip label={o.label} tone="outline" selected={horizon.kind === o.key} style={styles.scopeChip} />
            </Pressable>
          ))}
        </View>
      </View>

      {horizon.kind === 'custom' ? (
        <TextInput
          value={horizon.date ?? ''}
          onChangeText={(t) => onHorizonChange({ kind: 'custom', date: t })}
          placeholder="AAAA-MM-JJ"
          placeholderTextColor={color.ink[300]}
          autoCapitalize="none"
          style={styles.dateInput}
          editable
        />
      ) : null}

      <View style={styles.tiles}>
        <MetricTile
          label="Brouillons"
          value={String(p.drafts.count)}
          sub={`${p.drafts.birds} oiseaux`}
          tone="brand"
          icon={Send}
          compact
          threeCol
          labelLines={2}
          labelBelow
          style={styles.tile}
        />
        <MetricTile
          label="Envoyés"
          value={String(p.sent.count)}
          sub={`${p.sent.birds} oiseaux`}
          tone="default"
          icon={Truck}
          compact
          threeCol
          labelLines={2}
          labelBelow
          style={styles.tile}
        />
        <MetricTile
          label="Carcasse produite"
          value={formatKg(p.processed.kgCarcass)}
          sub={`${p.processed.birds} oiseaux`}
          tone="green"
          icon={Check}
          compact
          threeCol
          labelLines={2}
          labelBelow
          style={styles.tile}
        />
        <MetricTile
          label="Réserve POS"
          value={String(reserve)}
          sub="carcasses vendables"
          tone="accent"
          icon={Package}
          compact
          threeCol
          labelLines={2}
          labelBelow
          style={styles.tile}
        />
      </View>

      <View style={styles.insight}>
        <AppText size="small" color="muted">
          {intro}
        </AppText>
        {refs.yield.n > 0 ? (
          <View style={styles.yieldRow}>
            <Scale size={13} color={color.ink[400]} />
            <AppText size="small" color="faint">
              Rendement moyen {refs.yield.avgRendementPct?.toFixed(1)} % sur {refs.yield.n} traitement(s)
            </AppText>
          </View>
        ) : null}
      </View>
    </Card>
  );
}

const styles = StyleSheet.create({
  hero: {
    gap: spacing.lg,
    padding: 14,
  },
  heroHead: {
    gap: 8,
  },
  scopeRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 6,
  },
  scopeChip: {
    marginBottom: 2,
  },
  dateInput: {
    height: 40,
    borderWidth: 1,
    borderRadius: 12,
    borderColor: palette.border,
    paddingHorizontal: 12,
    fontSize: 13,
    color: color.ink[800],
    backgroundColor: color.surface,
  },
  tiles: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 6,
  },
  tile: {
    flexGrow: 1,
    flexBasis: '23%',
    minWidth: 0,
  },
  insight: {
    gap: 6,
  },
  yieldRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
});