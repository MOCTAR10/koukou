import React from 'react';
import { Pressable, StyleSheet, View } from 'react-native';
import { useRouter } from 'expo-router';
import { ArrowRight, ClipboardList, MapPin, Store } from 'lucide-react-native';

import { Screen, ScreenHeader } from '@/components/ui/Screen';
import { AppText } from '@/components/ui/AppText';
import { Card } from '@/components/ui/Card';
import { EmptyState } from '@/components/ui/EmptyState';
import { color, palette, radii } from '@/constants/theme';

export default function MarcheScreen() {
  const router = useRouter();

  return (
    <Screen bottomPad={120} header={<ScreenHeader title="Marché" subtitle="KouKou Market — votre vitrine" />}>
      <View style={{ gap: 12 }}>
        <EmptyState
          emoji="🛒"
          title="Le Marché arrive bientôt"
          description="Vous pourrez publier ici poulets, œufs et provende, et vos clients passeront commande en ligne. Le back-office des bons de commande est déjà prêt — la vitrine client arrive dans une prochaine version."
        />

        <View style={styles.links}>
          <Pressable
            onPress={() => router.push('/commandes')}
            style={({ pressed }) => [styles.link, pressed && { opacity: 0.8 }]}
            accessibilityRole="button">
            <View style={[styles.linkIcon, { backgroundColor: color.brand[50] }]}>
              <ClipboardList size={20} color={color.brand[600]} />
            </View>
            <View style={{ flex: 1 }}>
              <AppText size="body" weight="semibold" color="text">Précommandes</AppText>
              <AppText size="small" color="muted">Gérer bons & précommandes existants</AppText>
            </View>
            <ArrowRight size={16} color={color.ink[300]} />
          </Pressable>

          <Pressable
            onPress={() => router.push('/points-vente')}
            style={({ pressed }) => [styles.link, pressed && { opacity: 0.8 }]}
            accessibilityRole="button">
            <View style={[styles.linkIcon, { backgroundColor: color.green[50] }]}>
              <MapPin size={20} color={color.green[600]} />
            </View>
            <View style={{ flex: 1 }}>
              <AppText size="body" weight="semibold" color="text">Points de vente</AppText>
              <AppText size="small" color="muted">Boutiques & adresses de retrait</AppText>
            </View>
            <ArrowRight size={16} color={color.ink[300]} />
          </Pressable>
        </View>

        <Card tone="default" style={styles.note}>
          <Store size={16} color={palette.accent[500]} />
          <AppText size="small" color="muted" style={{ flex: 1 }}>
            À venir : catalogues publics, photos, prix affichés et commandes en ligne sans contact.
          </AppText>
        </Card>
      </View>
    </Screen>
  );
}

const styles = StyleSheet.create({
  links: {
    gap: 8,
  },
  link: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    backgroundColor: palette.surface,
    borderWidth: 1,
    borderColor: palette.border,
    borderRadius: radii.lg,
    paddingVertical: 12,
    paddingHorizontal: 12,
  },
  linkIcon: {
    width: 36,
    height: 36,
    borderRadius: 12,
    alignItems: 'center',
    justifyContent: 'center',
  },
  note: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
  },
});