import React, { useEffect, useState } from 'react';
import { View } from 'react-native';

import { AppText } from '@/components/ui/AppText';
import { Button } from '@/components/ui/Button';
import { Sheet } from '@/components/ui/Sheet';
import { TextField } from '@/components/ui/TextField';
import { OUTSIDE_REASON_MIN } from '@/offline';

/**
 * A GPS point outside the declared province is saved only when confirmed with
 * a reason (server rule, 409 GPS_HORS_PROVINCE). Asks for that reason.
 */
export function OutsideProvinceSheet({
  visible,
  message,
  busy,
  onCancel,
  onConfirm,
}: {
  visible: boolean;
  message: string;
  busy?: boolean;
  onCancel: () => void;
  onConfirm: (reason: string) => void;
}) {
  const [reason, setReason] = useState('');
  useEffect(() => {
    if (visible) setReason('');
  }, [visible]);
  const valid = reason.trim().length >= OUTSIDE_REASON_MIN;
  return (
    <Sheet visible={visible} title="Point hors de la province" onClose={onCancel}>
      <View style={{ gap: 12, paddingBottom: 8 }}>
        <AppText size="small" color="warn">
          {message}
        </AppText>
        <AppText size="small" color="muted">
          Pour enregistrer quand même ce point, indiquez le motif (au moins {OUTSIDE_REASON_MIN} caractères). Il restera dans l’historique.
        </AppText>
        <TextField value={reason} onChangeText={setReason} placeholder="Motif (ex. ferme à la limite de la province)" maxLength={500} />
        <View style={{ flexDirection: 'row', gap: 8, justifyContent: 'flex-end' }}>
          <Button label="Annuler" tone="ghost" size="sm" block={false} onPress={onCancel} disabled={busy} />
          <Button label="Confirmer et enregistrer" size="sm" block={false} onPress={() => onConfirm(reason.trim())} disabled={!valid} loading={busy} />
        </View>
      </View>
    </Sheet>
  );
}
