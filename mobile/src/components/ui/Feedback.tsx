import React, { useEffect, useId, useSyncExternalStore } from 'react';
import { Modal, Pressable, StyleSheet, View } from 'react-native';
import Animated, { FadeIn, FadeInUp, FadeOut, FadeOutUp } from 'react-native-reanimated';
import { initialWindowMetrics, useSafeAreaInsets } from 'react-native-safe-area-context';
import * as Haptics from 'expo-haptics';
import { AlertTriangle, CircleAlert, CircleCheck, Info, type LucideIcon } from 'lucide-react-native';

import { AppText } from './AppText';
import { Button } from './Button';
import { palette, radii, semantic, shadow } from '@/constants/theme';
import { durations, reduceMotion } from '@/constants/motion';

/*
 * Styled replacement for `Alert.alert`: `toast.*` for messages, `confirm()`
 * for yes/no decisions. Both are plain functions (usable in mutation
 * callbacks) backed by a tiny store; <FeedbackHost/> renders them.
 *
 * Native modals draw above everything, so a toast fired from inside a Sheet
 * would be hidden under it. Each Sheet mounts a <ToastViewport/> too, and
 * only the most recently mounted viewport renders the toast.
 */

type ToastTone = 'success' | 'error' | 'info';
interface ToastItem {
  id: number;
  tone: ToastTone;
  title: string;
  message?: string;
}
interface ConfirmRequest {
  title: string;
  message?: string;
  confirmLabel?: string;
  cancelLabel?: string;
  destructive?: boolean;
  resolve: (ok: boolean) => void;
}
interface State {
  toast: ToastItem | null;
  confirm: ConfirmRequest | null;
  viewports: string[];
}

let state: State = { toast: null, confirm: null, viewports: [] };
const listeners = new Set<() => void>();
let toastSeq = 0;
let toastTimer: ReturnType<typeof setTimeout> | null = null;

function setState(patch: Partial<State>) {
  state = { ...state, ...patch };
  listeners.forEach((l) => l());
}
function subscribe(l: () => void) {
  listeners.add(l);
  return () => listeners.delete(l);
}
function useFeedbackState() {
  return useSyncExternalStore(subscribe, () => state, () => state);
}

function show(tone: ToastTone, title: string, message?: string) {
  if (toastTimer) clearTimeout(toastTimer);
  setState({ toast: { id: ++toastSeq, tone, title, message } });
  Haptics.notificationAsync(
    tone === 'error' ? Haptics.NotificationFeedbackType.Error : Haptics.NotificationFeedbackType.Success,
  ).catch(() => {});
  // Reading time grows with the text (≈ 45 ms/char), errors get a floor of
  // 5.5 s since they usually carry a reason to read. Tap dismisses early.
  const chars = title.length + (message?.length ?? 0);
  const ms = Math.min(10_000, Math.max(tone === 'error' ? 5500 : 3500, chars * 45));
  toastTimer = setTimeout(() => setState({ toast: null }), ms);
}

export const toast = {
  success: (title: string, message?: string) => show('success', title, message),
  error: (title: string, message?: string) => show('error', title, message),
  info: (title: string, message?: string) => show('info', title, message),
  dismiss: () => setState({ toast: null }),
};

/** Resolves `true` when the user confirms, `false` on cancel/backdrop. */
export function confirm(opts: Omit<ConfirmRequest, 'resolve'>): Promise<boolean> {
  return new Promise((resolve) => {
    state.confirm?.resolve(false);
    setState({ confirm: { ...opts, resolve } });
  });
}

/** Error message from an unknown thrown value (French fallback). */
export function errorMessage(e: unknown): string {
  return e instanceof Error ? e.message : 'Erreur inattendue.';
}

const TONES: Record<ToastTone, { icon: LucideIcon; tint: string; soft: string }> = {
  success: { icon: CircleCheck, tint: semantic.successText, soft: semantic.successSoft },
  error: { icon: CircleAlert, tint: semantic.dangerText, soft: semantic.dangerSoft },
  info: { icon: Info, tint: semantic.primary, soft: semantic.primarySoft },
};

