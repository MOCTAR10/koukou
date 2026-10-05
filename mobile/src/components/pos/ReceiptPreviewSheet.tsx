import React, { useState } from 'react';
import { Alert, Pressable, StyleSheet, View } from 'react-native';
import { Download, ReceiptText, ShieldCheck } from 'lucide-react-native';

import { AppText } from '@/components/ui/AppText';
import { Button } from '@/components/ui/Button';
import { Sheet } from '@/components/ui/Sheet';
import { downloadPdf } from '@/api/pdf';
import type { SaleSummary } from '@/api/types';
import { customerTypeLabel } from '@/constants/customers';
import { color, fmt, fmtFcfa, palette, radii, spacing } from '@/constants/theme';

interface ReceiptPreviewSheetProps {
  visible: boolean;
  sale?: SaleSummary | null;
  farmName?: string;
  pdvName?: string;
  onClose: () => void;
}

function Row({ label, value, bold }: { label: string; value: string; bold?: boolean }) {
  return (
    <View style={styles.row}>
      <AppText size="small" color="muted" style={{ flex: 1 }}>
        {label}
      </AppText>
      <AppText size="small" weight={bold ? 'bold' : 'semibold'} color={bold ? 'accent' : 'text'}>
        {value}
      </AppText>
    </View>
  );
}

export function ReceiptPreviewSheet({ visible, sale, farmName, pdvName, onClose }: ReceiptPreviewSheetProps) {
  const [downloading, setDownloading] = useState(false);

  const download = async () => {
    if (!sale || downloading) return;
    setDownloading(true);
    try {
      const res = await downloadPdf(`/farms/${sale.farmId}/sales/${sale.id}/receipt`, `${sale.referenceNumber}.pdf`);
      if (res.platform === 'android' && !res.savedToDownloads) {
        Alert.alert(
          'Téléchargement annulé',
          'Accès au dossier de fichiers refusé. Le PDF n’a pas été enregistré. Réessayez et autorisez le dossier Téléchargements.',
        );
      } else if (res.platform === 'android') {
        Alert.alert('Reçu enregistré', `« ${sale.referenceNumber}.pdf » enregistré dans Téléchargements.`);
      } else if (res.platform === 'ios') {
        Alert.alert('Reçu partagé', 'Choisissez « Enregistrer dans Fichiers » pour le conserver sur l’appareil.');
      } else {
        Alert.alert('Reçu téléchargé', `« ${sale.referenceNumber}.pdf » téléchargé.`);
      }
    } catch (e) {
      Alert.alert('Téléchargement impossible', e instanceof Error ? e.message : 'Erreur inattendue.');
    } finally {
      setDownloading(false);
    }
  };

  const fmtTime = (d: string) => (isNaN(Date.parse(d)) ? d : new Date(d).toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit' }));

  return (
    <Sheet
      visible={visible}
      onClose={onClose}
      title="Aperçu du reçu"
      subtitle={sale?.referenceNumber}
      icon={<ReceiptText size={22} color={color.brand[600]} />}
      footer={
        sale ? (
          <Button
            label="Télécharger le PDF"
            tone="accent"
            icon={Download}
            loading={downloading}
            disabled={downloading}
            onPress={() => void download()}
          />
        ) : undefined
      }>
      {sale ? (
        <View style={styles.ticket}>
          <View style={styles.ticketHead}>
            <View style={{ flex: 1, gap: 2 }}>
              <AppText size="body" weight="bold" color="text" numberOfLines={1}>
                {farmName ?? 'KouKou Ferme'}
              </AppText>
              <AppText size="label" color="muted">
                REÇU DE VENTE · VENTE CONFIRMÉE
              </AppText>
            </View>
            <View style={styles.badge}>
              <ShieldCheck size={14} color={palette.green[600]} />
            </View>
          </View>

          <View style={styles.dash} />

          <Row label="Référence" value={sale.referenceNumber} bold />
          <Row label="Date" value={`${sale.saleDate} · ${fmtTime(sale.createdAt)}`} />
          <Row label="Client" value={sale.customer?.fullName ?? 'Client marchand'} />
          {sale.customer ? (
            <Row
              label="Fiche"
              value={[sale.customer.code, customerTypeLabel(sale.customer.type)].filter(Boolean).join(' · ')}
            />
          ) : null}
          {pdvName ? <Row label="Point de vente" value={pdvName} /> : null}

          <View style={styles.dash} />

          {sale.items.map((it, i) => (
            <View key={it.id ?? `${it.label}-${i}`} style={styles.itemRow}>
              <View style={{ flex: 1, gap: 1 }}>
                <AppText size="small" weight="semibold" color="text" numberOfLines={1}>
                  {it.label || it.productType}
                </AppText>
                <AppText size="caption" color="muted">
                  {fmt(it.quantity)} {it.unit} × {fmt(it.unitPriceFcfa)} FCFA
                </AppText>
              </View>
              <AppText size="small" weight="semibold" color="text">
                {fmt(it.amountFcfa)} FCFA
              </AppText>
            </View>
          ))}

          <View style={styles.dash} />

          {sale.discountAmountFcfa > 0 ? (
            <Row label="Remise" value={`− ${fmtFcfa(sale.discountAmountFcfa)}`} />
          ) : null}
          <Row label="Total" value={fmtFcfa(sale.totalAmountFcfa)} bold />
          <Row label="Règlement" value="Espèces · caisse du point de vente" />

          <View style={styles.dash} />

          <AppText size="caption" color="faint">
            Pièce justificative générée par KouKou. Conservez ce document pour vos dossiers. En cas de litige, présentez la référence ci-dessus + le numéro du reçu PDF.
          </AppText>
        </View>
      ) : (
        <View style={styles.emptyWrap}>
          <AppText size="body" color="muted" style={{ textAlign: 'center' }}>
            Reçu introuvable. Réessayez depuis l’onglet « Reçus ».
          </AppText>
          <Pressable onPress={onClose} hitSlop={8} accessibilityRole="button">
            <AppText size="small" weight="bold" color="brand" style={{ textAlign: 'center', marginTop: 8 }}>
              Fermer
            </AppText>
          </Pressable>
        </View>
      )}
    </Sheet>
  );
}

const styles = StyleSheet.create({
  ticket: {
    backgroundColor: palette.surface,
    borderWidth: 1,
    borderColor: palette.border,
    borderRadius: radii.lg,
    padding: spacing.md,
    gap: spacing.xs,
  },
  ticketHead: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
  },
  badge: {
    width: 28,
    height: 28,
    borderRadius: 14,
    backgroundColor: palette.green[50],
    alignItems: 'center',
    justifyContent: 'center',
  },
  dash: {
    height: 1,
    backgroundColor: palette.border,
    marginVertical: spacing.xs,
  },
  row: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    gap: 8,
  },
  itemRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    paddingVertical: 2,
  },
  emptyWrap: {
    alignItems: 'center',
    paddingVertical: spacing.lg,
  },
});