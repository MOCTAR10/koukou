import React from 'react';
import { StyleSheet, View } from 'react-native';
import { useQuery } from '@tanstack/react-query';
import { Boxes } from 'lucide-react-native';

import { AppText } from '@/components/ui/AppText';
import { Card } from '@/components/ui/Card';
import { Chip } from '@/components/ui/Chip';
import { SectionHeader } from '@/components/ui/SectionHeader';
import { Spinner } from '@/components/ui/Spinner';
import { StaleNotice } from '@/components/ui/StaleNotice';
import { fetchDeclarativeStock } from '@/api/poufa';
import { cachedRead } from '@/offline/ref-cache';
import { fmtQty, sortStockRows } from '@/poufa/deliveries';
import { color, semantic } from '@/constants/theme';
import { errorText } from '@/api/errorText';

/**
 * Declarative stock of the programme inputs (CDC 18): received minus what the
 * farm declared consumed, lost, sold or used. Read-only, kept for offline.
 */
export function DeclarativeStockCard({ farmId }: { farmId: string }) {
  const stock = useQuery({
    queryKey: ['declarative-stock', farmId],
    queryFn: () => cachedRead(`declarative-stock.${farmId}`, () => fetchDeclarativeStock(farmId)),
    enabled: Boolean(farmId),
  });
  const rows = sortStockRows(stock.data?.rows ?? []);

  return (
    <View style={{ gap: 8 }}>
      <SectionHeader
        title="Stock déclaratif"
        subtitle="Reçu moins consommé, perdu, vendu ou utilisé"
        icon={Boxes}
        iconColor={color.brand[700]}
        iconBg={semantic.primarySoft}
      />
      <StaleNotice show={stock.isError && Boolean(stock.data)} updatedAt={stock.dataUpdatedAt} />
      <Card style={{ gap: 0, paddingVertical: 4 }}>
        {stock.isLoading ? (
          <Spinner label="Lecture du stock…" />
        ) : stock.isError && !stock.data ? (
          <AppText size="caption" color="danger" style={styles.pad}>
            {errorText(stock.error, 'Stock indisponible.')}
          </AppText>
        ) : rows.length === 0 ? (
          <AppText size="caption" color="muted" style={styles.pad}>
            Aucun intrant du programme reçu pour l’instant.
          </AppText>
        ) : (
          rows.map((r, i) => {
            const unit = r.unitLabel ?? r.unitCode;
            const used = r.consumed + r.lost + r.sold + r.used;
            return (
              <View key={r.key} style={[styles.row, i > 0 && styles.sep]}>
                <View style={styles.head}>
                  <AppText size="body" weight="semibold" color="text" style={{ flex: 1 }} numberOfLines={1}>
                    {r.intrantLabel ?? r.intrantCode}
                  </AppText>
                  <AppText size="body" weight="bold" color={r.negative ? 'danger' : 'text'}>
                    {fmtQty(r.stock, unit)}
                  </AppText>
                </View>
                <AppText size="small" color="muted">
                  Reçu {fmtQty(r.received)} · sorti {fmtQty(used)}
                  {r.physicalStock != null ? ` · compté ${fmtQty(r.physicalStock)}` : ''}
                </AppText>
                {r.negative ? <Chip label="Stock négatif : sorties à vérifier" tone="red" dot /> : null}
              </View>
            );
          })
        )}
      </Card>
    </View>
  );
}

const styles = StyleSheet.create({
  pad: { padding: 12 },
  row: { padding: 12, gap: 4 },
  sep: { borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: semantic.border },
  head: { flexDirection: 'row', alignItems: 'center', gap: 8 },
});
