import React, { useState } from 'react';
import { StyleSheet, View } from 'react-native';
import { router, type Href } from 'expo-router';
import { LogOut, RefreshCw, Store, Tractor } from 'lucide-react-native';

import { noFarmMessage, roleLabel } from '@/api/roles';
import { useAuth } from '@/auth/AuthContext';
import { AppText } from '@/components/ui/AppText';
import { Button } from '@/components/ui/Button';
import { Screen, ScreenHeader } from '@/components/ui/Screen';
import { radii, semantic } from '@/constants/theme';

/** Signed in, not a buyer, but no farm to work on: say why instead of empty farm screens. */
export default function NoFarmScreen() {
  const { user, refreshFarms, signOut } = useAuth();
  const [refreshing, setRefreshing] = useState(false);
  const message = noFarmMessage(user.role);

  const refresh = async () => {
    setRefreshing(true);
    try {
      // A farm linked meanwhile flips the navigator guard to the farm screens.
      await refreshFarms();
    } finally {
      setRefreshing(false);
    }
  };

  return (
    <Screen header={<ScreenHeader title="Fermia" subtitle={`${user.fullName} · ${roleLabel(user.role)}`} />}>
      <View style={styles.card}>
        <View style={styles.iconDisc}>
          <Tractor size={28} color={semantic.primary} strokeWidth={1.8} />
        </View>
        <AppText size="h3" weight="bold" color="text" align="center">
          {message.title}
        </AppText>
        <AppText size="bodyM" color="muted" align="center">
          {message.body}
        </AppText>
      </View>
      <View style={styles.actions}>
        <Button label="Actualiser" icon={RefreshCw} tone="primary" loading={refreshing} onPress={() => void refresh()} />
        <Button label="Voir le marché" icon={Store} tone="ghost" onPress={() => router.push('/annonces' as Href)} />
        <Button label="Se déconnecter" icon={LogOut} tone="ghost" onPress={() => void signOut()} />
      </View>
    </Screen>
  );
}

const styles = StyleSheet.create({
  card: {
    marginTop: 16,
    alignItems: 'center',
    gap: 12,
    padding: 24,
    backgroundColor: semantic.surface,
    borderRadius: radii.xl,
    borderWidth: 1,
    borderColor: semantic.border,
  },
  iconDisc: {
    width: 64,
    height: 64,
    borderRadius: 32,
    backgroundColor: semantic.primarySoft,
    alignItems: 'center',
    justifyContent: 'center',
  },
  actions: {
    marginTop: 16,
    gap: 10,
  },
});
