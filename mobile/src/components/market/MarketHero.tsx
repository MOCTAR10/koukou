import React from 'react';
import { Pressable, StyleSheet, View } from 'react-native';
import { TextInput } from '@/components/ui/AppTextInput';
import Svg, { Circle, Defs, LinearGradient, RadialGradient, Rect, Stop } from 'react-native-svg';
import { HandCoins, MapPin, QrCode, ShieldCheck, X, type LucideIcon } from 'lucide-react-native';

import { AppText } from '@/components/ui/AppText';
import { color, fontFor, palette, radii, semantic, shadow, spacing, typography } from '@/constants/theme';

const TRUST: { icon: LucideIcon; label: string }[] = [
  { icon: ShieldCheck, label: 'Fermes vérifiées' },
  { icon: QrCode, label: 'Lots tracés' },
  { icon: HandCoins, label: 'Paiement direct' },
];

/**
 * Top of the catalogue: the one dark surface of the screen (same family as the
 * home hero), with the city search inside and what makes the Market trustworthy.
 */
export function MarketHero({ city, onCity }: { city: string; onCity: (city: string) => void }) {
  return (
    <View style={styles.card}>
      <Svg style={StyleSheet.absoluteFill} width="100%" height="100%" preserveAspectRatio="none">
        <Defs>
          <LinearGradient id="marketHeroBg" x1="0" y1="0" x2="1" y2="1">
            <Stop offset="0" stopColor={palette.brand[950]} />
            <Stop offset="1" stopColor={palette.brand[800]} />
          </LinearGradient>
          <RadialGradient id="marketHeroGreen" cx="50%" cy="50%" r="50%">
            <Stop offset="0" stopColor={palette.green[500]} stopOpacity={0.34} />
            <Stop offset="1" stopColor={palette.green[500]} stopOpacity={0} />
          </RadialGradient>
          <RadialGradient id="marketHeroBlue" cx="50%" cy="50%" r="50%">
            <Stop offset="0" stopColor={palette.brand[400]} stopOpacity={0.3} />
            <Stop offset="1" stopColor={palette.brand[400]} stopOpacity={0} />
          </RadialGradient>
        </Defs>
        <Rect x="0" y="0" width="100%" height="100%" fill="url(#marketHeroBg)" />
        <Circle cx="94%" cy="4%" r="130" fill="url(#marketHeroGreen)" />
        <Circle cx="2%" cy="100%" r="120" fill="url(#marketHeroBlue)" />
      </Svg>

      <AppText size="label" weight="semibold" color={palette.green[300]} style={styles.eyebrow}>
        LE MARCHÉ FERMIA
      </AppText>
      <AppText size="h1" weight="bold" color={semantic.textOnFill} accessibilityRole="header">
        Achetez en direct aux fermes du Gabon.
      </AppText>
      <AppText size="bodyM" color={palette.brand[100]}>
        Volaille, œufs et carcasses, disponibles tout de suite ou en précommande.
      </AppText>

      <View style={styles.search}>
        <MapPin size={18} color={color.brand[500]} />
        <TextInput
          value={city}
          onChangeText={onCity}
          placeholder="Dans quelle ville ?"
          placeholderTextColor={color.ink[400]}
          accessibilityLabel="Ville"
          autoCorrect={false}
          returnKeyType="search"
          style={styles.input}
        />
        {city ? (
          <Pressable onPress={() => onCity('')} hitSlop={10} accessibilityRole="button" accessibilityLabel="Effacer la ville">
            <X size={18} color={color.ink[400]} />
          </Pressable>
        ) : null}
      </View>

      <View style={styles.trust}>
        {TRUST.map(({ icon: Icon, label }) => (
          <View key={label} style={styles.trustItem}>
            <Icon size={14} color={palette.green[300]} strokeWidth={2.2} />
            <AppText size="small" weight="medium" color={palette.brand[100]}>
              {label}
            </AppText>
          </View>
        ))}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  card: {
    borderRadius: radii.xxl,
    overflow: 'hidden',
    backgroundColor: semantic.heroBg,
    padding: spacing.xl,
    gap: spacing.sm,
  },
  eyebrow: {
    letterSpacing: 1.6,
  },
  search: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    marginTop: spacing.sm,
    paddingHorizontal: spacing.lg,
    height: 50,
    borderRadius: radii.pill,
    backgroundColor: semantic.surface,
    ...shadow.raised,
  },
  input: {
    flex: 1,
    height: '100%',
    padding: 0,
    color: semantic.text,
    fontSize: typography.body.fontSize,
    ...fontFor('regular'),
  },
  trust: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    columnGap: spacing.lg,
    rowGap: spacing.xs,
    marginTop: spacing.sm,
  },
  trustItem: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
});
