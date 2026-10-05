import React from 'react';
import { Pressable, ScrollView, StyleSheet, View } from 'react-native';
import { useRouter, type Href } from 'expo-router';
import {
  Activity,
  Bird,
  ClipboardList,
  Coins,
  FileBarChart2,
  Handshake,
  ListTodo,
  MapPin,
  Stethoscope,
  Store,
  User,
  Wheat,
} from 'lucide-react-native';

import { Screen } from '@/components/ui/Screen';
import { AppText } from '@/components/ui/AppText';
import { color, palette, radii } from '@/constants/theme';

interface GridItem {
  key: string;
  label: string;
  sub: string;
  icon: React.ReactNode;
  bg: string;
  fg: string;
  href: Href;
}

export default function MenuScreen() {
  const router = useRouter();

  const items = [
    { key: 'profil', label: 'Profil', sub: 'Compte & paramètres', icon: <User size={24} color={color.brand[600]} />, bg: color.brand[50], fg: color.brand[600], href: '/reglages' },
    { key: 'activites', label: 'Activités', sub: 'Journal & opérations', icon: <Activity size={24} color={color.brand[600]} />, bg: color.brand[50], fg: color.brand[600], href: '/activites' },
    { key: 'marche', label: 'Marché', sub: 'Vitrine clients (bientôt)', icon: <Store size={24} color={color.green[600]} />, bg: color.green[50], fg: color.green[600], href: '/marche' },
    { key: 'sanitaire', label: 'Sanitaire', sub: 'Protocoles & soins', icon: <Stethoscope size={24} color={color.brand[600]} />, bg: color.brand[50], fg: color.brand[600], href: '/sanitary' },
    { key: 'stock', label: 'Stock & provendes', sub: 'Inventaire, pertes, mouvements', icon: <Wheat size={24} color={color.amber[600]} />, bg: color.amber[50], fg: color.amber[600], href: '/provende' },
    { key: 'abattage', label: 'Abattage', sub: 'Ordres & passeport', icon: <Bird size={24} color={color.brand[600]} />, bg: color.brand[50], fg: color.brand[600], href: '/slaughter' },
    { key: 'caisse', label: 'Caisse', sub: 'Ouverture & encaisses', icon: <Coins size={24} color={color.green[600]} />, bg: color.green[50], fg: color.green[600], href: '/caisse' },
    { key: 'commandes', label: 'Commandes', sub: 'Bons & précommandes', icon: <ClipboardList size={24} color={color.accent[600]} />, bg: color.accent[50], fg: color.accent[600], href: '/commandes' },
    { key: 'taches', label: 'Tâches', sub: 'Travail de l\'équipe', icon: <ListTodo size={24} color={color.amber[600]} />, bg: color.amber[50], fg: color.amber[600], href: '/tasks' },
    { key: 'pointsvente', label: 'Points de vente', sub: 'Ferme & points de vente', icon: <MapPin size={24} color={color.brand[600]} />, bg: color.brand[50], fg: color.brand[600], href: '/points-vente' },
    { key: 'clients', label: 'Clients', sub: 'Profils, soldes', icon: <Handshake size={24} color={color.accent[600]} />, bg: color.accent[50], fg: color.accent[600], href: '/clients' },
    { key: 'rapports', label: 'Rentabilité', sub: 'P&L & exports PDF', icon: <FileBarChart2 size={24} color={color.green[600]} />, bg: color.green[50], fg: color.green[600], href: '/rapports' },
  ] satisfies GridItem[];

  return (
    <Screen bottomPad={0} scroll={false} style={styles.fill}>
      {/* Centre le contenu quand tout tient à l'écran, défile s'il déborde
          (petits appareils / grandes polices) — plus aucune carte tronquée. */}
      <ScrollView
        style={styles.fill}
        contentContainerStyle={styles.gridWrap}
        showsVerticalScrollIndicator={false}>
        <View style={styles.grid}>
          {items.map((item) => (
            <Pressable
              key={item.key}
              onPress={() => router.push(item.href)}
              style={({ pressed }) => [styles.card, pressed && { opacity: 0.8, transform: [{ scale: 0.98 }] }]}
              accessibilityRole="button"
              accessibilityLabel={item.label}>
              <View style={[styles.iconWrap, { backgroundColor: item.bg }]}>{item.icon}</View>
              <AppText size="body" weight="semibold" color="text" style={styles.label}>
                {item.label}
              </AppText>
              <AppText size="small" color="muted" style={styles.label}>
                {item.sub}
              </AppText>
            </Pressable>
          ))}
        </View>
      </ScrollView>
    </Screen>
  );
}

const styles = StyleSheet.create({
  grid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 10,
    justifyContent: 'center',
  },
  card: {
    width: '30%',
    flexGrow: 1,
    maxWidth: 140,
    alignItems: 'center',
    gap: 4,
    backgroundColor: palette.surface,
    borderRadius: radii.lg,
    borderWidth: 1,
    borderColor: palette.border,
    paddingVertical: 12,
    paddingHorizontal: 10,
  },
  iconWrap: {
    width: 44,
    height: 44,
    borderRadius: 14,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 2,
  },
  fill: {
    flex: 1,
  },
  gridWrap: {
    flexGrow: 1,
    justifyContent: 'center',
    paddingBottom: 140,
  },
  label: {
    textAlign: 'center',
    width: '100%',
  },
});
