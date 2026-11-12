import React from 'react';
import { Pressable, StyleSheet, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { X } from 'lucide-react-native';

import { AppText } from './ui/AppText';
import { Button } from './ui/Button';
import { radii, semantic, shadow } from '@/constants/theme';
import { useAppUpdate } from '@/updates/useAppUpdate';

// Room for the ConnectionStrip (status-bar inset + one thin line) the tab layouts draw at the top.
const STRIP_HEIGHT = 36;

/**
 * Discreet banner at the top: « Nouvelle mise à jour · Installer » (bundle
 * already downloaded) or « Nouvelle version disponible · Mettre à jour » (new
 * APK). Nothing happens until the user taps. Renders nothing otherwise.
 */
export function AppUpdateBanner() {
  const insets = useSafeAreaInsets();
  const { state, dismissed, dismiss, applyOta, installApk } = useAppUpdate();
  const busy = state.kind === 'applying' || state.kind === 'downloading';
  if (state.kind === 'none' || (dismissed && !busy)) return null;

  const title =
    state.kind === 'ota' || state.kind === 'applying'
      ? 'Nouvelle mise à jour'
      : state.kind === 'downloading'
        ? `Téléchargement ${Math.round(state.progress * 100)} %`
        : 'Nouvelle version disponible';
  const label = state.kind === 'ota' ? 'Installer' : 'Mettre à jour';
  const onPress = () => {
    if (state.kind === 'ota') void applyOta();
    else if (state.kind === 'apk') void installApk(state.info);
  };

  return (
    <View pointerEvents="box-none" style={[styles.wrap, { top: insets.top + STRIP_HEIGHT }]}>
      <View style={styles.card} accessibilityRole="alert">
        <AppText size="small" weight="semibold" color={semantic.heroText} style={styles.title} numberOfLines={1} adjustsFontSizeToFit minimumFontScale={0.8}>
          {title}
        </AppText>
        <Button label={label} onPress={onPress} size="xs" tone="accent" block={false} disabled={busy} loading={busy} />
        {!busy ? (
          <Pressable accessibilityLabel="Plus tard" onPress={dismiss} hitSlop={10} style={styles.close}>
            <X size={16} color={semantic.heroText} />
          </Pressable>
        ) : null}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { position: 'absolute', left: 12, right: 12, zIndex: 1000, elevation: 20, alignItems: 'center' },
  card: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    maxWidth: 420,
    width: '100%',
    paddingLeft: 14,
    paddingRight: 8,
    paddingVertical: 8,
    borderRadius: radii.pill,
    backgroundColor: semantic.heroBg,
    ...shadow.card,
  },
  title: { flex: 1, minWidth: 0 },
  close: { padding: 4 },
});
