import React, { useMemo, useState } from 'react';
import { Pressable, StyleSheet, View } from 'react-native';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { useRouter } from 'expo-router';
import { CircleCheck, SearchX } from 'lucide-react-native';

import { Screen, ScreenHeader } from '@/components/ui/Screen';
import { AppText } from '@/components/ui/AppText';
import { Chip } from '@/components/ui/Chip';
import { Spinner } from '@/components/ui/Spinner';
import { StaleNotice } from '@/components/ui/StaleNotice';
import { EmptyState } from '@/components/ui/EmptyState';
import { AlertCard } from '@/components/AlertCard';
import { useQuickCapture } from '@/components/capture/QuickCaptureProvider';
import { useAuth } from '@/auth/AuthContext';
import { fetchAdvisory, fetchAlertHistory } from '@/api';
import { acknowledgeAlert } from '@/api/mutations';
// POUFA lot A2 sante: « Fait » through the shared completion sheet and the offline queue (CDC n° 22-23).
import { CompleteCareSheet, type CompletableCare } from '@/components/sanitary/SanitaryRecordSheets';
import { invalidateFarmQueries } from '@/api/invalidate';
import {
  filterAlerts,
  kindsWithCounts,
  countLevel,
  LEVEL_LABEL,
  STATUS_LABEL,
  type LevelFilter,
  type StatusFilter,
} from '@/api/alerts.filters';
import type { Alert } from '@/api/types';
import { useFarmProfile } from '@/hooks/useFarmProfile';
import { color, gradeColor, palette, radii, fontFamily, semantic } from '@/constants/theme';

/** The care behind a SOIN action (the server sends `care`; the fallback keeps the id). */
function careOfAlert(alert: Alert): CompletableCare {
  const info = alert.care;
  return {
    id: info?.eventId ?? alert.id.replace(/^care:/, ''),
    batchId: alert.batchId ?? '',
    name: info?.name ?? alert.message,
    careType: info?.careType ?? 'VACCIN',
    route: info?.route ?? null,
    withdrawalDays: info?.withdrawalDays ?? 0,
    protocolStepId: info?.protocolStepId ?? null,
    productCode: info?.productCode ?? null,
    isReference: info?.isReference,
    originalDate: info?.originalDate ?? null,
  };
}

