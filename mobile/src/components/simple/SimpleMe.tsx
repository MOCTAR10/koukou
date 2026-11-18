// « Moi » tab of a SIMPLE account: who I am, whether the phone is connected,
// what still waits to be sent, the voice setting, switch to the full app (when
// the account may), sign out.
import React, { useState } from 'react';
import { Pressable, StyleSheet, Switch, View } from 'react-native';
import { LogOut, RefreshCw, Volume2 } from 'lucide-react-native';

import { Screen } from '@/components/ui/Screen';
import { AppText } from '@/components/ui/AppText';
import { ConnectionPill } from '@/components/ui/ConnectionStrip';
import { confirm, errorMessage, toast } from '@/components/ui/Feedback';
import { useAuth } from '@/auth/AuthContext';
import { useFarmProfile } from '@/hooks/useFarmProfile';
import { useUiMode } from '@/hooks/useUiMode';
import { farmRoleLabel } from '@/api/roles';
import { useOfflineQueue } from '@/offline';
import { layout, palette, radii, semantic } from '@/constants/theme';
import { isVoiceEnabled, setVoiceEnabled } from '@/voice/speak';
import { useAnnounce } from '@/voice/useAnnounce';
import { TOUCH } from './SimpleParts';
import { SpeakButton } from './SpeakButton';

const SENTENCE = 'Voici votre compte. Vous pouvez couper la voix ici.';

export function SimpleMe() {
  const { user, farms, farmId, signOut } = useAuth();
  const { farmRole } = useFarmProfile();
  const { canChangeOwn, setOwnMode } = useUiMode();
  const offline = useOfflineQueue(farmId);
  const [voice, setVoice] = useState(isVoiceEnabled());
  const [switching, setSwitching] = useState(false);
  const farm = farms.find((f) => f.id === farmId) ?? farms[0];
  const pending = offline.pending.length + offline.rejected.length;
  useAnnounce(SENTENCE);

  const toggleVoice = (next: boolean) => {
    setVoice(next);
    setVoiceEnabled(next);
  };

  const goComplete = async () => {
    const ok = await confirm({
      title: 'Passer en mode complet ?',
      message: 'Vous verrez toute l’application, avec les chiffres et les graphiques.',
      confirmLabel: 'Oui, passer',
      cancelLabel: 'Non',
    });
    if (!ok) return;
    setSwitching(true);
    try {
      await setOwnMode('COMPLET');
    } catch (e) {
      toast.error('Changement impossible', errorMessage(e, 'Il faut une connexion pour changer de mode.'));
    } finally {
      setSwitching(false);
    }
  };

  return (
    <Screen
      bottomPad={layout.bottomPad}
      header={
        <View style={styles.header}>
          <AppText size="h2" weight="bold" style={styles.headerText}>
            Moi
          </AppText>
          <ConnectionPill />
          <SpeakButton text={SENTENCE} />
        </View>
      }>
      <View style={styles.content}>
        <View style={styles.identity}>
          <AppText size="h2" weight="bold" numberOfLines={2}>
            {user.fullName}
          </AppText>
          <AppText size="h3" weight="semibold" color="muted" numberOfLines={2}>
            {farm?.name ?? ''} · {farmRoleLabel(farmRole)}
          </AppText>
        </View>

        {pending > 0 ? (
          <Pressable
            onPress={() => void offline.flush()}
            disabled={offline.syncing}
            accessibilityRole="button"
            accessibilityLabel={`${pending} saisies à envoyer, envoyer maintenant`}
            style={[styles.row, styles.pendingRow]}>
            <RefreshCw size={34} color={palette.amber[800]} strokeWidth={2.4} />
            <AppText size="h3" weight="bold" style={styles.rowText}>
              {offline.syncing ? 'Envoi…' : `${pending} à envoyer`}
            </AppText>
          </Pressable>
        ) : null}

        <View style={styles.row}>
          <Volume2 size={34} color={palette.brand[600]} strokeWidth={2.4} />
          <AppText size="h3" weight="bold" style={styles.rowText}>
            Lire les consignes à voix haute
          </AppText>
          <Switch
            value={voice}
            onValueChange={toggleVoice}
            trackColor={{ true: palette.green[600], false: palette.ink[200] }}
            accessibilityLabel="Lire les consignes à voix haute"
            style={styles.switch}
          />
        </View>

        {canChangeOwn ? (
          <Pressable
            onPress={() => void goComplete()}
            disabled={switching}
            accessibilityRole="button"
            accessibilityLabel="Passer en mode complet"
            style={[styles.bigBtn, { backgroundColor: palette.brand[600] }, switching && styles.disabled]}>
            <AppText size="h3" weight="bold" color={semantic.surface}>
              Passer en mode complet
            </AppText>
          </Pressable>
        ) : null}

        <Pressable
          onPress={() => void signOut()}
          accessibilityRole="button"
          accessibilityLabel="Me déconnecter"
          style={[styles.bigBtn, styles.logout]}>
          <LogOut size={30} color={palette.red[600]} strokeWidth={2.4} />
          <AppText size="h3" weight="bold" color={palette.red[600]}>
            Me déconnecter
          </AppText>
        </Pressable>
      </View>
    </Screen>
  );
}

const styles = StyleSheet.create({
  header: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  headerText: { flex: 1 },
  content: { gap: 14, marginTop: 8 },
  identity: { gap: 4, paddingVertical: 8 },
  row: {
    minHeight: 80,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    padding: 14,
    borderRadius: radii.xl,
    backgroundColor: semantic.surface,
    borderWidth: 1,
    borderColor: semantic.borderStrong,
  },
  pendingRow: { backgroundColor: semantic.warnSoft, borderColor: palette.amber[300] },
  rowText: { flex: 1 },
  switch: { transform: [{ scale: 1.3 }] },
  bigBtn: {
    minHeight: TOUCH + 8,
    borderRadius: radii.xl,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 10,
    paddingHorizontal: 16,
  },
  logout: { backgroundColor: semantic.surface, borderWidth: 2, borderColor: palette.red[500] },
  disabled: { opacity: 0.5 },
});
