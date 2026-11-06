import React, { useState } from 'react';
import { StyleSheet, View } from 'react-native';
import { useQueryClient } from '@tanstack/react-query';
import { AlertTriangle, LocateFixed, MapPin, RotateCcw, Send } from 'lucide-react-native';

import { AppText } from '@/components/ui/AppText';
import { Button } from '@/components/ui/Button';
import { Card } from '@/components/ui/Card';
import { confirm, errorMessage, toast } from '@/components/ui/Feedback';
import { useAuth } from '@/auth/AuthContext';
import { useProgrammeAccess } from '@/hooks/useProgrammeAccess';
import { useFarmProfile } from '@/hooks/useFarmProfile';
import type { Farm } from '@/api/types';
import { setFarmGpsQueued } from '@/offline';
import { getCurrentPosition } from '@/location/current-position';
import { canSetFarmGps } from '@/poufa/access';
import { accuracyGrade, accuracyLabel, buildGpsPayload, formatCoords, positionRefusal, type DevicePosition } from '@/poufa/gps';
import { color, palette, semantic } from '@/constants/theme';

type Step = { kind: 'idle' } | { kind: 'locating' } | { kind: 'fix'; position: DevicePosition } | { kind: 'sending'; position: DevicePosition };

/**
 * GPS point of the farm (CDC 2): « Relever ma position » on the spot, the fix
 * and its accuracy shown, then sent after a confirmation. Queued offline (the
 * fix keeps its own capture time). Offered to the accounts the server lets
 * write the registry point.
 */
export function FarmGpsCard({ farm }: { farm: Farm }) {
  const qc = useQueryClient();
  const { user, refreshFarms } = useAuth();
  const access = useProgrammeAccess();
  const { hasPermission } = useFarmProfile();
  // POUFA lot A droits: the owner and the éleveur (registre:gps) record their own point.
  const allowed = canSetFarmGps(user.role, access.matrix, hasPermission('registre:gps'));
  const [step, setStep] = useState<Step>({ kind: 'idle' });
  const [failure, setFailure] = useState<string | null>(null);
  const [warning, setWarning] = useState<string | null>(null);
  const hasPoint = farm.latitude != null && farm.longitude != null;

  const locate = async () => {
    setFailure(null);
    setWarning(null);
    setStep({ kind: 'locating' });
    try {
      const position = await getCurrentPosition();
      setStep({ kind: 'fix', position });
    } catch (e) {
      setFailure(errorMessage(e));
      setStep({ kind: 'idle' });
    }
  };

  const send = async (position: DevicePosition) => {
    const refusal = positionRefusal(position);
    if (refusal) {
      setFailure(refusal);
      return;
    }
    const ok = await confirm({
      title: 'Enregistrer cette position ?',
      message: `${formatCoords(position)} · ${accuracyLabel(position.accuracyM)}. Elle remplace le point GPS de la ferme ${farm.name}${hasPoint ? ' (l’ancien point reste dans l’historique)' : ''}.`,
      confirmLabel: 'Enregistrer',
    });
    if (!ok) return;
    setStep({ kind: 'sending', position });
    try {
      const result = await setFarmGpsQueued(farm.id, buildGpsPayload(position));
      if (result.status === 'queued') {
        toast.info('Position gardée sur le téléphone', 'Elle partira dès que la connexion revient, datée du relevé.');
      } else {
        toast.success('Position de la ferme enregistrée');
        setWarning(result.data.provinceWarning);
        void refreshFarms();
        void qc.invalidateQueries({ queryKey: ['farm-profile', farm.id] });
      }
      setStep({ kind: 'idle' });
    } catch (e) {
      toast.error('Position refusée', errorMessage(e));
      setStep({ kind: 'fix', position });
    }
  };

  const fix = step.kind === 'fix' || step.kind === 'sending' ? step.position : null;
  const weak = fix ? accuracyGrade(fix.accuracyM) === 'faible' : false;

  return (
    <Card style={{ gap: 10 }}>
      <View style={styles.head}>
        <MapPin size={18} color={color.brand[700]} />
        <View style={{ flex: 1 }}>
          <AppText size="body" weight="semibold" color="text">
            Point GPS de la ferme
          </AppText>
          <AppText size="small" color="muted">
            {hasPoint ? formatCoords({ latitude: farm.latitude as number, longitude: farm.longitude as number }) : 'Pas encore relevé'}
          </AppText>
        </View>
      </View>

      {!allowed ? (
        <AppText size="small" color="muted">
          Le relevé GPS est fait par un agent habilité du programme, sur place.
        </AppText>
      ) : (
        <>
          {fix ? (
            <View style={[styles.fix, weak && styles.fixWeak]}>
              <AppText size="bodyM" weight="bold" color="text">
                {formatCoords(fix)}
              </AppText>
              <AppText size="small" color={weak ? 'warn' : 'muted'}>
                {accuracyLabel(fix.accuracyM)}
                {weak ? ' : placez-vous à découvert et refaites le relevé si possible.' : ''}
              </AppText>
              <View style={styles.actions}>
                <Button label="Refaire" icon={RotateCcw} tone="ghost" size="sm" block={false} onPress={() => void locate()} disabled={step.kind === 'sending'} />
                <Button label="Envoyer cette position" icon={Send} size="sm" block={false} onPress={() => void send(fix)} loading={step.kind === 'sending'} />
              </View>
            </View>
          ) : (
            <Button label="Relever ma position" icon={LocateFixed} tone="brand" onPress={() => void locate()} loading={step.kind === 'locating'} />
          )}
          {step.kind === 'locating' ? (
            <AppText size="small" color="muted">
              Recherche de la position… Restez immobile, à découvert.
            </AppText>
          ) : null}
          {failure ? (
            <AppText size="small" color="danger">
              {failure}
            </AppText>
          ) : null}
          {warning ? (
            <View style={styles.warn}>
              <AlertTriangle size={14} color={palette.amber[700]} />
              <AppText size="small" color="warn" style={{ flex: 1 }}>
                {warning}
              </AppText>
            </View>
          ) : null}
          <AppText size="small" color="faint">
            Hors connexion, la position est gardée sur le téléphone et envoyée plus tard.
          </AppText>
        </>
      )}
    </Card>
  );
}

const styles = StyleSheet.create({
  head: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  fix: { gap: 6, padding: 12, borderRadius: 12, backgroundColor: semantic.primarySoft },
  fixWeak: { backgroundColor: semantic.warnSoft },
  actions: { flexDirection: 'row', gap: 8, justifyContent: 'flex-end', flexWrap: 'wrap' },
  warn: { flexDirection: 'row', gap: 6, alignItems: 'flex-start' },
});
