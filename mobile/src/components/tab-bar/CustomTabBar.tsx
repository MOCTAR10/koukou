import React, { useEffect, useRef, useState } from 'react';
import { Pressable, StyleSheet, View } from 'react-native';
import Svg, { Circle, Path } from 'react-native-svg';
import Animated, {
  interpolate,
  useAnimatedStyle,
  useSharedValue,
  withSpring,
  withTiming,
} from 'react-native-reanimated';
import { initialWindowMetrics, useSafeAreaInsets } from 'react-native-safe-area-context';
import * as Haptics from 'expo-haptics';
import { Bird, House, LayoutGrid, Plus, Wheat } from 'lucide-react-native';

import { AppText } from '../ui/AppText';
import { useAuth } from '@/auth/AuthContext';
import { useOfflineQueue } from '@/offline';
import { useCreateCenter } from '../create/CreateCenter';
import { color, palette, shadow } from '@/constants/theme';

type TabRoute = { key: string; name: string };

interface CustomTabBarProps {
  state: { index: number; routes: TabRoute[] };
  navigation: {
    emit: (options: any) => any;
    navigate: (...args: any[]) => void;
  };
}

const TABS: Record<string, { label: string; icon: typeof House }> = {
  index: { label: 'Accueil', icon: House },
  lots: { label: 'Lots', icon: Bird },
  provende: { label: 'Provende', icon: Wheat },
  menu: { label: 'Menu', icon: LayoutGrid },
};

const FAB_SPRING = { damping: 15, stiffness: 400, mass: 0.8 };
const INDICATOR_SPRING = { damping: 22, stiffness: 260, mass: 0.7 };

const BAR_H = 60;
const BAR_R = 28;
const PILL_HD_PAD = 14;
const FAB_SIZE = 56;
const FAB_R = FAB_SIZE / 2;
const NOTCH_R = 29;
const IND_W = 52;

const RING_SIZE = 70;
const RING_DIFF = (RING_SIZE - FAB_SIZE) / 2;
const RING_R = RING_SIZE / 2 - 2.5;
const RING_W = 4;
const WHITE_R = FAB_R + 1.5;
const WHITE_W = 2;
const RIM_COLORS = [palette.brand[600], palette.green[600], palette.accent[500]];

// Trois arcs de 120° (haut → bas-droite → bas-gauche → haut) formant un anneau continu.
const RIM_PATHS = (() => {
  const cx = RING_SIZE / 2;
  const cy = RING_SIZE / 2;
  const r = RING_R;
  const k = Math.sqrt(3) / 2;
  const top = `${cx},${cy - r}`;
  const br = `${cx + k * r},${cy + r / 2}`;
  const bl = `${cx - k * r},${cy + r / 2}`;
  const a = `A ${r},${r} 0 0 1`;
  return [
    `M ${top} ${a} ${br}`,
    `M ${br} ${a} ${bl}`,
    `M ${bl} ${a} ${top}`,
  ];
})();

const SLOT_MAP = [0, 1, 3, 4];

const PILL_FILL = 'rgba(255,255,255,0.92)';
const PILL_STROKE = 'rgba(127,181,198,0.4)';
const INDICATOR_FILL = 'rgba(32,96,128,0.12)';

function pillShapePath(W: number, R: number, H: number, cx: number, nr: number): string {
  const r = Math.min(R, H / 2, W / 2);
  return [
    `M ${r},0`,
    `H ${W - r}`,
    `A ${r},${r} 0 0 1 ${W},${r}`,
    `V ${H - r}`,
    `A ${r},${r} 0 0 1 ${W - r},${H}`,
    `H ${r}`,
    `A ${r},${r} 0 0 1 0,${H - r}`,
    `V ${r}`,
    `A ${r},${r} 0 0 1 ${r},0`,
    `Z`,
    `M ${cx - nr},0`,
    `A ${nr},${nr} 0 1 1 ${cx + nr},0`,
    `A ${nr},${nr} 0 1 1 ${cx - nr},0`,
    `Z`,
  ].join(' ');
}

