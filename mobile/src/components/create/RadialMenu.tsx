import React, { useEffect, useMemo, useState } from 'react';
import { Modal, Pressable, StyleSheet, useWindowDimensions, View } from 'react-native';
import Animated, {
  Easing,
  interpolate,
  useAnimatedProps,
  useAnimatedStyle,
  useSharedValue,
  withTiming,
  type SharedValue,
} from 'react-native-reanimated';
import Svg, { Circle } from 'react-native-svg';
import * as Haptics from 'expo-haptics';
import type { LucideIcon } from 'lucide-react-native';

import { AppText } from '../ui/AppText';
import { palette, radii, shadow } from '@/constants/theme';
import { durations } from '@/constants/motion';
import {
  HUB_LOGO,
  HUB_NAME_H,
  HUB_SIZE,
  NODE_SIZE,
  guideCircleSize,
  labelAnchor,
  layout,
} from './radialGeometry';

const AnimatedCircle = Animated.createAnimatedComponent(Circle);

/** Décalage entre deux nœuds à l'apparition : l'anneau se déploie en éventail. */
const STAGGER = 0.16;
/** Part de l'animation où le dernier nœud a fini (laisse le hub respirer). */
const SPAN = 0.95;
/** Durée maximale de l'animation de sortie — le Modal reste monté pendant ce délai. */
const EXIT_MS = 200;
/** Décalage du déploiement des libellés, en fraction de la fenêtre du nœud. */
const LABEL_DELAY = 0.4;

export interface RadialItem {
  key: string;
  /** Libellé complet, lu par le lecteur d'écran. */
  label: string;
  /**
   * Libellé affiché sous l'icône. Court volontairement : sur un anneau serré,
   * c'est la seule largeur qui reste lisible entre deux nœuds voisins.
   */
  short: string;
  /** Précision affichée dans l'étiquette de fond, à la lecture. */
  hint: string;
  icon: LucideIcon;
  bg: string;
  fg: string;
}

/**
 * Menu radial : un hub logo au centre, les actions réparties sur un cercle.
 *
 * Choix de conception :
 *  - une seule `progress` partagée pilote tout le déploiement ; chaque nœud
 *    interpole sur une fenêtre décalée de son indice, donc l'anneau se déroule
 *    en cascade sans une valeur partagée par nœud ;
 *  - seules `transform` et `opacity` sont animées (GPU) ;
 *  - le libellé est TOUJOURS visible : un menu radial sert d'abord à
 *    s'orienter, et demander un appui pour savoir ce qu'est une icône fait
 *    perdre la moitié de son intérêt. Seuls `short` et `hint` sont séparés pour
 *    tenir dans l'espace entre deux nœuds.
 */
