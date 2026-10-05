import React from 'react';
import { Pressable, ScrollView, StyleSheet, View } from 'react-native';
import { useRouter, type Href } from 'expo-router';
import {
  Activity,
  Bird,
  BookOpen,
  ClipboardList,
  Coins,
  FileBarChart2,
  HandCoins,
  Handshake,
  Landmark,
  ListTodo,
  MapPin,
  ReceiptText,
  Stethoscope,
  Store,
  User,
  Users,
  Wheat,
} from 'lucide-react-native';

import { Screen } from '@/components/ui/Screen';
import { AppText } from '@/components/ui/AppText';
import { color, palette, radii } from '@/constants/theme';
import { useAuth } from '@/auth/AuthContext';
import { useFarmProfile } from '@/hooks/useFarmProfile';
import { useQuickCapture } from '@/components/capture/QuickCaptureProvider';
import { farmRoleLabel } from '@/api/roles';

interface GridItem {
  key: string;
  label: string;
  sub: string;
  icon: React.ReactNode;
  bg: string;
  fg: string;
  href: Href;
}

function GroundHome() {
  const router = useRouter();
  const { openDaily, openSale } = useQuickCapture();
  const { farms } = useAuth();
  const profileHook = useFarmProfile();

  const primary = [
    {
      key: 'daily',
      label: 'Saisie du jour',
      sub: 'Morts, aliments, eau, poids',
      icon: <BookOpen size={30} color={color.green[600]} />,
      bg: color.green[50],
      onPress: () => openDaily(),
    },
    {
      key: 'tasks',
      label: 'Mes tâches',
      sub: 'Travail assigné de l’équipe',
      icon: <ListTodo size={30} color={color.amber[600]} />,
      bg: color.amber[50],
      onPress: () => router.push('/tasks'),
    },
    {
      key: 'sell',
      label: 'Vendre',
      sub: 'POS espèces — encaisser',
      icon: <HandCoins size={30} color={color.accent[600]} />,
      bg: color.accent[50],
      onPress: () => openSale(),
    },
  ];

  const secondary = [
    { key: 'profil', label: 'Mon profil', icon: <User size={20} color={color.brand[600]} />, bg: color.brand[50], href: '/reglages' },
    { key: 'lots', label: 'Mes lots', icon: <Bird size={20} color={color.brand[600]} />, bg: color.brand[50], href: '/lots' },
  ] as const;

  return (
    <Screen>
      <View style={styles.groundHeader}>
        <AppText size="label" color="brand">
          TERRAIN · {farmRoleLabel(profileHook.profile?.role, farms[0]?.name)}
        </AppText>
        <AppText size="h2" weight="bold" color="text" style={{ marginTop: 2 }}>
          Mon terrain
        </AppText>
        <AppText size="caption" color="muted" style={{ marginTop: 2 }}>
          Saisie du jour, vos tâches et les ventes au comptoir.
        </AppText>
      </View>

      <View style={styles.groundGrid}>
        {primary.map((a) => (
          <Pressable
            key={a.key}
            onPress={a.onPress}
            style={({ pressed }) => [styles.groundCard, pressed && { opacity: 0.85, transform: [{ scale: 0.98 }] }]}
            accessibilityRole="button"
            accessibilityLabel={a.label}>
            <View style={[styles.groundIcon, { backgroundColor: a.bg }]}>{a.icon}</View>
            <AppText size="body" weight="bold" color="text" numberOfLines={1}>
              {a.label}
            </AppText>
            <AppText size="small" color="muted" numberOfLines={2}>
              {a.sub}
            </AppText>
          </Pressable>
        ))}
      </View>

      <View style={styles.secondaryRow}>
        {secondary.map((a) => (
          <Pressable
            key={a.key}
            onPress={() => router.push(a.href)}
            style={({ pressed }) => [styles.secondaryCard, pressed && { opacity: 0.85 }]}
            accessibilityRole="button"
            accessibilityLabel={a.label}>
            <View style={[styles.secondaryIcon, { backgroundColor: a.bg }]}>{a.icon}</View>
            <AppText size="small" weight="semibold" color="text">
              {a.label}
            </AppText>
          </Pressable>
        ))}
      </View>
    </Screen>
  );
}

