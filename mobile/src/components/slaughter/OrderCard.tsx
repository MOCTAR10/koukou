import React, { Fragment } from 'react';
import { StyleSheet, View } from 'react-native';
import { CalendarX, Check, FileText, Send } from 'lucide-react-native';

import { AppText } from '@/components/ui/AppText';
import { Button } from '@/components/ui/Button';
import { Card } from '@/components/ui/Card';
import { Chip } from '@/components/ui/Chip';
import { NumberInput } from '@/components/ui/NumberInput';
import { color, palette } from '@/constants/theme';
import type { SlaughterDestination, SlaughterOrder, SlaughterStatus, SlaughterType } from '@/api/types';

const TYPE_LABEL: Record<SlaughterType, string> = {
  ABATTU: 'Abattu',
  VIVANT: 'Vivant (transporté)',
};

const DEST_LABEL: Record<SlaughterDestination, string> = {
  INTERNE: 'Abattoir ferme',
  EXTERNE: 'Abattoir externe',
};

export const STATUS_LABEL: Record<SlaughterStatus, string> = {
  DRAFT: 'Brouillon',
  SENT: 'Envoyé',
  PROCESSED: 'Traité',
  CANCELLED: 'Annulé',
};

export function toneFor(status: SlaughterStatus): 'green' | 'brand' | 'red' | 'neutral' {
  if (status === 'PROCESSED') return 'green';
  if (status === 'SENT') return 'brand';
  if (status === 'CANCELLED') return 'red';
  return 'neutral';
}

const STEPS: readonly (readonly [SlaughterStatus, string])[] = [
  ['DRAFT', 'Brouillon'],
  ['SENT', 'Envoyé'],
  ['PROCESSED', 'Traité'],
];

function stepIndex(status: SlaughterStatus): number {
  if (status === 'PROCESSED') return 2;
  if (status === 'SENT') return 1;
  if (status === 'DRAFT') return 0;
  return -1;
}

function LifecycleStepper({ status }: { status: SlaughterStatus }) {
  const idx = stepIndex(status);
  return (
    <View style={styles.stepper}>
      {STEPS.map(([key, label], i) => (
        <Fragment key={key}>
          {i > 0 ? <View style={[styles.stepLine, i <= idx ? styles.stepLineDone : null]} /> : null}
          <View style={styles.stepNode}>
            <View style={[styles.stepDot, i <= idx ? styles.stepDotDone : null, i === idx ? styles.stepDotCurrent : null]}>
              {i <= idx ? <Check size={10} color={color.surface} strokeWidth={3.2} /> : null}
            </View>
            <AppText size="small" weight={i === idx ? 'semibold' : 'regular'} color={i <= idx ? (i === idx ? 'text' : 'success') : 'faint'}>
              {label}
            </AppText>
          </View>
        </Fragment>
      ))}
    </View>
  );
}

export function MiniStatColumn({ label, value, tone }: { label: string; value: string; tone: string }) {
  return (
    <View style={styles.miniCol}>
      <AppText size="small" color="muted" align="center" numberOfLines={1}>
        {label}
      </AppText>
      <AppText size="body" weight="bold" color={tone} numberOfLines={1} adjustsFontSizeToFit minimumFontScale={0.6}>
        {value}
      </AppText>
    </View>
  );
}

function formatKg(n: number | null | undefined): string {
  return n != null ? `${Math.round(n)} kg` : '—';
}

export interface OrderCardProps {
  order: SlaughterOrder;
  canManage: boolean;
  /** Un traitement est en cours sur l'écran : tous les boutons sont désactivés. */
  busy: boolean;
  /** L'ordre courant est celui en cours de traitement (spinner + disable). */
  loading: boolean;
  /** Saisie du poids carcasse enregistré localement pour cet ordre (SENT). */
  processWeight: string;
  onProcessWeightChange: (value: string) => void;
  onSend: () => void;
  onProcess: () => void;
  onCancel: () => void;
  onBordereau: () => void;
}

