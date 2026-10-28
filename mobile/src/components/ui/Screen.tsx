import React from 'react';
import { Pressable, RefreshControl, ScrollView, StyleSheet, View, type StyleProp, type ViewStyle } from 'react-native';
import { SafeAreaView, useSafeAreaInsets } from 'react-native-safe-area-context';
import { useRouter } from 'expo-router';
import { ChevronLeft } from 'lucide-react-native';

import { AppText } from './AppText';
import { color, layout, semantic } from '@/constants/theme';

interface ScreenProps {
  children: React.ReactNode;
  bottomPad?: number;
  scroll?: boolean;
  style?: StyleProp<ViewStyle>;
  header?: React.ReactNode;
  refreshing?: boolean;
  onRefresh?: () => void;
}

export function Screen({ children, bottomPad = 96, scroll = true, style, header, refreshing, onRefresh }: ScreenProps) {
  const insets = useSafeAreaInsets();
  // Edge-to-edge (SDK 54) : le contenu défile derrière la barre système Android
  // (3 boutons). Pour une mise en page FIXE (scroll=false), le padding `bottomPad`
  // doit englober l'insert système, sinon le contenu passe sous la barre.
  const contentPad = scroll ? bottomPad : bottomPad + insets.bottom;
  const content = <View style={[styles.content, { paddingBottom: contentPad }, style]}>{children}</View>;
  return (
    <SafeAreaView style={styles.safe} edges={['top', 'left', 'right']}>
      {header ? (
        <View style={styles.headerWrap}>
          <View style={[styles.content, styles.headerBox]}>{header}</View>
        </View>
      ) : null}
      {scroll ? (
        <ScrollView
          contentContainerStyle={styles.scroll}
          showsVerticalScrollIndicator={false}
          refreshControl={onRefresh ? <RefreshControl refreshing={refreshing ?? false} onRefresh={onRefresh} tintColor={color.brand[600]} /> : undefined}
        >
          {content}
        </ScrollView>
      ) : (
        content
      )}
    </SafeAreaView>
  );
}

export function ScreenHeader({
  title,
  subtitle,
  back = false,
  right,
  left,
}: {
  title: string;
  subtitle?: string;
  back?: boolean;
  right?: React.ReactNode;
  left?: React.ReactNode;
}) {
  const router = useRouter();
  return (
    <View style={styles.header}>
      <View style={styles.headerRow}>
        {back && (
          <PressableRadius onPress={() => router.back()} style={styles.backBtn}>
            <ChevronLeft size={22} color={color.ink[800]} />
          </PressableRadius>
        )}
        {left}
        <View style={styles.headerText}>
          <AppText size="h2" weight="bold" color="text" numberOfLines={1}>
            {title}
          </AppText>
          {subtitle ? (
            <AppText size="caption" color="muted" numberOfLines={1}>
              {subtitle}
            </AppText>
          ) : null}
        </View>
        {right}
      </View>
    </View>
  );
}

function PressableRadius({ children, onPress, style }: { children: React.ReactNode; onPress: () => void; style?: StyleProp<ViewStyle> }) {
  return (
    <Pressable onPress={onPress} style={({ pressed }) => [style, pressed && { opacity: 0.7 }]} accessibilityRole="button">
      {children}
    </Pressable>
  );
}

const styles = StyleSheet.create({
  safe: {
    flex: 1,
    backgroundColor: semantic.bg,
  },
  scroll: {
    alignItems: 'center',
  },
  headerWrap: {
    width: '100%',
    alignItems: 'center',
    backgroundColor: semantic.bg,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: color.border,
  },
  headerBox: {
    paddingBottom: 8,
  },
  content: {
    width: '100%',
    maxWidth: layout.maxW,
    paddingHorizontal: layout.contentPadding,
    paddingTop: 6,
  },
  header: {
    marginBottom: 10,
  },
  headerRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
  },
  backBtn: {
    width: 36,
    height: 36,
    borderRadius: 12,
    backgroundColor: color.surfaceAlt,
    alignItems: 'center',
    justifyContent: 'center',
  },
  headerText: {
    flex: 1,
    gap: 0,
  },
});