export default function MenuScreen() {
  const router = useRouter();
  const { isGroundEleveur, hasPermission } = useFarmProfile();

  if (isGroundEleveur) {
    return <GroundHome />;
  }

  const items = [
    { key: 'profil', label: 'Profil', sub: 'Compte & paramètres', icon: <User size={24} color={color.brand[600]} />, bg: color.brand[50], fg: color.brand[600], href: '/reglages' },
    { key: 'activites', label: 'Activités', sub: 'Journal & opérations', icon: <Activity size={24} color={color.brand[600]} />, bg: color.brand[50], fg: color.brand[600], href: '/activites' },
    { key: 'marche', label: 'Marché', sub: 'Vitrine clients (bientôt)', icon: <Store size={24} color={color.green[600]} />, bg: color.green[50], fg: color.green[600], href: '/marche' },
    { key: 'sanitaire', label: 'Sanitaire', sub: 'Protocoles & soins', icon: <Stethoscope size={24} color={color.brand[600]} />, bg: color.brand[50], fg: color.brand[600], href: '/sanitary' },
    { key: 'stock', label: 'Stock & provendes', sub: 'Inventaire, pertes, mouvements', icon: <Wheat size={24} color={color.amber[600]} />, bg: color.amber[50], fg: color.amber[600], href: '/provende' },
    { key: 'abattage', label: 'Abattage', sub: 'Ordres & passeport', icon: <Bird size={24} color={color.brand[600]} />, bg: color.brand[50], fg: color.brand[600], href: '/slaughter' },
    { key: 'caisse', label: 'Caisse', sub: 'Ouverture, encaisses & reçus', icon: <Coins size={24} color={color.green[600]} />, bg: color.green[50], fg: color.green[600], href: '/pos?tab=CAISSE' },
    { key: 'commandes', label: 'Commandes', sub: 'Bons & précommandes', icon: <ClipboardList size={24} color={color.accent[600]} />, bg: color.accent[50], fg: color.accent[600], href: '/commandes' },
    { key: 'equipe', label: 'Équipe', sub: 'Équipe, rôles, droits & tâches', icon: <Users size={24} color={color.brand[600]} />, bg: color.brand[50], fg: color.brand[600], href: '/equipe' },
    { key: 'pointsvente', label: 'Points de vente', sub: 'Ferme & points de vente', icon: <MapPin size={24} color={color.brand[600]} />, bg: color.brand[50], fg: color.brand[600], href: '/points-vente' },
    { key: 'clients', label: 'Clients', sub: 'Profils, soldes', icon: <Handshake size={24} color={color.accent[600]} />, bg: color.accent[50], fg: color.accent[600], href: '/clients' },
    { key: 'rapports', label: 'Rentabilité', sub: 'P&L & exports PDF', icon: <FileBarChart2 size={24} color={color.green[600]} />, bg: color.green[50], fg: color.green[600], href: '/rapports' },
    ...(hasPermission('compta:rapports')
      ? ([{ key: 'comptabilite', label: 'Comptabilité', sub: 'Journal SYSCOHADA, bilan & régularisations', icon: <Landmark size={24} color={color.brand[600]} />, bg: color.brand[50], fg: color.brand[600], href: '/comptabilite' }] as GridItem[])
      : []),
    ...(hasPermission('compta:depense')
      ? ([{ key: 'depenses', label: 'Dépenses', sub: 'Charges & écritures par poste', icon: <ReceiptText size={24} color={color.red[600]} />, bg: color.red[50], fg: color.red[600], href: '/depenses' }] as GridItem[])
      : []),
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
  groundHeader: {
    paddingHorizontal: 4,
    marginBottom: 16,
  },
  groundGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 10,
  },
  groundCard: {
    width: '48%',
    flexGrow: 1,
    minWidth: 150,
    alignItems: 'flex-start',
    gap: 6,
    backgroundColor: palette.surface,
    borderRadius: radii.lg,
    borderWidth: 1,
    borderColor: palette.border,
    padding: 16,
  },
  groundIcon: {
    width: 52,
    height: 52,
    borderRadius: 16,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 4,
  },
  secondaryRow: {
    flexDirection: 'row',
    gap: 10,
    marginTop: 12,
  },
  secondaryCard: {
    flex: 1,
    alignItems: 'center',
    gap: 6,
    backgroundColor: palette.surface,
    borderRadius: radii.lg,
    borderWidth: 1,
    borderColor: palette.border,
    paddingVertical: 12,
  },
  secondaryIcon: {
    width: 36,
    height: 36,
    borderRadius: 11,
    alignItems: 'center',
    justifyContent: 'center',
  },
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
