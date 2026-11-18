// Tab bar of a SIMPLE account: two big tabs, « Accueil » and « Moi ». No
// Lots / Provende tabs and no « + » menu: data entry lives on the home tiles.
import React from 'react';
import { Pressable, StyleSheet, View } from 'react-native';
import { House, UserRound } from 'lucide-react-native';

import { AppText } from '@/components/ui/AppText';
import { useAuth } from '@/auth/AuthContext';
import { useOfflineQueue } from '@/offline';
import { palette, semantic } from '@/constants/theme';
import { useSafeInsets } from './SimpleParts';

type TabRoute = { key: string; name: string };

interface Props {
  state: { index: number; routes: TabRoute[] };
  navigation: {
    emit: (options: any) => any;
    navigate: (...args: any[]) => void;
  };
}

const TABS = [
  { name: 'index', label: 'Accueil', icon: House },
  { name: 'menu', label: 'Moi', icon: UserRound },
] as const;

export function SimpleTabBar({ state, navigation }: Props) {
  const insets = useSafeInsets();
  const { farmId } = useAuth();
  const offline = useOfflineQueue(farmId);
  const pending = offline.pending.length + offline.rejected.length;
  const current = state.routes[state.index]?.name;
  // Hidden routes (notifications…) read as Home.
  const focusedName = current === 'menu' ? 'menu' : 'index';

  return (
    <View style={[styles.bar, { paddingBottom: insets.bottom }]}>
      {TABS.map((tab) => {
        const route = state.routes.find((r) => r.name === tab.name);
        if (!route) return null;
        const focused = focusedName === tab.name;
        const Icon = tab.icon;
        const tint = focused ? semantic.primary : palette.ink[500];
        return (
          <Pressable
            key={tab.name}
            onPress={() => {
              const event = navigation.emit({ type: 'tabPress', target: route.key, canPreventDefault: true });
              if (!focused && !event.defaultPrevented) navigation.navigate(route.name);
            }}
            accessibilityRole="tab"
            accessibilityState={{ selected: focused }}
            accessibilityLabel={tab.label}
            style={[styles.tab, focused && styles.tabOn]}>
            <View>
              <Icon size={34} color={tint} strokeWidth={focused ? 2.6 : 2.2} />
              {tab.name === 'menu' && pending > 0 ? (
                <View style={styles.badge}>
                  <AppText size="small" weight="bold" color={semantic.surface}>
                    {pending}
                  </AppText>
                </View>
              ) : null}
            </View>
            <AppText size="h3" weight={focused ? 'bold' : 'semibold'} color={tint}>
              {tab.label}
            </AppText>
          </Pressable>
        );
      })}
    </View>
  );
}

const styles = StyleSheet.create({
  bar: {
    flexDirection: 'row',
    backgroundColor: semantic.surface,
    borderTopWidth: 1,
    borderTopColor: semantic.border,
    paddingTop: 6,
    paddingHorizontal: 8,
    gap: 8,
  },
  tab: {
    flex: 1,
    minHeight: 72,
    borderRadius: 20,
    alignItems: 'center',
    justifyContent: 'center',
    gap: 2,
  },
  tabOn: { backgroundColor: semantic.primarySoft },
  badge: {
    position: 'absolute',
    top: -6,
    right: -12,
    minWidth: 22,
    height: 22,
    borderRadius: 11,
    paddingHorizontal: 5,
    backgroundColor: palette.accent[500],
    alignItems: 'center',
    justifyContent: 'center',
  },
});
