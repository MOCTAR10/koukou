import React from 'react';
import { View } from 'react-native';
import { Tabs } from 'expo-router';

import { CustomTabBar } from '@/components/tab-bar/CustomTabBar';
import { semantic } from '@/constants/theme';

export default function TabsLayout() {
  return (
    <View style={{ flex: 1, backgroundColor: semantic.bg }}>
    <Tabs
      screenOptions={{ headerShown: false }}
      initialRouteName="index"
      tabBar={(props) => <CustomTabBar {...props} />}>
      <Tabs.Screen name="index" />
      <Tabs.Screen name="lots" />
      <Tabs.Screen name="provende" />
      <Tabs.Screen name="menu" />
      <Tabs.Screen name="activites" options={{ href: null }} />
      <Tabs.Screen name="marche" options={{ href: null }} />
      <Tabs.Screen name="alerts" options={{ href: null }} />
    </Tabs>
    </View>
  );
}