export function CustomTabBar({ state, navigation }: CustomTabBarProps) {
  const insets = useSafeAreaInsets();
  const { farmId } = useAuth();
  const { openCreateMenu } = useCreateCenter();
  const offline = useOfflineQueue(farmId);
  const pendingOffline = offline.pending.length;

  const [barW, setBarW] = useState(0);
  const pillW = Math.max(0, barW - PILL_HD_PAD * 2);
  const tabW = pillW / 5;
  const indLeft = tabW > 0 ? (tabW - IND_W) / 2 : 0;

  const indicatorX = useSharedValue(0);
  const indicatorOpacity = useSharedValue(0);
  const hapticRef = useRef(false);

  useEffect(() => {
    if (hapticRef.current) {
      Haptics.selectionAsync().catch(() => {});
    }
    hapticRef.current = true;
  }, [state.index]);

  useEffect(() => {
    if (tabW <= 0) return;
    const slot = SLOT_MAP[state.index] ?? 4;
    indicatorX.value = withSpring(slot * tabW, INDICATOR_SPRING);
    indicatorOpacity.value = withTiming(1, { duration: 200 });
  }, [state.index, tabW, indicatorX, indicatorOpacity]);

  const indicatorStyle = useAnimatedStyle(() => ({
    left: indLeft,
    transform: [{ translateX: indicatorX.value }],
    opacity: indicatorOpacity.value,
  }));

  const pillD =
    pillW > 0
      ? pillShapePath(pillW, BAR_R, BAR_H, pillW / 2, NOTCH_R)
      : `M 0 0 H 0 V ${BAR_H} H 0 Z`;

  return (
    // Edge-to-edge (SDK 54) : sur Android la barre système (3 boutons) dessine
    // par-dessus le contenu — la barre d'onglets doit flotter au-dessus.
    // Fallback sur initialWindowMetrics si l'inset live est fiable à 0.
    <View
      style={[
        styles.wrap,
        {
          paddingBottom: Math.max(
            insets.bottom,
            initialWindowMetrics?.insets.bottom ?? 0,
            8,
          ),
        },
      ]}>
      <View style={styles.barOuter} onLayout={(e) => setBarW(e.nativeEvent.layout.width)}>
        <View style={styles.barSection}>
          <View
            style={[styles.pill, { borderRadius: BAR_R, height: BAR_H }]}
            pointerEvents="none">
            <Svg width={pillW} height={BAR_H} style={styles.pillSvg}>
              <Path
                d={pillD}
                fill={PILL_FILL}
                fillRule="evenodd"
                stroke={PILL_STROKE}
                strokeWidth={1.2}
              />
            </Svg>
          </View>

          <Animated.View
            pointerEvents="none"
            style={[styles.indicator, { width: IND_W, borderRadius: IND_W / 2 }, indicatorStyle]}
          />

          <View style={styles.bar}>
            <NavTab route={state.routes[0]} index={0} stateIndex={state.index} navigation={navigation} badge={false} badgeCount={0} />
            <NavTab route={state.routes[1]} index={1} stateIndex={state.index} navigation={navigation} badge={false} badgeCount={0} />

            <AnimatedFAB onPress={openCreateMenu} />

            <NavTab route={state.routes[2]} index={2} stateIndex={state.index} navigation={navigation} badge={false} badgeCount={0} />
            <NavTab
              route={state.routes[3]}
              index={3}
              stateIndex={state.index}
              navigation={navigation}
              badge={pendingOffline > 0}
              badgeCount={pendingOffline}
              badgeTone="amber"
            />
          </View>
        </View>
      </View>
    </View>
  );
}

function NavTab({
  route,
  index,
  stateIndex,
  navigation,
  badge,
  badgeCount,
  badgeTone = 'red',
}: {
  route: TabRoute;
  index: number;
  stateIndex: number;
  navigation: CustomTabBarProps['navigation'];
  badge?: boolean;
  badgeCount: number;
  badgeTone?: 'red' | 'amber';
}) {
  const focused = stateIndex === index;
  const active = useSharedValue(focused ? 1 : 0);

  useEffect(() => {
    active.value = withSpring(focused ? 1 : 0, INDICATOR_SPRING);
  }, [active, focused]);

  const iconStyle = useAnimatedStyle(() => ({
    transform: [{ scale: interpolate(active.value, [0, 1], [1, 1.18]) }],
  }));

  const labelStyle = useAnimatedStyle(() => ({
    transform: [{ scale: interpolate(active.value, [0, 1], [0.92, 1]) }],
    opacity: interpolate(active.value, [0, 1], [0.55, 1]),
  }));

  if (!route) return <View style={styles.tab} />;
  const meta = TABS[route.name];
  if (!meta) return null;

  const Icon = meta.icon;
  const iconColor = focused ? palette.brand[600] : palette.ink[300];
  const badgeBg = badgeTone === 'amber' ? palette.amber[500] : palette.red[500];

  return (
    <Pressable
      onPress={() => {
        const event = navigation.emit({ type: 'tabPress', target: route.key, canPreventDefault: true });
        if (!focused && !event.defaultPrevented) navigation.navigate(route.name);
      }}
      style={styles.tab}
      accessibilityRole="button">
      <View>
        <Animated.View style={iconStyle}>
          <Icon size={23} color={iconColor} strokeWidth={focused ? 2.4 : 2} />
        </Animated.View>
        {badge ? (
          <View style={[styles.badge, { backgroundColor: badgeBg }]}>
            <AppText size="small" color={color.surface} weight="bold" style={{ fontSize: 10, lineHeight: 14 }}>
              {badgeCount}
            </AppText>
          </View>
        ) : null}
      </View>
      <Animated.View style={labelStyle}>
        <AppText size="small" weight={focused ? 'semibold' : 'medium'} color={focused ? 'brand' : 'faint'}>
          {meta.label}
        </AppText>
      </Animated.View>
    </Pressable>
  );
}