export function RadialMenu({
  visible,
  items,
  onPick,
  onClose,
  hubLabel,
  hub,
}: {
  visible: boolean;
  items: RadialItem[];
  onPick: (key: string) => void;
  onClose: () => void;
  /** Texte sous le logo (nom de la ferme). */
  hubLabel: string;
  /** Logo du hub : la marque KouKou, ou le logo de la ferme si elle en a un. */
  hub: React.ReactNode;
}) {
  const { width, height } = useWindowDimensions();

  // Une seule passe de calcul : rayon, centre et positions ne peuvent plus
  // diverger entre eux, ni avec les ancres de libellés.
  const { radius, hub: centre, slots } = useMemo(
    () => layout(items.length, { width, height }),
    [items.length, width, height],
  );

  // Le contenu reste monté pendant la sortie, comme `Sheet`.
  const [mounted, setMounted] = useState(visible);
  const [pressed, setPressed] = useState<string | null>(null);
  const progress = useSharedValue(0);

  useEffect(() => {
    if (visible) {
      setMounted(true);
      progress.value = 0;
      Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light).catch(() => {});
      progress.value = withTiming(1, {
        duration: durations.base + STAGGER * 1000 * items.length,
        easing: Easing.out(Easing.cubic),
      });
      return;
    }
    progress.value = withTiming(0, { duration: EXIT_MS, easing: Easing.in(Easing.cubic) });
    const t = setTimeout(() => setMounted(false), EXIT_MS + 20);
    return () => clearTimeout(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [visible]);

  const scrimStyle = useAnimatedStyle(() => ({ opacity: progress.value }));

  if (!mounted) return null;

  return (
    <Modal
      visible={mounted}
      transparent
      statusBarTranslucent
      navigationBarTranslucent
      animationType="none"
      onRequestClose={onClose}>
      <View style={styles.root}>
        {/* Voile : assombrissement + halo brand. Pas de vrai flou — `expo-blur`
            n'est pas une dépendance, et flouter derrière un Modal transparent
            est peu fiable sur Android. */}
        <Animated.View style={[StyleSheet.absoluteFill, styles.scrim, scrimStyle]}>
          <Pressable
            style={StyleSheet.absoluteFill}
            onPress={onClose}
            accessibilityRole="button"
            accessibilityLabel="Fermer le menu"
          />
        </Animated.View>

        <View style={styles.stage} pointerEvents="box-none">
          {/* Cercle de guidage : il se trace pendant que les nœuds se déploient,
              et il passe par le centre des nœuds pour les relier visuellement. */}
          <GuideRing radius={radius} centre={centre} progress={progress} />

          <Hub
            progress={progress}
            label={hubLabel}
            hub={hub}
            centre={centre}
            onPress={onClose}
          />

          {items.map((item, i) => {
            const slot = slots[i] ?? { x: 0, y: 0 };
            return (
              <Node
                key={item.key}
                item={item}
                index={i}
                count={items.length}
                slot={slot}
                centre={centre}
                progress={progress}
                active={pressed === item.key}
                onPressIn={() => setPressed(item.key)}
                onPressOut={() => setPressed(null)}
                onPress={() => {
                  Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium).catch(() => {});
                  setPressed(null);
                  onPick(item.key);
                }}
              />
            );
          })}

          {/*
            Les libellés sont des frères des nœuds, pas leurs enfants : leur
            position vient de `labelAnchor` en coordonnées écran. Comme enfant
            d'un nœud, elle s'ajouterait à celle du nœud et le texte partirait
            hors écran.
          */}
          {items.map((item, i) => (
            <NodeLabel
              key={`${item.key}-label`}
              item={item}
              index={i}
              count={items.length}
              slot={slots[i] ?? { x: 0, y: 0 }}
              centre={centre}
              bounds={{ width, height }}
              progress={progress}
              active={pressed === item.key}
            />
          ))}
        </View>
      </View>
    </Modal>
  );
}

/** Cercle de guidage qui se trace en même temps que les nœuds. */
function GuideRing({
  radius,
  centre,
  progress,
}: {
  radius: number;
  centre: { x: number; y: number };
  progress: SharedValue<number>;
}) {
  const size = guideCircleSize(radius);
  const r = radius;
  const circumference = 2 * Math.PI * r;

  const animatedProps = useAnimatedProps(() => ({
    strokeDashoffset: circumference * (1 - progress.value),
  }));

  return (
    <View
      pointerEvents="none"
      style={[styles.guide, { left: centre.x - size / 2, top: centre.y - size / 2 }]}>
      <Svg width={size} height={size}>
        <AnimatedCircle
          cx={radius}
          cy={radius}
          r={r}
          stroke={palette.brand[300]}
          strokeWidth={1.5}
          strokeDasharray={circumference}
          fill="none"
          opacity={0.45}
          animatedProps={animatedProps}
        />
      </Svg>
    </View>
  );
}