export function OrderCard({
  order,
  canManage,
  busy,
  loading,
  processWeight,
  onProcessWeightChange,
  onSend,
  onProcess,
  onCancel,
  onBordereau,
}: OrderCardProps) {
  const cancelled = order.status === 'CANCELLED';
  const editable = order.status === 'DRAFT' || order.status === 'SENT';
  const hasWeights =
    order.totalWeightKg != null || order.carcassWeightKg != null || order.rendementPercent != null;

  return (
    <Card tone={order.status === 'PROCESSED' ? 'green' : cancelled ? 'plain' : order.status === 'SENT' ? 'brand' : 'default'} style={styles.card}>
      <View style={styles.head}>
        <View style={styles.headBody}>
          <AppText size="body" weight="bold" color="text">
            {order.referenceNumber}
          </AppText>
          <AppText size="caption" color="muted">
            {order.batch?.batchName ?? order.batchId} · {TYPE_LABEL[order.slaughterType] ?? order.slaughterType} ·{' '}
            {DEST_LABEL[order.destination] ?? order.destination}
          </AppText>
          <AppText size="caption" color="muted">
            {order.plannedDate?.slice(0, 10)} · {order.birdCount} oiseaux
          </AppText>
        </View>
        <Chip label={STATUS_LABEL[order.status] ?? order.status} tone={toneFor(order.status)} dot />
      </View>

      {!cancelled ? <LifecycleStepper status={order.status} /> : null}

      {hasWeights ? (
        <View style={styles.miniRow}>
          <View style={styles.miniDivider} />
          <View style={styles.miniDivider} />
          <MiniStatColumn label="Poids vif" value={formatKg(order.totalWeightKg)} tone={color.ink[800]} />
          <MiniStatColumn label="Carcasse" value={formatKg(order.carcassWeightKg)} tone={color.green[600]} />
          <MiniStatColumn
            label="Rendement"
            value={order.rendementPercent != null ? `${order.rendementPercent.toFixed(1)} %` : '—'}
            tone={order.rendementPercent != null ? color.brand[600] : color.ink[400]}
          />
        </View>
      ) : null}

      {order.internalBatchCode ? (
        <AppText size="caption" color="muted">
          Code de suivi : {order.internalBatchCode}
        </AppText>
      ) : null}
      {order.abattoirLotCode ? (
        <AppText size="caption" color="muted">
          Code abattoir : {order.abattoirLotCode}
        </AppText>
      ) : null}
      {order.abattoirNotes ? (
        <AppText size="caption" color="faint" style={styles.notes}>
          {order.abattoirNotes}
        </AppText>
      ) : null}
      {order.processedAt ? (
        <AppText size="caption" color="success">
          Traité le {order.processedAt.slice(0, 10)}
        </AppText>
      ) : null}

      {canManage && editable ? (
        <>
          <View style={styles.actions}>
            {order.status === 'DRAFT' ? (
              <Button label="Envoyer" tone="brand" size="md" block={false} icon={Send} onPress={onSend} disabled={busy} loading={loading} />
            ) : (
              <Button label="Traiter" tone="success" size="md" block={false} icon={Check} onPress={onProcess} disabled={busy} loading={loading} />
            )}
            {order.destination === 'EXTERNE' && !cancelled ? (
              <Button label="Bordereau PDF" tone="ghost" size="md" block={false} icon={FileText} onPress={onBordereau} disabled={busy} loading={loading} />
            ) : null}
            <Button label="Annuler" tone="ghost" size="md" block={false} icon={CalendarX} onPress={onCancel} disabled={busy} />
          </View>

          {order.status === 'SENT' ? (
            <NumberInput
              value={processWeight}
              onChangeText={onProcessWeightChange}
              decimal
              suffix="kg"
              placeholder="Poids carcasse total (optionnel)"
              editable={!busy}
              style={styles.weightInput}
            />
          ) : null}
        </>
      ) : (
        order.destination === 'EXTERNE' &&
        !cancelled && (
          <View style={styles.actions}>
            <Button label="Bordereau PDF" tone="ghost" size="md" block={false} icon={FileText} onPress={onBordereau} disabled={busy} loading={loading} />
          </View>
        )
      )}
    </Card>
  );
}

const styles = StyleSheet.create({
  card: {
    gap: 10,
    padding: 14,
  },
  head: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 8,
  },
  headBody: {
    flex: 1,
    gap: 2,
  },
  stepper: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 0,
    marginTop: 2,
  },
  stepLine: {
    flex: 1,
    height: 2,
    backgroundColor: color.border,
    marginHorizontal: 4,
  },
  stepLineDone: {
    backgroundColor: palette.green[300],
  },
  stepNode: {
    alignItems: 'center',
    gap: 3,
    minWidth: 56,
  },
  stepDot: {
    width: 20,
    height: 20,
    borderRadius: 10,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: color.surfaceAlt,
    borderWidth: 1.5,
    borderColor: color.border,
  },
  stepDotDone: {
    backgroundColor: palette.green[600],
    borderColor: palette.green[600],
  },
  stepDotCurrent: {
    borderColor: palette.brand[600],
    borderWidth: 2,
    backgroundColor: palette.brand[500],
  },
  miniRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginTop: 2,
  },
  miniCol: {
    flex: 1,
    minWidth: 0,
    alignItems: 'center',
    gap: 1,
  },
  miniDivider: {
    flex: 1,
  },
  notes: {
    fontStyle: 'italic',
  },
  actions: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
  },
  weightInput: {
    marginTop: 2,
  },
});