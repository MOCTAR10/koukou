import React from 'react';
import { StyleSheet, View } from 'react-native';
import { useQuery } from '@tanstack/react-query';
import { Landmark } from 'lucide-react-native';

import { AppText } from '@/components/ui/AppText';
import { Card } from '@/components/ui/Card';
import { Chip, levelTone } from '@/components/ui/Chip';
import { SectionHeader } from '@/components/ui/SectionHeader';
import { Spinner } from '@/components/ui/Spinner';
import { StaleNotice } from '@/components/ui/StaleNotice';
import { fetchFarmSanitaryAlerts, fetchProgramList } from '@/api/poufa';
import { cachedRead } from '@/offline/ref-cache';
import { officialAlertRows } from '@/poufa/official-alerts';
import { palette, semantic } from '@/constants/theme';
import { useClinicalSigns } from './DeclarationExtras';
import { errorText } from '@/api/errorText';

/**
 * Official sanitary alerts of the farm (L5 `SanitaryAlert`, `AS-YYYY-NNNN`):
 * read-only for the farm, qualified by the veterinary services. Kept apart
 * from the advisory alerts of the Alertes tab.
 */
export function OfficialAlertsCard({ farmId }: { farmId: string }) {
  const alerts = useQuery({
    queryKey: ['sanitary-alerts', farmId],
    queryFn: () => cachedRead(`sanitary-alerts.${farmId}`, () => fetchFarmSanitaryAlerts(farmId)),
    enabled: Boolean(farmId),
  });
  const statuses = useQuery({
    queryKey: ['programme-list', 'STATUT_ALERTE'],
    queryFn: () => cachedRead('list.STATUT_ALERTE', () => fetchProgramList('STATUT_ALERTE')),
    staleTime: 10 * 60_000,
  });
  const signs = useClinicalSigns();
  const rows = officialAlertRows(alerts.data?.items ?? [], statuses.data ?? [], signs.data ?? []);

  return (
    <View style={{ gap: 8 }}>
      <SectionHeader
        title="Alertes sanitaires officielles"
        subtitle="Suivies par les services vétérinaires du programme"
        icon={Landmark}
        iconColor={palette.red[600]}
        iconBg={semantic.dangerSoft}
      />
      <AppText size="small" color="muted">
        Distinctes des alertes de conseil de l’onglet « Alertes » : elles naissent d’une suspicion déclarée ou d’une
        mortalité au-dessus du seuil fixé par les vétérinaires.
      </AppText>
      <StaleNotice show={alerts.isError && Boolean(alerts.data)} updatedAt={alerts.dataUpdatedAt} />
      <Card style={{ gap: 0, paddingVertical: 4 }}>
        {alerts.isLoading ? (
          <Spinner label="Lecture des alertes officielles…" />
        ) : alerts.isError && !alerts.data ? (
          <AppText size="caption" color="danger" style={styles.pad}>
            {errorText(alerts.error, 'Alertes officielles indisponibles.')}
          </AppText>
        ) : rows.length === 0 ? (
          <AppText size="caption" color="muted" style={styles.pad}>
            Aucune alerte sanitaire officielle pour cette ferme.
          </AppText>
        ) : (
          rows.map((r, i) => (
            <View key={r.id} style={[styles.row, i > 0 && styles.sep]}>
              <View style={styles.head}>
                <AppText size="body" weight="bold" color="text" style={{ flex: 1 }}>
                  {r.code}
                </AppText>
                <Chip label={r.statusLabel} tone={r.closed ? 'neutral' : levelTone(r.severity)} dot />
              </View>
              <AppText size="caption" color="muted">
                {r.originLabel} · {r.period}
                {r.batchCode ? ` · bande ${r.batchCode}` : ''}
              </AppText>
              <AppText size="caption" color="text">
                {r.summary}
              </AppText>
              {r.signs ? (
                <AppText size="small" color="muted">
                  Signes : {r.signs}
                </AppText>
              ) : null}
              <AppText size="small" color={r.published ? 'danger' : 'faint'}>
                {r.published ? 'Publiée par les services vétérinaires' : 'Non publiée : visible par la ferme et les vétérinaires seulement'}
              </AppText>
            </View>
          ))
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