export default function AlertsScreen() {
  const router = useRouter();
  const queryClient = useQueryClient();
  const { farmId } = useAuth();
  const { openDaily, openSale, openFeed } = useQuickCapture();

  const [level, setLevel] = useState<LevelFilter>('TOUTES');
  const [status, setStatus] = useState<StatusFilter>('TOUTES');
  const [kind, setKind] = useState<string | null>(null);

  /** Statuts optimistes (acquitté/soin) en attente du refetch serveur. */
  const [overrides, setOverrides] = useState<Record<string, Alert['status']>>({});
  const [busyId, setBusyId] = useState<string | null>(null);
  const [actionError, setActionError] = useState<string | null>(null);

  const [careTarget, setCareTarget] = useState<Alert | null>(null);

  const advisory = useQuery({ queryKey: ['advisory', farmId], queryFn: () => fetchAdvisory(farmId) });
  const history = useQuery({
    queryKey: ['alerts-history', farmId],
    queryFn: () => fetchAlertHistory(farmId),
    enabled: status === 'RESOLUE',
  });

  const base = useMemo(() => {
    const raw = status === 'RESOLUE' ? (history.data ?? []) : (advisory.data?.alerts ?? []);
    return raw.map((a) => (overrides[a.id] ? { ...a, status: overrides[a.id] } : a));
  }, [advisory.data, history.data, status, overrides]);

  const kinds = useMemo(() => kindsWithCounts(base), [base]);
  const filtered = useMemo(() => filterAlerts(base, { level, status, kind }), [base, level, status, kind]);
  const priority = useMemo(() => filtered.filter((a) => a.level === 'ROUGE' || a.level === 'JAUNE'), [filtered]);
  const infos = useMemo(() => filtered.filter((a) => a.level === 'VERT'), [filtered]);

  const loading = status === 'RESOLUE' ? history.isLoading : advisory.isLoading;
  const refreshing = status === 'RESOLUE' ? history.isFetching : advisory.isFetching;

  const refresh = () => {
    void advisory.refetch();
    if (status === 'RESOLUE') void history.refetch();
  };

  const openLot = (batchId: string) => router.push(`/lot/${batchId}`);
  // A sale opens the POS (Fermia-only sales desk): an institution sees the lot instead.
  const farmProfile = useFarmProfile();
  const canSell = farmProfile.hasPermission('vente:creer');
  // POUFA lot A indic: a disease advice opens the sanitary declaration to the vets.
  const canDeclare = farmProfile.hasPermission('sanitaire:signaler') || farmProfile.hasPermission('sanitaire:gerer');
  const declare = canDeclare ? (batchId: string) => router.push(`/sanitary?lot=${batchId}&declare=1`) : undefined;

  const runAcknowledge = (alert: Alert) => {
    if (!alert.alertId || busyId) return;
    setBusyId(alert.id);
    setActionError(null);
    setOverrides((o) => ({ ...o, [alert.id]: 'ACQUITTEE' }));
    acknowledgeAlert(farmId, alert.alertId)
      .then(() => {
        void advisory.refetch();
        invalidateFarmQueries(queryClient, { farmId });
      })
      .catch(() => {
        setOverrides((o) => {
          const next = { ...o };
          delete next[alert.id];
          return next;
        });
        setActionError("Impossible d'acquitter pour le moment. Vérifiez la connexion puis réessayez.");
      })
      .finally(() => setBusyId(null));
  };

  const handlePrimary = (alert: Alert) => {
    if (busyId) return;
    switch (alert.category) {
      case 'ALERTE':
        runAcknowledge(alert);
        return;
      case 'SOIN':
        setCareTarget(alert);
        return;
      case 'SAISIE':
        if (alert.batchId) openDaily(alert.batchId);
        else setActionError('Lot introuvable pour cette saisie.');
        return;
      case 'STOCK_PROVENDE':
        openFeed();
        return;
      case 'VENTE':
        if (alert.id.startsWith('ready:') || !canSell) {
          if (alert.batchId) openLot(alert.batchId);
        } else if (alert.batchId) openSale(alert.batchId);
        else router.push('/pos');
        return;
    }
  };

  const resolvedCount = history.data ? history.data.filter((a) => a.status === 'RESOLUE').length : 0;
  const score = advisory.data?.pulse.score ?? 0;
  const grade = advisory.data?.pulse.grade;

  return (
    <Screen
      bottomPad={120}
      refreshing={refreshing}
      onRefresh={refresh}
      header={<ScreenHeader title="Conseils d’élevage" subtitle="Ce que Fermia a repéré sur vos lots, trié par impact" />}>

      <View style={styles.summary}>
        {status !== 'RESOLUE' && advisory.data ? (
          <View style={styles.score}>
            <AppText size="h2" weight="bold" style={{ color: gradeColor[grade ?? 'MOYEN'] }}>
              {score}
            </AppText>
            <AppText size="small" color="muted">
              sur 100
            </AppText>
          </View>
        ) : history.data ? (
          <View style={styles.score}>
            <AppText size="h2" weight="bold" color="muted">
              {history.data.length}
            </AppText>
            <AppText size="small" color="muted">
              alertes en historique
            </AppText>
          </View>
        ) : null}
        <View style={styles.summaryChips}>
          <Chip label={`Rouges · ${countLevel(base, 'ROUGE')}`} tone="red" />
          <Chip label={`Jaunes · ${countLevel(base, 'JAUNE')}`} tone="amber" />
          <Chip label={`Infos · ${countLevel(base, 'VERT')}`} tone="green" />
        </View>
      </View>

      <View style={styles.group}>
        <AppText size="label" color="muted">
          Niveau
        </AppText>
        <View style={styles.chipsRow}>
          {(Object.keys(LEVEL_LABEL) as LevelFilter[]).map((f) => (
            <Pressable key={f} onPress={() => setLevel(f)} accessibilityRole="button">
              <Chip
                label={LEVEL_LABEL[f]}
                tone={f === 'ROUGE' ? 'red' : f === 'JAUNE' ? 'amber' : f === 'VERT' ? 'green' : 'brand'}
                selected={level === f}
              />
            </Pressable>
          ))}
        </View>
      </View>

      <View style={styles.group}>
        <AppText size="label" color="muted">
          Statut
        </AppText>
        <View style={styles.chipsRow}>
          {(Object.keys(STATUS_LABEL) as StatusFilter[]).map((f) => (
            <Pressable key={f} onPress={() => setStatus(f)} accessibilityRole="button">
              <Chip
                label={f === 'RESOLUE' && history.data ? `Résolues · ${resolvedCount}` : STATUS_LABEL[f]}
                tone="neutral"
                selected={status === f}
              />
            </Pressable>
          ))}
        </View>
      </View>

      {kinds.length > 0 ? (
        <View style={styles.group}>
          <AppText size="label" color="muted">
            Type
          </AppText>
          <View style={styles.chipsRow}>
            <Pressable onPress={() => setKind(null)} accessibilityRole="button">
              <Chip label="Tous" tone="neutral" selected={!kind} />
            </Pressable>
            {kinds.map((k) => (
              <Pressable key={k.kind} onPress={() => setKind(k.kind)} accessibilityRole="button">
                <Chip label={`${k.label} · ${k.count}`} tone={kind === k.kind ? 'brand' : 'neutral'} selected={kind === k.kind} />
              </Pressable>
            ))}
          </View>
        </View>
      ) : null}

      {actionError ? (
        <View style={styles.error}>
          <AppText size="bodyM" color="danger">
            {actionError}
          </AppText>
        </View>
      ) : null}

      <StaleNotice
        show={status === 'RESOLUE' ? history.isError && Boolean(history.data) : advisory.isError && Boolean(advisory.data)}
        updatedAt={status === 'RESOLUE' ? history.dataUpdatedAt : advisory.dataUpdatedAt}
      />
      {loading ? (
        <Spinner label="Analyse en cours…" />
      ) : status === 'RESOLUE' && history.isError && !history.data ? (
        <AppText size="small" color="danger">
          Historique indisponible pour le moment. Vérifiez la connexion au serveur.
        </AppText>
      ) : advisory.isError && !advisory.data ? (
        <AppText size="small" color="danger">
          Analyse indisponible pour le moment. Vérifiez la connexion au serveur.
        </AppText>
      ) : base.length === 0 ? (
        <EmptyState
          icon={CircleCheck}
          title="Tout est vert !"
          description="Aucune alerte active. Votre ferme fonctionne bien."
        />
      ) : filtered.length === 0 ? (
        <EmptyState
          icon={SearchX}
          title="Aucun résultat"
          description="Aucune alerte ne correspond à ces filtres."
        />
      ) : (
        <View style={styles.list}>
          {priority.length > 0 && (
            <>
              <AppText size="label" color="muted" style={styles.section}>
                ACTIONS PRIORITAIRES
              </AppText>
              {priority.map((a) => (
                <AlertCard key={a.id} alert={a} busy={busyId === a.id} onPrimary={handlePrimary} onOpenLot={openLot} canSell={canSell} onDeclare={declare} />
              ))}
            </>
          )}

          {infos.length > 0 && (
            <>
              <AppText size="label" color="muted" style={styles.section}>
                INFORMATIONS
              </AppText>
              {infos.map((a) => (
                <AlertCard key={a.id} alert={a} busy={busyId === a.id} onPrimary={handlePrimary} onOpenLot={openLot} showWhy={false} canSell={canSell} />
              ))}
            </>
          )}
        </View>
      )}

      {careTarget?.batchId ? (
        <CompleteCareSheet
          visible
          farmId={farmId}
          event={careOfAlert(careTarget)}
          defaultCount={careTarget.care?.liveCount}
          onClose={() => {
            setCareTarget(null);
            void advisory.refetch();
          }}
        />
      ) : null}
    </Screen>
  );
}