function AnimatedFAB({ onPress }: { onPress: () => void }) {
  const scale = useSharedValue(1);
  const rotation = useSharedValue(0);
  const ringOpacity = useSharedValue(0);
  const ringScale = useSharedValue(0.6);

  const ringStyle = useAnimatedStyle(() => ({
    opacity: ringOpacity.value,
    transform: [{ scale: ringScale.value }],
  }));

  const outerStyle = useAnimatedStyle(() => ({
    transform: [{ scale: scale.value }],
  }));

  const fabStyle = useAnimatedStyle(() => ({
    transform: [{ rotate: `${rotation.value}deg` }],
  }));

  const handlePressIn = () => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium).catch(() => {});
    scale.value = withSpring(0.85, FAB_SPRING);
    rotation.value = withTiming(45, { duration: 200 });
    ringOpacity.value = withTiming(1, { duration: 200 });
    ringScale.value = withTiming(1.6, { duration: 400 });
  };

  const handlePressOut = () => {
    scale.value = withSpring(1, FAB_SPRING);
    rotation.value = withTiming(0, { duration: 250 });
    ringOpacity.value = withTiming(0, { duration: 300 });
    ringScale.value = withTiming(0.6, { duration: 300 });
  };

  return (
    <Pressable
      onPress={onPress}
      onPressIn={handlePressIn}
      onPressOut={handlePressOut}
      style={styles.fabSlot}
      accessibilityRole="button"
      accessibilityLabel="Ajouter">
      <View style={styles.fabContainer}>
        <Animated.View style={[styles.fabRing, ringStyle]} />
        <Animated.View style={[styles.fabOuter, outerStyle]}>
          <Svg width={RING_SIZE} height={RING_SIZE} style={styles.fabRimSvg}>
            <Circle
              cx={RING_SIZE / 2}
              cy={RING_SIZE / 2}
              r={WHITE_R}
              fill="none"
              stroke={palette.surface}
              strokeWidth={WHITE_W}
            />
            {RIM_COLORS.map((c, i) => (
              <Path
                key={i}
                d={RIM_PATHS[i]}
                fill="none"
                stroke={c}
                strokeWidth={RING_W}
                strokeLinecap="round"
              />
            ))}
          </Svg>
          <Animated.View style={[styles.fab, fabStyle]}>
            <Plus size={28} color={color.surface} strokeWidth={2.6} />
          </Animated.View>
        </Animated.View>
      </View>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  wrap: {
    alignItems: 'center',
  },
  barOuter: {
    width: '100%',
    paddingHorizontal: PILL_HD_PAD,
  },
  barSection: {
    position: 'relative',
  },
  pill: {
    position: 'absolute',
    left: 0,
    right: 0,
    top: 0,
    ...shadow.tabBar,
  },
  pillSvg: {
    position: 'absolute',
    left: 0,
    top: 0,
  },
  indicator: {
    position: 'absolute',
    top: 6,
    bottom: 6,
    backgroundColor: INDICATOR_FILL,
  },
  bar: {
    flexDirection: 'row',
    alignItems: 'stretch',
    height: BAR_H,
  },
  tab: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    gap: 2,
  },
  fabSlot: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'flex-start',
  },
  fabContainer: {
    width: FAB_SIZE,
    height: FAB_SIZE,
    alignItems: 'center',
    justifyContent: 'center',
    marginTop: -FAB_R,
  },
  fabOuter: {
    position: 'absolute',
    top: -RING_DIFF,
    left: -RING_DIFF,
    width: RING_SIZE,
    height: RING_SIZE,
    alignItems: 'center',
    justifyContent: 'center',
  },
  fabRimSvg: {
    ...StyleSheet.absoluteFillObject,
  },
  fabRing: {
    ...StyleSheet.absoluteFillObject,
    borderRadius: FAB_R,
    backgroundColor: color.brand[600],
    opacity: 0,
  },
  fab: {
    width: FAB_SIZE,
    height: FAB_SIZE,
    borderRadius: FAB_R,
    backgroundColor: color.brand[600],
    alignItems: 'center',
    justifyContent: 'center',
    ...shadow.fab,
  },
  badge: {
    position: 'absolute',
    top: -5,
    right: -9,
    minWidth: 17,
    height: 17,
    borderRadius: 9,
    paddingHorizontal: 4,
    alignItems: 'center',
    justifyContent: 'center',
  },
});
