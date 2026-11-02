import { StyleSheet, View } from 'react-native';

import { AppText } from '@/components/ui/AppText';
import { fmtFcfa, radii, semantic } from '@/constants/theme';
import { heldCashSummary, useOfflineQueue } from '@/offline';

/** Cash collected offline that waits for the caisse to be opened by someone. */
export function HeldCashNotice({ farmId }: { farmId: string }) {
  // Subscribes to the queue: the notice leaves as soon as the ops are sent.
  useOfflineQueue(farmId);
  const { count, amountFcfa } = heldCashSummary(farmId);
  if (count === 0) return null;
  return (
    <View style={styles.box} accessibilityRole="alert">
      <AppText size="small" weight="semibold" color="warn">
        {count > 1
          ? `${count} encaissements hors ligne en attente · ${fmtFcfa(amountFcfa)}`
          : `1 encaissement hors ligne en attente · ${fmtFcfa(amountFcfa)}`}
      </AppText>
      <AppText size="small" color="muted">
        La caisse a été clôturée entre-temps. Rien n’est perdu : {count > 1 ? 'ils seront enregistrés' : 'il sera enregistré'} à la prochaine ouverture de la caisse.
      </AppText>
    </View>
  );
}

const styles = StyleSheet.create({
  box: {
    marginTop: 10,
    padding: 10,
    gap: 4,
    borderRadius: radii.md,
    backgroundColor: semantic.warnSoft,
  },
});
