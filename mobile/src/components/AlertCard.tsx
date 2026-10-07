import React, { useState } from 'react';
import { Pressable, StyleSheet, View } from 'react-native';
import {
  ArrowRight,
  Check,
  CheckCircle2,
  ChevronDown,
  ClipboardList,
  Eye,
  HandCoins,
  Info,
  PackageOpen,
  Zap,
} from 'lucide-react-native';
import * as Haptics from 'expo-haptics';

import { AppText } from './ui/AppText';
import { Button } from './ui/Button';
import { Card } from './ui/Card';
import { Chip, levelTone, type ChipTone } from './ui/Chip';
import { kindLabel } from '@/api/alerts.filters';
import { color, palette, radii } from '@/constants/theme';
import type { Alert } from '@/api/types';

interface AlertCardProps {
  alert: Alert;
  /** Une action réseau est en cours pour cette alerte (évite les doubles presses). */
  busy?: boolean;
  /** Action principale selon la catégorie (acquitter, faire un soin, saisir, commander, encaisser…). */
  onPrimary?: (alert: Alert) => void;
  onOpenLot?: (batchId: string) => void;
  showWhy?: boolean;
}

function statusChipTone(status: Alert['status']): ChipTone {
  if (status === 'ACQUITTEE') return 'green';
  if (status === 'RESOLUE') return 'outline';
  return 'neutral';
}

function statusLabel(status: Alert['status']): string {
  if (status === 'ACQUITTEE') return 'Acquittée';
  if (status === 'RESOLUE') return 'Résolue';
  return 'En cours';
}

export function AlertCard({ alert, busy = false, onPrimary, onOpenLot, showWhy = true }: AlertCardProps) {
  const [open, setOpen] = useState(false);
  const isCare = alert.category === 'SOIN';
  const readyItem = alert.category === 'VENTE' && alert.id.startsWith('ready:');
  const done = alert.status === 'ACQUITTEE' || alert.status === 'RESOLUE';
  const cardTone = alert.status === 'RESOLUE' ? 'default' : alert.level === 'ROUGE' ? 'alert' : alert.level === 'JAUNE' ? 'warn' : 'green';

  let primaryLabel = "J'ai vu";
  let primaryTone: React.ComponentProps<typeof Button>['tone'] = 'brand';
  let PrimaryIcon = Eye;
  if (isCare) {
    primaryLabel = 'Fait';
    primaryTone = 'success';
    PrimaryIcon = Check;
  } else if (alert.category === 'SAISIE') {
    primaryLabel = 'Saisir';
    primaryTone = 'brand';
    PrimaryIcon = ClipboardList;
  } else if (alert.category === 'STOCK_PROVENDE') {
    primaryLabel = 'Commander';
    primaryTone = 'accent';
    PrimaryIcon = PackageOpen;
  } else if (alert.category === 'VENTE') {
    if (readyItem) {
      primaryLabel = 'Voir le lot';
      primaryTone = 'ghost';
      PrimaryIcon = ArrowRight;
    } else {
      primaryLabel = 'Encaisser';
      primaryTone = 'success';
      PrimaryIcon = HandCoins;
    }
  } else if (alert.level === 'ROUGE') {
    primaryTone = 'danger';
  }

  const primary = () => {
    if (!onPrimary) return;
    Haptics.selectionAsync().catch(() => {});
    onPrimary(alert);
  };

  const showStatusChip = alert.status !== 'ACTIVE';

  return (
    <Card tone={cardTone} padding={false} style={styles.card}>
      <View style={styles.inner}>
        <View style={styles.top}>
          <View style={styles.chips}>
            <Chip label={kindLabel(alert.kind)} tone={levelTone(alert.level)} dot />
            {showStatusChip ? <Chip label={statusLabel(alert.status)} tone={statusChipTone(alert.status)} /> : null}
          </View>
          {alert.batchName ? (
            <AppText size="small" weight="medium" color="muted" numberOfLines={1} style={styles.batchName}>
              {alert.batchName}
            </AppText>
          ) : null}
        </View>

        <AppText size="body" weight="semibold" style={styles.message}>
          {alert.message}
        </AppText>

        {alert.recommendation ? (
          <View style={styles.reco}>
            <Zap size={14} color={color.accent[600]} />
            <AppText size="bodyM" color="ink" style={{ flex: 1 }}>
              {alert.recommendation}
            </AppText>
          </View>
        ) : null}

        {done ? (
          <View style={styles.doneRow}>
            <CheckCircle2 size={16} color={palette.green[600]} strokeWidth={2.4} />
            <AppText size="bodyM" weight="semibold" color="success">
              {alert.status === 'RESOLUE'
                ? alert.resolvedAt
                  ? `Résolue ${alert.resolvedAt.slice(0, 10)}`
                  : 'Résolue'
                : 'Acquittée'}
            </AppText>
            {alert.batchId && onOpenLot ? (
              <Button label="Voir le lot" tone="ghost" size="sm" block={false} onPress={() => onOpenLot(alert.batchId!)} />
            ) : null}
          </View>
        ) : (
          <View style={styles.actionsRow}>
            <Button label={primaryLabel} tone={primaryTone} size="md" block={false} icon={PrimaryIcon} loading={busy} onPress={primary} />
            {alert.batchId && onOpenLot && !readyItem ? (
              <Button label="Voir le lot" tone="ghost" size="md" block={false} onPress={() => onOpenLot(alert.batchId!)} />
            ) : null}
          </View>
        )}

        {showWhy && alert.why.length > 0 && (
          <Pressable onPress={() => setOpen((o) => !o)} style={styles.whyToggle} accessibilityRole="button">
            <Info size={13} color={palette.ink[400]} />
            <AppText size="small" weight="semibold" color="muted">
              Pourquoi KouKou dit ça ?
            </AppText>
            <View style={open && styles.rotated}>
              <ChevronDown size={15} color={palette.ink[400]} />
            </View>
          </Pressable>
        )}

        {open &&
          alert.why.map((line, i) => (
            <View key={i} style={styles.whyLine}>
              <View style={styles.whyBullet} />
              <AppText size="caption" color="muted" style={{ flex: 1 }}>
                {line}
              </AppText>
            </View>
          ))}
      </View>
    </Card>
  );
}

const styles = StyleSheet.create({
  card: {
    borderLeftWidth: 4,
  },
  inner: {
    padding: 14,
    gap: 8,
  },
  top: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    gap: 8,
  },
  chips: {
    flexDirection: 'row',
    gap: 6,
    flexShrink: 1,
  },
  batchName: {
    flexShrink: 1,
  },
  message: {
    color: color.ink[900],
  },
  reco: {
    flexDirection: 'row',
    gap: 7,
    backgroundColor: color.accent[50],
    borderRadius: radii.sm,
    padding: 9,
  },
  actionsRow: {
    flexDirection: 'row',
    gap: 10,
    marginTop: 4,
    flexWrap: 'wrap',
  },
  doneRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 7,
    marginTop: 2,
  },
  whyToggle: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
    marginTop: 2,
    alignSelf: 'flex-start',
  },
  rotated: {
    transform: [{ rotate: '180deg' }],
  },
  whyLine: {
    flexDirection: 'row',
    gap: 7,
  },
  whyBullet: {
    width: 5,
    height: 5,
    borderRadius: 3,
    backgroundColor: color.ink[300],
    marginTop: 6,
  },
});