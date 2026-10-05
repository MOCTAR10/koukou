import React from 'react';
import { StyleSheet, View, type StyleProp, type ViewStyle } from 'react-native';

import { Image } from 'expo-image';

import { API_BASE_URL } from '@/api/client';
import type { Farm } from '@/api/types';
import { palette, spacing } from '@/constants/theme';

const DEFAULT_LOGO = require('@/assets/images/logo-white.png');

/** Le serveur renvoie un chemin public (« /uploads/logos/<farmId>.png ») ; on
 *  le préfixe par l'API car un chemin relatif n'est pas résolvable par l'image. */
export function farmLogoUri(farm: Pick<Farm, 'logoUrl'> | null | undefined): string | null {
  const raw = farm?.logoUrl?.trim();
  if (!raw) return null;
  if (/^https?:\/\//i.test(raw)) return raw;
  return `${API_BASE_URL}${raw.startsWith('/') ? raw : `/${raw}`}`;
}

interface FarmLogoProps {
  farm: Pick<Farm, 'id' | 'name' | 'logoUrl'> | null | undefined;
  /** Diamètre du cercle en px. */
  size?: number;
  /** `brand` = fond bleu KouKou (défaut) ; `plain` = fond blanc pour poser le logo sur un hero coloré. */
  tone?: 'brand' | 'plain';
  /** Affiche une bordure fine claire (utile sur fond coloré). */
  ring?: boolean;
  style?: StyleProp<ViewStyle>;
}

/**
 * Logo circulaire d'une ferme : le logo uploaded par le propriétaire, ou à
 * défaut la marque KouKou blanche (asset officiel, pas de dessin à la main).
 */
export function FarmLogo({ farm, size = 44, tone = 'brand', ring = false, style }: FarmLogoProps) {
  const uri = farmLogoUri(farm);
  const inset = Math.round(size * 0.56);

  return (
    <View
      accessible
      accessibilityRole="image"
      accessibilityLabel={farm?.name ? `Logo de ${farm.name}` : 'Logo KouKou'}
      style={[
        styles.circle,
        {
          width: size,
          height: size,
          borderRadius: size / 2,
          backgroundColor: tone === 'brand' ? palette.brand[600] : palette.surface,
        },
        ring && styles.ring,
        style,
      ]}>
      <Image
        source={uri ?? DEFAULT_LOGO}
        // `cover` remplit le cercle ; le fallback 0.56 conserve la marge du motif.
        contentFit="cover"
        transition={160}
        style={uri ? styles.cover : { width: inset, height: inset }}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  circle: {
    alignItems: 'center',
    justifyContent: 'center',
    overflow: 'hidden',
    padding: spacing.xxs,
  },
  cover: {
    width: '100%',
    height: '100%',
    // Neutralise le padding du parent pour un remplissage exact du disque.
    margin: -spacing.xxs,
  },
  ring: {
    borderWidth: 2,
    borderColor: 'rgba(255,255,255,0.35)',
  },
});