/** Hub central : le logo, qui ferme aussi le menu au tap. */
function Hub({
  progress,
  label,
  hub,
  centre,
  onPress,
}: {
  progress: SharedValue<number>;
  label: string;
  hub: React.ReactNode;
  centre: { x: number; y: number };
  onPress: () => void;
}) {
  const style = useAnimatedStyle(() => ({
    opacity: interpolate(progress.value, [0, 0.3], [0, 1], 'clamp'),
    transform: [
      { scale: interpolate(progress.value, [0, 0.7], [0.55, 1], 'clamp') },
      { rotate: `${interpolate(progress.value, [0, 0.7], [-25, 0], 'clamp')}deg` },
    ],
  }));

  return (
    <View
      style={[
        styles.hub,
        {
          left: centre.x - (HUB_SIZE + 16) / 2,
          top: centre.y - HUB_LOGO / 2,
        },
      ]}>
      <Pressable
        onPress={onPress}
        accessibilityRole="button"
        accessibilityLabel="Fermer le menu"
        style={styles.hubPress}>
        <Animated.View style={[styles.hubInner, style]}>
          <View style={styles.hubLogo}>{hub}</View>
          {/* Nom de la ferme en blanc, replié sur plusieurs lignes : un nom de
              ferme gabonais (« Ferme de Mvett Mvett ») ne tient pas sur une
              ligne de 88pt, et le tronquer casserait l'orientation. */}
          <AppText size="small" weight="bold" color={palette.surface} align="center" style={styles.hubLabel}>
            {label}
          </AppText>
        </Animated.View>
      </Pressable>
    </View>
  );
}

/** Un nœud du cercle : se déploie depuis le centre, s'agrandit au appui. */
function Node({
  item,
  index,
  count,
  slot,
  centre,
  progress,
  active,
  onPressIn,
  onPressOut,
  onPress,
}: {
  item: RadialItem;
  index: number;
  count: number;
  slot: { x: number; y: number };
  centre: { x: number; y: number };
  progress: SharedValue<number>;
  active: boolean;
  onPressIn: () => void;
  onPressOut: () => void;
  onPress: () => void;
}) {
  const Icon = item.icon;
  const { start, width } = nodeWindow(index, count);

  const style = useAnimatedStyle(() => {
    const t = interpolate(progress.value, [start, start + width], [0, 1], 'clamp');
    return {
      opacity: t,
      transform: [
        { translateX: slot.x * t },
        { translateY: slot.y * t },
        { scale: interpolate(t, [0, 1], [0.4, 1]) * (active ? 1.12 : 1) },
      ],
    };
  });

  return (
    <Animated.View
      style={[
        styles.node,
        // La position statique est le CENTRE : la transform translate déjà de
        // `slot * t`, donc ajouter `slot` ici décalerait le nœud au repos à
        // `2 × rayon` — hors du cercle de guidage, sur les bords de l'écran,
        // et sous son libellé qui, lui, est calculé au rayon réel.
        {
          left: centre.x - NODE_SIZE / 2,
          top: centre.y - NODE_SIZE / 2,
          width: NODE_SIZE,
          height: NODE_SIZE,
        },
        style,
      ]}>
      <Pressable
        onPressIn={() => {
          Haptics.selectionAsync().catch(() => {});
          onPressIn();
        }}
        onPressOut={onPressOut}
        onPress={onPress}
        accessibilityRole="menuitem"
        accessibilityLabel={`${item.label}, ${item.hint}`}
        accessibilityHint={item.hint}
        style={({ pressed }) => [
          styles.nodePress,
          { backgroundColor: item.bg, borderColor: pressed ? item.fg : palette.surface },
        ]}>
        <Icon size={22} color={item.fg} strokeWidth={2.3} />
      </Pressable>
    </Animated.View>
  );
}

/**
 * Fenêtre d'animation d'un nœud sur la progression partagée. Découpée pour que
 * l'icône (`Node`) et son libellé (`NodeLabel`) se déploient sur la même
 * fenêtre, décalée — sinon le texte arriverait avant l'icône qu'il désigne.
 */
function nodeWindow(index: number, count: number): { start: number; width: number } {
  const step = SPAN / Math.max(1, count);
  const start = index * step;
  // Le dernier nœud doit finir pile à `progress = 1`, sinon il s'immobilise à
  // ~88 % de sa course et reste assis en dessous du cercle de guidage.
  const width = Math.min(0.34, start + step * 1.5 <= 1 ? step * 1.5 : 1 - start);
  return { start, width };
}

