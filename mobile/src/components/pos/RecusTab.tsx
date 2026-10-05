import React from 'react';
import { ScrollView, StyleSheet, View } from 'react-native';
import { ChevronRight, ReceiptText } from 'lucide-react-native';

import { AppText } from '@/components/ui/AppText';
import { Card } from '@/components/ui/Card';
import { Chip } from '@/components/ui/Chip';
import { EmptyState } from '@/components/ui/EmptyState';
import { SectionHeader } from '@/components/ui/SectionHeader';
import type { SaleSummary } from '@/api/types';
import { color, fmt, fmtFcfa, radii, spacing } from '@/constants/theme';

interface RecusTabProps {
  sales: SaleSummary[];
  subtitle?: string;
  onSelectSale?: (sale: SaleSummary) => void;
}

export function RecusTab({ sales, subtitle, onSelectSale }: RecusTabProps) {
  const total = sales.reduce((s, x) => s + x.totalAmountFcfa, 0);

  return (
    <ScrollView style={styles.scroll} contentContainerStyle={styles.content} showsVerticalScrollIndicator={false}>
      <SectionHeader title="Reçus du jour" subtitle={subtitle} />

      {sales.length === 0 ? (
        <Card tone="default">
          <EmptyState
            emoji="🧾"
            title="Aucun reçu aujourd’hui"
            description="Les tickets d’encaissement du jour apparaîtront ici. Touchez un ticket pour l’apercevoir et télécharger son PDF."
          />
        </Card>
      ) : (
        <>
          <Card tone="brand" style={styles.summary}>
            <View style={{ flex: 1 }}>
              <AppText size="h2" weight="bold" color="text">
                {fmtFcfa(total)}
              </AppText>
              <AppText size="small" color="muted">
                {fmt(sales.length)} ticket{sales.length > 1 ? 's' : ''} encaissé{sales.length > 1 ? 's' : ''} aujourd’hui
              </AppText>
            </View>
            <View style={styles.summaryIcon}>
              <ReceiptText size={22} color={color.brand[600]} />
            </View>
          </Card>

          <View style={{ gap: spacing.sm }}>
            {sales.map((s) => (
              <Card key={s.id} onPress={() => onSelectSale?.(s)} style={styles.row}>
                <View style={{ flex: 1, gap: 2 }}>
                  <View style={styles.rowTop}>
                    <AppText size="body" weight="bold" color="text" numberOfLines={1}>
                      {s.referenceNumber}
                    </AppText>
                    <Chip label={s.status === 'CANCELLED' ? 'ANNULÉ' : 'ENCAISSÉ'} tone={s.status === 'CANCELLED' ? 'red' : 'green'} />
                  </View>
                  <AppText size="small" color="muted" numberOfLines={1}>
                    {s.customer?.fullName ?? 'Client marchand'}
                    {s.createdAt ? ` · ${s.createdAt.slice(11, 16)}` : ''}
                  </AppText>
                  {s.items.length > 0 ? (
                    <AppText size="small" color="muted" numberOfLines={1}>
                      {s.items.map((i) => i.label).filter(Boolean).join(', ')}
                    </AppText>
                  ) : null}
                </View>
                <AppText size="body" weight="bold" color="accent">
                  {fmtFcfa(s.totalAmountFcfa)}
                </AppText>
                <ChevronRight size={18} color={color.ink[300]} />
              </Card>
            ))}
          </View>
        </>
      )}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  scroll: {
    flex: 1,
    paddingHorizontal: spacing.lg,
    paddingTop: spacing.md,
  },
  content: {
    paddingBottom: spacing.lg,
  },
  summary: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
    marginBottom: spacing.sm,
  },
  summaryIcon: {
    width: 40,
    height: 40,
    borderRadius: radii.md,
    backgroundColor: color.brand[50],
    alignItems: 'center',
    justifyContent: 'center',
  },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    padding: 12,
  },
  rowTop: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
});