const styles = StyleSheet.create({
  summary: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    marginBottom: 14,
    backgroundColor: semantic.surface,
    borderRadius: radii.lg,
    borderWidth: 1,
    borderColor: semantic.border,
    padding: 12,
  },
  score: {
    alignItems: 'center',
    gap: 0,
    minWidth: 64,
  },
  summaryChips: {
    flexDirection: 'row',
    gap: 6,
    flexWrap: 'wrap',
    flex: 1,
  },
  group: {
    marginBottom: 10,
    gap: 6,
  },
  chipsRow: {
    flexDirection: 'row',
    gap: 6,
    flexWrap: 'wrap',
  },
  error: {
    backgroundColor: semantic.dangerSoft,
    borderWidth: 1,
    borderColor: palette.red[100],
    borderRadius: radii.md,
    padding: 10,
    marginBottom: 10,
  },
  list: {
    gap: 12,
  },
  section: {
    marginTop: 4,
  },
  form: {
    gap: 8,
  },
  field: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    borderWidth: 1.5,
    borderColor: color.border,
    borderRadius: radii.md,
    backgroundColor: semantic.surface,
    paddingHorizontal: 12,
    marginBottom: 4,
  },
  input: {
    fontFamily: fontFamily.regular,
    flex: 1,
    fontSize: 16,
    color: color.ink[900],
    paddingVertical: 10,
  },
  notes: {
    fontFamily: fontFamily.regular,
    minHeight: 84,
    borderWidth: 1.5,
    borderColor: color.border,
    borderRadius: radii.md,
    backgroundColor: semantic.surface,
    paddingHorizontal: 12,
    paddingVertical: 10,
    fontSize: 16,
    color: color.ink[900],
    marginBottom: 4,
  },
});