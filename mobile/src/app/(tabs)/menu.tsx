import React from 'react';
import { Pressable, StyleSheet, View } from 'react-native';
import { useRouter, type Href } from 'expo-router';
import type { LucideIcon } from 'lucide-react-native';
import {
  Activity,
  Bird,
  BookOpen,
  Briefcase,
  ClipboardList,
  Coins,
  FileBarChart2,
  HandCoins,
  Handshake,
  Landmark,
  ListTodo,
  MapPin,
  ReceiptText,
  Settings,
  Stethoscope,
  Store,
  User,
  Users,
  Wheat,
} from 'lucide-react-native';

import { Screen } from '@/components/ui/Screen';
import { AppText } from '@/components/ui/AppText';
import { SectionHeader } from '@/components/ui/SectionHeader';
import { color, layout, palette, radii } from '@/constants/theme';
import { useAuth } from '@/auth/AuthContext';
import { useFarmProfile } from '@/hooks/useFarmProfile';
import { useQuickCapture } from '@/components/capture/QuickCaptureProvider';
import { useOfflineQueue } from '@/offline';
import { farmRoleLabel } from '@/api/roles';
import type { PermissionCode } from '@/api/types';

interface MenuItem {
  key: string;
  label: string;
  icon: React.ReactNode;
  bg: string;
  href: Href;
  /** Droits (au moins un) requis pour afficher la tuile ; absent = visible par tous. */
  perms?: PermissionCode[];
}

interface MenuGroup {
  key: string;
  title: string;
  subtitle: string;
  icon: LucideIcon;
  iconColor: string;
  iconBg: string;
  items: MenuItem[];
}

const ICON = 24;

