import React from 'react';
import { View } from 'react-native';
import { Tabs } from 'expo-router';
import { ClipboardList, Store, UserRound } from 'lucide-react-native';

import { ConnectionStrip } from '@/components/ui/ConnectionStrip';
import { color, fontFamily, semantic } from '@/constants/theme';

/** A buyer's whole app: no farm, so none of the farm tabs. */
export default function BuyerTabsLayout() {
  return (
    <View style={{ flex: 1, backgroundColor: semantic.bg }}>
    <ConnectionStrip />
    <Tabs
      initialRouteName="accueil"
      screenOptions={{
        headerShown: false,
        tabBarActiveTintColor: color.brand[600],
        tabBarInactiveTintColor: color.ink[400],
        tabBarLabelStyle: { fontFamily: fontFamily.medium },
        sceneStyle: { backgroundColor: semantic.bg },
      }}>
      <Tabs.Screen name="accueil" options={{ title: 'Annonces', tabBarIcon: ({ color: tint, size }) => <Store size={size} color={tint} /> }} />
      <Tabs.Screen name="achats" options={{ title: 'Mes commandes', tabBarIcon: ({ color: tint, size }) => <ClipboardList size={size} color={tint} /> }} />
      <Tabs.Screen name="compte" options={{ title: 'Mon compte', tabBarIcon: ({ color: tint, size }) => <UserRound size={size} color={tint} /> }} />
    </Tabs>
    </View>
  );
}
