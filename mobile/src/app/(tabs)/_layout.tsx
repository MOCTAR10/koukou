import React from 'react';
import { View } from 'react-native';
import { Tabs } from 'expo-router';

import { CustomTabBar } from '@/components/tab-bar/CustomTabBar';
import { semantic } from '@/constants/theme';
import { useUiMode } from '@/hooks/useUiMode';

export default function TabsLayout() {
  // SIMPLE accounts: Lots and Provende are not reachable (only Accueil and Moi).
  const { simple } = useUiMode();
  return (
    <View style={{ flex: 1, backgroundColor: semantic.bg }}>
    <Tabs
      screenOptions={{ headerShown: false }}
      initialRouteName="index"
      tabBar={(props) => <CustomTabBar {...props} />}>
      <Tabs.Screen name="index" />
      <Tabs.Screen name="lots" options={simple ? { href: null } : undefined} />
      <Tabs.Screen name="provende" options={simple ? { href: null } : undefined} />
      <Tabs.Screen name="menu" />
      <Tabs.Screen name="activites" options={{ href: null }} />
      <Tabs.Screen name="marche" options={{ href: null }} />
      <Tabs.Screen name="alerts" options={{ href: null }} />
    </Tabs>
    </View>
  );
}