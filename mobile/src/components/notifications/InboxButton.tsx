import React from 'react';
import { Pressable, StyleSheet, View } from 'react-native';
import { useRouter } from 'expo-router';
import { Inbox } from 'lucide-react-native';

import { AppText } from '@/components/ui/AppText';
import { useAuth } from '@/auth/AuthContext';
import { hasInbox } from '@/poufa/access';
import { badgeLabel } from '@/poufa/notifications';
import { color, palette, semantic } from '@/constants/theme';
import { useUnreadCount } from './useInbox';

/** Header button of the notification inbox, with the unread badge. */
export function InboxButton() {
  const router = useRouter();
  const { user } = useAuth();
  const unread = useUnreadCount();
  if (!hasInbox(user.role)) return null;
  const label = badgeLabel(unread.data?.count);
  return (
    <Pressable
      onPress={() => router.push('/notifications' as never)}
      accessibilityRole="button"
      accessibilityLabel={label ? `${label} notifications non lues` : 'Notifications'}
      style={({ pressed }) => [styles.btn, label != null && styles.active, pressed && styles.pressed]}>
      <Inbox size={19} color={label ? semantic.primary : palette.ink[600]} strokeWidth={2} />
      {label ? (
        <View style={styles.badge}>
          <AppText size="label" weight="bold" color="surface">
            {label}
          </AppText>
        </View>
      ) : null}
    </Pressable>
  );
}

const styles = StyleSheet.create({
  btn: {
    width: 42,
    height: 42,
    borderRadius: 21,
    backgroundColor: semantic.surface,
    borderWidth: 1,
    borderColor: color.border,
    alignItems: 'center',
    justifyContent: 'center',
  },
  active: { backgroundColor: semantic.primarySoft, borderColor: palette.brand[200] },
  pressed: { opacity: 0.85, transform: [{ scale: 0.99 }] },
  badge: {
    position: 'absolute',
    top: -2,
    right: -2,
    minWidth: 18,
    height: 18,
    borderRadius: 9,
    backgroundColor: palette.red[500],
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 4,
  },
});