/**
 * Libellé permanent d'un nœud, frère du nœud et non enfant : sa position est
 * absolue dans le `stage`, donc en coordonnées écran.
 */
function NodeLabel({
  item,
  index,
  count,
  slot,
  centre,
  bounds,
  progress,
  active,
}: {
  item: RadialItem;
  index: number;
  count: number;
  slot: { x: number; y: number };
  centre: { x: number; y: number };
  bounds: { width: number; height: number };
  progress: SharedValue<number>;
  active: boolean;
}) {
  const { start, width } = nodeWindow(index, count);

  const style = useAnimatedStyle(() => {
    // Décalé dans la fenêtre : l'anneau se lit d'abord, puis les mots.
    const t = interpolate(progress.value, [start + width * LABEL_DELAY, start + width], [0, 1], 'clamp');
    return {
      opacity: t,
      transform: [{ translateY: interpolate(t, [0, 1], [3, 0]) }],
    };
  });

  const pos = labelAnchor(slot, centre, bounds, item.short, count);

  return (
    <Animated.View
      pointerEvents="none"
      style={[
        styles.label,
        { left: pos.left, top: pos.top, width: pos.width, height: pos.height },
        active && styles.labelActive,
        style,
      ]}>
      {/* `numberOfLines` n'est pas posé : le libellé doit rester entier.
          `labelWidth` a déjà dimensionné la boîte au texte, donc il ne peut pas
          déborder — et s'il le devait, il vaut mieux un retour à la ligne
          lisible qu'un nom tronqué sans indice. */}
      <AppText
        size="small"
        weight={active ? 'bold' : 'semibold'}
        color={palette.surface}
        align="center">
        {item.short}
      </AppText>
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1 },
  scrim: { backgroundColor: 'rgba(12, 35, 49, 0.62)' },
  stage: { ...StyleSheet.absoluteFillObject },
  guide: { position: 'absolute' },
  // Le conteneur englobe logo + nom, donc plus haut que HUB_SIZE : sa position
  // est calculée pour que le CENTRE du logo tombe sur `centre.y`.
  hub: {
    position: 'absolute',
    width: HUB_SIZE + 16,
    alignItems: 'center',
    justifyContent: 'flex-start',
  },
  hubPress: { alignItems: 'center', justifyContent: 'center' },
  hubInner: { alignItems: 'center' },
  hubLogo: {
    width: HUB_LOGO,
    height: HUB_LOGO,
    borderRadius: HUB_LOGO / 2,
    backgroundColor: palette.brand[600],
    borderWidth: 3,
    borderColor: palette.surface,
    alignItems: 'center',
    justifyContent: 'center',
    overflow: 'hidden',
    ...shadow.fab,
  },
  // Le nom est centré sous le logo, dans l'espace que le rayon a réservé.
  hubLabel: {
    marginTop: 4,
    minHeight: HUB_NAME_H,
    maxWidth: HUB_SIZE + 16,
    textAlign: 'center',
  },
  node: { position: 'absolute' },
  nodePress: {
    width: NODE_SIZE,
    height: NODE_SIZE,
    borderRadius: NODE_SIZE / 2,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 2,
    ...shadow.card,
  },
  // Ancre absolue dans le `stage` : la position vient de `labelAnchor`, en
  // coordonnées écran, indépendamment du nœud qu'elle désigne.
  label: {
    position: 'absolute',
    alignItems: 'center',
    justifyContent: 'flex-start',
    paddingHorizontal: 4,
  },
  // Au repos le libellé est du texte blanc nu sur le voile sombre ; à l'état
  // actif il gagne une pastille pour se détacher du voisin survolé.
  labelActive: {
    backgroundColor: 'rgba(12, 35, 49, 0.55)',
    borderRadius: radii.sm,
  },
});