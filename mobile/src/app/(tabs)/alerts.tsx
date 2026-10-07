import React, { useEffect, useMemo, useState } from 'react';
import { Pressable, StyleSheet, TextInput, View } from 'react-native';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { useRouter } from 'expo-router';
import { CalendarDays, Check } from 'lucide-react-native';

import { Screen, ScreenHeader } from '@/components/ui/Screen';
import { AppText } from '@/components/ui/AppText';
import { Chip } from '@/components/ui/Chip';
import { Spinner } from '@/components/ui/Spinner';
import { EmptyState } from '@/components/ui/EmptyState';
import { Sheet } from '@/components/ui/Sheet';
import { Button } from '@/components/ui/Button';
import { AlertCard } from '@/components/AlertCard';
import { useQuickCapture } from '@/components/capture/QuickCaptureProvider';
import { useAuth } from '@/auth/AuthContext';
import { fetchAdvisory, fetchAlertHistory } from '@/api';
import { acknowledgeAlert, completeProphylaxis } from '@/api/mutations';
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
import { color, gradeColor, palette, radii } from '@/constants/theme';

function todayIso(): string {
  return new Date().toISOString().slice(0, 10);
}

/** Date strictement valide AAAA-MM-JJ (et pas une date impossible comme 2026-02-31). */
function isValidDate(iso: string): boolean {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(iso)) return false;
  const [y, m, d] = iso.split('-').map(Number);
  const dt = new Date(Date.UTC(y, m - 1, d));
  return y >= 2000 && dt.getUTCFullYear() === y && dt.getUTCMonth() === m - 1 && dt.getUTCDate() === d;
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
  const [careDate, setCareDate] = useState<string>(todayIso);
  const [careNotes, setCareNotes] = useState<string>('');
  const [careBusy, setCareBusy] = useState(false);
  const [careError, setCareError] = useState<string | null>(null);

  const advisory = useQuery({ queryKey: ['advisory', farmId], queryFn: () => fetchAdvisory(farmId) });
  const history = useQuery({
    queryKey: ['alerts-history', farmId],
    queryFn: () => fetchAlertHistory(farmId),
    enabled: status === 'RESOLUE',
  });

  useEffect(() => {
    if (!careTarget) return;
    setCareDate(todayIso());
    setCareNotes('');
    setCareError(null);
  }, [careTarget]);

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

  const confirmCare = () => {
    const target = careTarget;
    if (!target || !target.batchId || !isValidDate(careDate) || careBusy) return;
    setCareBusy(true);
    setCareError(null);
    setOverrides((o) => ({ ...o, [target.id]: 'ACQUITTEE' }));
    completeProphylaxis(farmId, target.batchId, target.id.replace(/^care:/, ''), {
      completedAt: `${careDate}T12:00:00.000Z`,
      notes: careNotes.trim() ? careNotes.trim() : undefined,
    })
      .then(() => {
        setCareTarget(null);
        void advisory.refetch();
        invalidateFarmQueries(queryClient, { farmId, batchId: target.batchId! });
      })
      .catch(() => {
        setOverrides((o) => {
          const next = { ...o };
          delete next[target.id];
          return next;
        });
        setCareError('Soin non enregistré. Vérifiez la connexion puis réessayez.');
      })
      .finally(() => setCareBusy(false));
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
        if (alert.id.startsWith('ready:')) {
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
      header={<ScreenHeader title="Alertes" subtitle="Vigilance immédiate, triée par impact" />}>

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

      {loading ? (
        <Spinner label="Analyse en cours…" />
      ) : status === 'RESOLUE' && history.isError ? (
        <AppText size="small" color="danger">
          Historique indisponible pour le moment. Vérifiez la connexion au serveur.
        </AppText>
      ) : advisory.isError ? (
        <AppText size="small" color="danger">
          Analyse indisponible pour le moment. Vérifiez la connexion au serveur.
        </AppText>
      ) : base.length === 0 ? (
        <EmptyState
          emoji="✅"
          title="Tout est vert !"
          description="Aucune alerte active. Votre ferme fonctionne bien."
        />
      ) : filtered.length === 0 ? (
        <EmptyState
          emoji="🔍"
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
                <AlertCard key={a.id} alert={a} busy={busyId === a.id} onPrimary={handlePrimary} onOpenLot={openLot} />
              ))}
            </>
          )}

          {infos.length > 0 && (
            <>
              <AppText size="label" color="muted" style={styles.section}>
                INFORMATIONS
              </AppText>
              {infos.map((a) => (
                <AlertCard key={a.id} alert={a} busy={busyId === a.id} onPrimary={handlePrimary} onOpenLot={openLot} showWhy={false} />
              ))}
            </>
          )}
        </View>
      )}

      <Sheet
        visible={!!careTarget}
        onClose={() => {
          if (!careBusy) setCareTarget(null);
        }}
        title="Enregistrer le soin"
        subtitle={careTarget?.batchName ?? careTarget?.message}
        footer={
          <Button
            label="Enregistrer le soin"
            tone="success"
            icon={Check}
            loading={careBusy}
            disabled={!isValidDate(careDate)}
            onPress={confirmCare}
          />
        }>
        <View style={styles.form}>
          <AppText size="bodyM" weight="semibold" color="ink">
            Date réelle du soin
          </AppText>
          <View style={styles.field}>
            <CalendarDays size={16} color={color.ink[400]} />
            <TextInput
              value={careDate}
              onChangeText={setCareDate}
              style={styles.input}
              placeholder="AAAA-MM-JJ"
              placeholderTextColor={color.ink[300]}
              autoCapitalize="none"
              autoCorrect={false}
              maxLength={10}
            />
          </View>
          {careDate && !isValidDate(careDate) ? (
            <AppText size="small" color="danger">
              Date invalide — format AAAA-MM-JJ.
            </AppText>
          ) : null}

          <AppText size="bodyM" weight="semibold" color="ink">
            Notes (facultatif)
          </AppText>
          <TextInput
            value={careNotes}
            onChangeText={setCareNotes}
            style={styles.notes}
            placeholder="Vaccin réalisé, réaction constatée…"
            placeholderTextColor={color.ink[300]}
            multiline
            textAlignVertical="top"
          />
          {careError ? (
            <AppText size="small" color="danger">
              {careError}
            </AppText>
          ) : null}
        </View>
      </Sheet>
    </Screen>
  );
}

const styles = StyleSheet.create({
  summary: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    marginBottom: 14,
    backgroundColor: palette.surface,
    borderRadius: radii.lg,
    borderWidth: 1,
    borderColor: palette.border,
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
    backgroundColor: palette.red[50],
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
    backgroundColor: palette.surface,
    paddingHorizontal: 12,
    marginBottom: 4,
  },
  input: {
    flex: 1,
    fontSize: 16,
    color: color.ink[900],
    paddingVertical: 10,
  },
  notes: {
    minHeight: 84,
    borderWidth: 1.5,
    borderColor: color.border,
    borderRadius: radii.md,
    backgroundColor: palette.surface,
    paddingHorizontal: 12,
    paddingVertical: 10,
    fontSize: 16,
    color: color.ink[900],
    marginBottom: 4,
  },
});