export function ToastViewport() {
  const id = useId();
  const { toast: item, viewports } = useFeedbackState();
  const insets = useSafeAreaInsets();

  useEffect(() => {
    setState({ viewports: [...state.viewports, id] });
    return () => setState({ viewports: state.viewports.filter((v) => v !== id) });
  }, [id]);

  if (!item || viewports[viewports.length - 1] !== id) return null;
  const t = TONES[item.tone];
  const Icon = t.icon;
  return (
    // Inside a Modal the live inset can read 0: fall back to launch metrics.
    <View pointerEvents="box-none" style={[styles.toastLayer, { top: Math.max(insets.top, initialWindowMetrics?.insets.top ?? 0) + 8 }]}>
      <Animated.View
        key={item.id}
        entering={FadeInUp.duration(durations.fast).reduceMotion(reduceMotion)}
        exiting={FadeOutUp.duration(durations.quick).reduceMotion(reduceMotion)}>
        <Pressable
          onPress={toast.dismiss}
          style={styles.toast}
          accessibilityRole="alert"
          accessibilityLiveRegion="polite"
          accessibilityLabel={item.message ? `${item.title}. ${item.message}` : item.title}>
          <View style={[styles.toastIcon, { backgroundColor: t.soft }]}>
            <Icon size={18} color={t.tint} strokeWidth={2.2} />
          </View>
          <View style={styles.toastText}>
            <AppText size="bodyM" weight="semibold" color="text" numberOfLines={2}>
              {item.title}
            </AppText>
            {item.message ? (
              <AppText size="caption" color="muted" numberOfLines={6}>
                {item.message}
              </AppText>
            ) : null}
          </View>
        </Pressable>
      </Animated.View>
    </View>
  );
}

function ConfirmDialog() {
  const { confirm: req } = useFeedbackState();
  const close = (ok: boolean) => {
    req?.resolve(ok);
    setState({ confirm: null });
  };
  const destructive = !!req?.destructive;
  const Icon = destructive ? AlertTriangle : Info;
  return (
    <Modal visible={!!req} transparent animationType="none" statusBarTranslucent onRequestClose={() => close(false)}>
      {req ? (
        <Animated.View
          entering={FadeIn.duration(durations.quick).reduceMotion(reduceMotion)}
          exiting={FadeOut.duration(durations.quick).reduceMotion(reduceMotion)}
          style={styles.backdrop}>
          <Pressable style={StyleSheet.absoluteFill} onPress={() => close(false)} accessibilityLabel="Fermer" />
          <Animated.View
            entering={FadeInUp.duration(durations.fast).reduceMotion(reduceMotion)}
            style={styles.dialog}
            accessibilityViewIsModal>
            <View style={[styles.dialogIcon, { backgroundColor: destructive ? semantic.dangerSoft : semantic.primarySoft }]}>
              <Icon size={22} color={destructive ? semantic.dangerText : semantic.primary} strokeWidth={2} />
            </View>
            <AppText size="h3" weight="bold" color="text" align="center">
              {req.title}
            </AppText>
            {req.message ? (
              <AppText size="body" color="muted" align="center" style={styles.dialogMessage}>
                {req.message}
              </AppText>
            ) : null}
            <View style={styles.dialogActions}>
              <Button label={req.cancelLabel ?? 'Annuler'} tone="ghost" size="md" block={false} style={styles.dialogBtn} onPress={() => close(false)} />
              <Button
                label={req.confirmLabel ?? 'Confirmer'}
                tone={destructive ? 'danger' : 'primary'}
                size="md"
                block={false}
                style={styles.dialogBtn}
                onPress={() => close(true)}
              />
            </View>
          </Animated.View>
        </Animated.View>
      ) : null}
    </Modal>
  );
}

/** Mount once at the app root (inside SafeAreaProvider). */
export function FeedbackHost() {
  return (
    <>
      <ToastViewport />
      <ConfirmDialog />
    </>
  );
}

const styles = StyleSheet.create({
  toastLayer: {
    position: 'absolute',
    left: 12,
    right: 12,
    alignItems: 'center',
    zIndex: 1000,
    elevation: 1000,
  },
  toast: {
    width: '100%',
    maxWidth: 520,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    paddingVertical: 12,
    paddingHorizontal: 14,
    borderRadius: radii.lg,
    backgroundColor: semantic.surface,
    borderWidth: 1,
    borderColor: palette.border,
    ...shadow.raised,
  },
  toastIcon: {
    width: 34,
    height: 34,
    borderRadius: 17,
    alignItems: 'center',
    justifyContent: 'center',
  },
  toastText: {
    flex: 1,
    gap: 1,
  },
  backdrop: {
    flex: 1,
    backgroundColor: 'rgba(12,35,49,0.45)',
    alignItems: 'center',
    justifyContent: 'center',
    padding: 24,
  },
  dialog: {
    width: '100%',
    maxWidth: 400,
    alignItems: 'center',
    gap: 8,
    padding: 22,
    borderRadius: radii.xxl,
    backgroundColor: semantic.surface,
    ...shadow.raised,
  },
  dialogIcon: {
    width: 48,
    height: 48,
    borderRadius: 24,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 4,
  },
  dialogMessage: {
    marginTop: 2,
  },
  dialogActions: {
    flexDirection: 'row',
    gap: 10,
    marginTop: 14,
    alignSelf: 'stretch',
  },
  dialogBtn: {
    flex: 1,
  },
});
