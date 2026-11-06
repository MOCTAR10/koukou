import React from 'react';
import { Tabs } from 'expo-router';

import { CustomTabBar } from '@/components/tab-bar/CustomTabBar';

export default function TabsLayout() {
  return (
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
    </Tabs>
  );
}