function GroundHome() {
  const router = useRouter();
  const { openDaily, openSale } = useQuickCapture();

  const primary = [
    {
      key: 'daily',
      label: 'Saisie du jour',
      sub: 'Morts, aliments, eau, poids',
      icon: <BookOpen size={26} color={color.green[600]} />,
      bg: color.green[50],
      onPress: () => openDaily(),
    },
    {
      key: 'tasks',
      label: 'Mes tâches',
      sub: 'Travail assigné de l’équipe',
      icon: <ListTodo size={26} color={color.amber[600]} />,
      bg: color.amber[50],
      onPress: () => router.push('/tasks'),
    },
    {
      key: 'sell',
      label: 'Vendre',
      sub: 'POS espèces — encaisser',
      icon: <HandCoins size={26} color={color.accent[600]} />,
      bg: color.accent[50],
      onPress: () => openSale(),
    },
  ];

  const links: MenuItem[] = [
    {
      key: 'profil',
      label: 'Mon profil',
      icon: <User size={ICON} color={color.brand[600]} />,
      bg: color.brand[50],
      href: '/reglages',
    },
    {
      key: 'lots',
      label: 'Mes lots',
      icon: <Bird size={ICON} color={color.brand[600]} />,
      bg: color.brand[50],
      href: '/lots',
    },
  ];

  return (
    // Même bas d'écran qu'Accueil : `Screen` gère le défilement et réserve le
    // padding sous la dernière ligne, donc rien ne passe derrière la barre.
    <Screen bottomPad={layout.bottomPad}>
      <MenuHeader eyebrow="TERRAIN" title="Mon terrain" subtitle="Saisie du jour, vos tâches et les ventes au comptoir." />

      <View style={styles.grid}>
        {primary.map((a) => (
          <Pressable
            key={a.key}
            onPress={a.onPress}
            style={({ pressed }) => [styles.tile, pressed && styles.tilePressed]}
            accessibilityRole="button"
            accessibilityLabel={a.label}>
            <View style={[styles.tileIcon, { backgroundColor: a.bg }]}>{a.icon}</View>
            <View style={styles.tileCol}>
              <AppText size="bodyM" weight="semibold" color="text" numberOfLines={2}>
                {a.label}
              </AppText>
              <AppText size="small" color="muted" numberOfLines={2}>
                {a.sub}
              </AppText>
            </View>
          </Pressable>
        ))}
      </View>

      <SectionHeader title="Comptes & suivi" subtitle="Profil et bandes en cours" icon={Settings} />
      <View style={styles.grid}>
        {links.map((item) => (
          <MenuTile key={item.key} item={item} onPress={() => router.push(item.href)} />
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

  const groups: MenuGroup[] = [
    {
      key: 'elevage',
      title: 'Élevage',
      subtitle: 'Suivi sanitaire, soins & stocks',
      icon: Activity,
      iconColor: palette.brand[600],
      iconBg: palette.brand[50],
      items: [
        { key: 'activites', label: 'Activités', icon: <Activity size={ICON} color={color.brand[600]} />, bg: color.brand[50], href: '/activites' },
        { key: 'sanitaire', label: 'Sanitaire', icon: <Stethoscope size={ICON} color={color.brand[600]} />, bg: color.brand[50], href: '/sanitary', perms: ['sanitaire:lecture'] },
        { key: 'stock', label: 'Stock & provendes', icon: <Wheat size={ICON} color={color.amber[600]} />, bg: color.amber[50], href: '/provende', perms: ['stock:gerer'] },
        { key: 'abattage', label: 'Abattage', icon: <Bird size={ICON} color={color.brand[600]} />, bg: color.brand[50], href: '/slaughter', perms: ['production:abattage'] },
      ],
    },
    {
      key: 'comptoir',
      title: 'Comptoir',
      subtitle: 'Caisse, ventes, clients & points de vente',
      icon: HandCoins,
      iconColor: palette.accent[500],
      iconBg: palette.accent[50],
      items: [
        { key: 'caisse', label: 'Caisse', icon: <Coins size={ICON} color={color.green[600]} />, bg: color.green[50], href: '/pos?tab=CAISSE', perms: ['caisse:lire'] },
        { key: 'commandes', label: 'Commandes', icon: <ClipboardList size={ICON} color={color.accent[600]} />, bg: color.accent[50], href: '/commandes', perms: ['vente:commande'] },
        { key: 'clients', label: 'Clients', icon: <Handshake size={ICON} color={color.accent[600]} />, bg: color.accent[50], href: '/clients', perms: ['compta:client'] },
        { key: 'pointsvente', label: 'Points de vente', icon: <MapPin size={ICON} color={color.brand[600]} />, bg: color.brand[50], href: '/points-vente', perms: ['pdv:gerer'] },
        { key: 'marche', label: 'Marché', icon: <Store size={ICON} color={color.green[600]} />, bg: color.green[50], href: '/marche', perms: ['vente:creer'] },
      ],
    },
    {
      key: 'finances',
      title: 'Finances',
      subtitle: 'Rentabilité, écritures & bilans',
      icon: FileBarChart2,
      iconColor: palette.green[600],
      iconBg: palette.green[50],
      items: [
        { key: 'rapports', label: 'Rentabilité', icon: <FileBarChart2 size={ICON} color={color.green[600]} />, bg: color.green[50], href: '/rapports', perms: ['compta:rapports'] },
        { key: 'comptabilite', label: 'Comptabilité SYSCOHADA', icon: <Landmark size={ICON} color={color.brand[600]} />, bg: color.brand[50], href: '/comptabilite', perms: ['compta:rapports'] },
        { key: 'depenses', label: 'Dépenses', icon: <ReceiptText size={ICON} color={color.red[600]} />, bg: color.red[50], href: '/depenses', perms: ['compta:depense'] },
      ],
    },
    {
      key: 'administration',
      title: 'Administration',
      subtitle: 'Équipe, profil & paramètres',
      icon: Settings,
      iconColor: palette.brand[600],
      iconBg: palette.brand[50],
      items: [
        { key: 'equipe', label: 'Équipe', icon: <Users size={ICON} color={color.brand[600]} />, bg: color.brand[50], href: '/equipe', perms: ['equipe:gerer'] },
        { key: 'rh', label: 'Dossiers RH', icon: <Briefcase size={ICON} color={color.brand[600]} />, bg: color.brand[50], href: '/rh', perms: ['rh:lire', 'equipe:gerer'] },
        { key: 'profil', label: 'Profil', icon: <User size={ICON} color={color.brand[600]} />, bg: color.brand[50], href: '/reglages' },
      ],
    },
  ];

  // Ne montrer que les tuiles autorisées ; masquer une section devenue vide.
  const visibleGroups = groups
    .map((group) => ({
      ...group,
      items: group.items.filter((item) => !item.perms || item.perms.some((code) => hasPermission(code))),
    }))
    .filter((group) => group.items.length > 0);

  return (
    // Bas d'écran calé sur la barre d'onglets : pas de vide superflu à la fin.
    <Screen bottomPad={layout.bottomPad}>
      <MenuHeader eyebrow="MENU" title="Votre ferme" subtitle="Tous les outils, classés par activité." />
      {visibleGroups.map((group) => (
        <MenuSection key={group.key} group={group} onPick={(href) => router.push(href)} />
      ))}
    </Screen>
  );
}

/** En-tête de la page : contexte ferme, rôle et état de synchronisation. */
function MenuHeader({ eyebrow, title, subtitle }: { eyebrow: string; title: string; subtitle: string }) {
  const { farms, farmId } = useAuth();
  const profileHook = useFarmProfile();
  const offline = useOfflineQueue(farmId);
  const pending = offline.pending.length;
  const farm = farms[0];

  return (
    <View style={styles.header}>
      <AppText size="label" color="brand">
        {eyebrow}
      </AppText>
      <AppText size="h2" weight="bold" color="text" style={styles.headerTitle}>
        {title}
      </AppText>
      <AppText size="caption" color="muted">
        {subtitle}
      </AppText>
      <View style={styles.metaRow}>
        {farm ? (
          <View style={styles.metaChip}>
            <MapPin size={12} color={palette.ink[400]} />
            <AppText size="small" color="muted" numberOfLines={1} style={styles.metaChipText}>
              {farm.name} · {farm.administrativeCity}
            </AppText>
          </View>
        ) : null}
        <View style={styles.metaChip}>
          <AppText size="small" weight="semibold" color="brand">
            {farmRoleLabel(profileHook.farmRole)}
          </AppText>
        </View>
        {pending > 0 ? (
          <View style={[styles.metaChip, styles.syncChip]}>
            <AppText size="small" weight="semibold" color="warn">
              {pending} en attente
            </AppText>
          </View>
        ) : null}
      </View>
    </View>
  );
}

/** Une catégorie du menu : titre + grille de tuiles. */
function MenuSection({ group, onPick }: { group: MenuGroup; onPick: (href: Href) => void }) {
  return (
    <View style={styles.section}>
      <SectionHeader title={group.title} subtitle={group.subtitle} icon={group.icon} iconColor={group.iconColor} iconBg={group.iconBg} />
      <View style={styles.grid}>
        {group.items.map((item) => (
          <MenuTile key={item.key} item={item} onPress={() => onPick(item.href)} />
        ))}
      </View>
    </View>
  );
}

/** Tuile « tuile colorée + libellé » : grille de navigation des écrans pro. */
function MenuTile({ item, onPress }: { item: MenuItem; onPress: () => void }) {
  return (
    <Pressable
      onPress={onPress}
      style={({ pressed }) => [styles.tile, pressed && styles.tilePressed]}
      accessibilityRole="menuitem"
      accessibilityLabel={item.label}>
      <View style={[styles.tileIcon, { backgroundColor: item.bg }]}>{item.icon}</View>
      <View style={styles.tileCol}>
        <AppText size="bodyM" weight="semibold" color="text" numberOfLines={2}>
          {item.label}
        </AppText>
      </View>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  header: {
    paddingHorizontal: 4,
    paddingTop: 4,
    marginBottom: 6,
  },
  headerTitle: {
    marginTop: 2,
  },
  metaRow: {
    flexDirection: 'row',
    alignItems: 'center',
    flexWrap: 'wrap',
    gap: 8,
    marginTop: 12,
  },
  metaChip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
    backgroundColor: palette.surface,
    borderWidth: 1,
    borderColor: palette.border,
    borderRadius: radii.pill,
    paddingHorizontal: 10,
    paddingVertical: 5,
  },
  metaChipText: {
    flexShrink: 1,
  },
  syncChip: {
    backgroundColor: palette.amber[50],
    borderColor: palette.amber[200],
  },
  section: {
    marginTop: 4,
  },
  grid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
    marginTop: 4,
  },
  tile: {
    // Icone + libellé sur la même ligne : la carte tombe à ~60px au lieu de
    // ~95px empilées, et le label gagne toute la largeur restante.
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    width: '48%',
    backgroundColor: palette.surface,
    borderRadius: radii.lg,
    borderWidth: 1,
    borderColor: palette.border,
    padding: 10,
  },
  tilePressed: {
    backgroundColor: palette.surfaceAlt,
  },
  tileCol: {
    flex: 1,
    gap: 1,
  },
  tileIcon: {
    width: 40,
    height: 40,
    borderRadius: 13,
    alignItems: 'center',
    justifyContent: 'center',
  },
});