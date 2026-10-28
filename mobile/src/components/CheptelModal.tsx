import React, { useMemo } from 'react';
import { Modal, Pressable, ScrollView, StyleSheet, View, type ImageSourcePropType } from 'react-native';
import { Image } from 'expo-image';
import { X } from 'lucide-react-native';

import { AppText } from '@/components/ui/AppText';
import { palette, radii, semantic } from '@/constants/theme';
import { SPECIES_ICONS, speciesLabel } from '@/api/format';
import { BREED_IMAGES } from '@/constants/breedImages';
import type { BatchWithMetrics, Species } from '@/api/types';

interface CheptelModalProps {
  visible: boolean;
  batches: BatchWithMetrics[];
  onClose: () => void;
}

const SPECIES_IMAGES: Record<Species, number> = {
  POULET: require('@/assets/images/Poulet.jpg'),
  PINTADE: require('@/assets/images/Pintade.jpg'),
  DINDE: require('@/assets/images/Dinde.jpg'),
  CAILLE: require('@/assets/images/Caille.jpg'),
  CANARD: require('@/assets/images/Canard.jpg'),
  OIE: require('@/assets/images/Oie.jpg'),
  FAISAN: require('@/assets/images/Faisant.jpg'),
  AUTRE: require('@/assets/images/chiken.jpg'),
};

interface BreedGroup {
  key: string;
  species: Species;
  label: string;
  code: string | null;
  speciesCaption: string;
  image: ImageSourcePropType;
  alive: number;
  started: number;
  losses: number;
}

export function CheptelModal({ visible, batches, onClose }: CheptelModalProps) {
  const groups = useMemo<BreedGroup[]>(() => {
    const byKey = new Map<string, BreedGroup>();
    for (const b of batches) {
      const species = b.species ?? 'AUTRE';
      const label = b.breedName?.trim()
        ? b.breedName.trim()
        : species === 'AUTRE'
          ? (b.customSpecies ?? speciesLabel(species))
          : speciesLabel(species);
      // Le groupe porte le nom de la souche quand elle est connue :
      // on affiche donc son visuel en priorité (espèce en secours).
      const image =
        (b.breedName?.trim() ? BREED_IMAGES[b.breedName.trim()] : undefined) ?? SPECIES_IMAGES[species];
      const key = `${species}|${label}`;
      let g = byKey.get(key);
      if (!g) {
        g = {
          key,
          species,
          label,
          code: b.breedCode ?? null,
          speciesCaption: speciesLabel(species),
          image,
          alive: 0,
          started: 0,
          losses: 0,
        };
        byKey.set(key, g);
      }
      g.started += b.quantityAtStart;
      g.alive += b.metrics.liveCount;
    }
    const list = [...byKey.values()].filter((g) => g.started > 0 || g.alive > 0);
    list.forEach((g) => {
      g.losses = Math.max(0, g.started - g.alive);
    });
    return list.sort((a, b) => b.alive - a.alive);
  }, [batches]);

  const totalAlive = groups.reduce((s, g) => s + g.alive, 0);

  return (
    <Modal transparent statusBarTranslucent animationType="fade" visible={visible} onRequestClose={onClose}>
      <Pressable style={styles.backdrop} onPress={onClose} accessibilityRole="button" accessibilityLabel="Fermer">
        <Pressable style={styles.card} onPress={() => {}} accessibilityRole="none">
          <View style={styles.header}>
            <View>
              <AppText size="h3" weight="bold" color="text">Cheptel vivant</AppText>
              <AppText size="small" color="faint">
                {groups.length > 0 ? `${groups.length} souche(s) · ${fmtNumber(totalAlive)} oiseau(x)` : 'Aucune donnée'}
              </AppText>
            </View>
            <Pressable
              onPress={onClose}
              accessibilityRole="button"
              accessibilityLabel="Fermer"
              style={({ pressed }) => [styles.closeBtn, pressed && styles.closeBtnPressed]}>
              <X size={18} color={palette.ink[600]} />
            </Pressable>
          </View>

          <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={styles.list}>
            {groups.length === 0 ? (
              <View style={styles.empty}>
                <AppText size="body" color="faint">Aucun oiseau dans le cheptel pour l’instant.</AppText>
              </View>
            ) : (
              groups.map((g) => (
                <View key={g.key} style={styles.row}>
                  <View style={styles.imageWrap}>
                    <Image source={g.image} style={styles.image} contentFit="cover" />
                  </View>
                  <View style={styles.rowBody}>
                    <View style={styles.rowTitle}>
                      <AppText size="body" weight="bold" color="text" numberOfLines={1} style={styles.rowLabel}>{g.label}</AppText>
                      <AppText size="small">{SPECIES_ICONS[g.species]}</AppText>
                    </View>
                    <AppText size="caption" color="faint" numberOfLines={1}>{g.speciesCaption}{g.code ? ` · ${g.code}` : ''}</AppText>
                    <View style={styles.statsRow}>
                      <View style={styles.stat}>
                        <AppText size="body" weight="bold" color="success">{fmtNumber(g.alive)}</AppText>
                        <AppText size="caption" color="faint">Vivants</AppText>
                      </View>
                      <View style={styles.statDivider} />
                      <View style={styles.stat}>
                        <AppText size="body" weight="bold" color="brand">{fmtNumber(g.started)}</AppText>
                        <AppText size="caption" color="faint">Démarrage</AppText>
                      </View>
                      <View style={styles.statDivider} />
                      <View style={styles.stat}>
                        <AppText size="body" weight="bold" color={g.losses > 0 ? 'danger' : 'muted'}>{fmtNumber(g.losses)}</AppText>
                        <AppText size="caption" color="faint">Pertes</AppText>
                      </View>
                    </View>
                  </View>
                </View>
              ))
            )}
          </ScrollView>
        </Pressable>
      </Pressable>
    </Modal>
  );
}

function fmtNumber(n: number): string {
  return n.toLocaleString('fr-FR');
}

const styles = StyleSheet.create({
  backdrop: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: 'rgba(16, 24, 32, 0.35)',
    padding: 20,
  },
  card: {
    width: '100%',
    maxWidth: 420,
    maxHeight: '82%',
    backgroundColor: semantic.surface,
    borderRadius: 24,
    padding: 18,
    gap: 12,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 10 },
    shadowOpacity: 0.25,
    shadowRadius: 24,
    elevation: 8,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 10,
  },
  closeBtn: {
    width: 30,
    height: 30,
    borderRadius: 15,
    backgroundColor: semantic.surfaceAlt,
    alignItems: 'center',
    justifyContent: 'center',
  },
  closeBtnPressed: { transform: [{ scale: 0.94 }], opacity: 0.7 },
  list: { gap: 10, paddingBottom: 4 },
  empty: { alignItems: 'center', paddingVertical: 32 },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    padding: 10,
    borderRadius: radii.lg,
    backgroundColor: semantic.surfaceAlt,
  },
  imageWrap: {
    width: 64,
    height: 64,
    borderRadius: radii.md,
    overflow: 'hidden',
    backgroundColor: semantic.surface,
  },
  image: { width: '100%', height: '100%' },
  rowBody: { flex: 1, minWidth: 0, gap: 6 },
  rowTitle: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  rowLabel: { flex: 1 },
  statsRow: { flexDirection: 'row', alignItems: 'center' },
  stat: { flex: 1, alignItems: 'center', gap: 1 },
  statDivider: { width: 1, height: 22, backgroundColor: semantic.border },
});