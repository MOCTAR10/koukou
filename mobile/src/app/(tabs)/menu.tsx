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
  ChevronRight,
  Coins,
  FileBarChart2,
  HandCoins,
  Handshake,
  Landmark,
  ListTodo,
  MapPin,
  ReceiptText,
  Settings,
  Sprout,
  Stethoscope,
  Store,
  Tractor,
  Drumstick,
  User,
  Users,
  Wheat,
} from 'lucide-react-native';

import { Screen } from '@/components/ui/Screen';
import { AppText } from '@/components/ui/AppText';
import { SectionHeader } from '@/components/ui/SectionHeader';
import { color, layout, palette, radii, semantic } from '@/constants/theme';
import { useAuth } from '@/auth/AuthContext';
import { useFarmProfile } from '@/hooks/useFarmProfile';
import { useQuickCapture } from '@/components/capture/QuickCaptureProvider';
import { dismissRejected, useOfflineQueue, type RejectedOp } from '@/offline';
import { farmRoleLabel } from '@/api/roles';
import type { PermissionCode } from '@/api/types';

interface MenuItem {
  key: string;
  label: string;
  icon: LucideIcon;
  href: Href;
  /** Droits (au moins un) requis pour afficher la tuile ; absent = visible par tous. */
  perms?: PermissionCode[];
}

interface MenuGroup {
  key: string;
  title: string;
  subtitle: string;
  icon: LucideIcon;
  /** One tint per section: icons read as a family, colour = domain. */
  iconColor: string;
  iconBg: string;
  items: MenuItem[];
}

const ADMIN_TINT = { iconColor: palette.ink[600], iconBg: semantic.surfaceAlt };

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
    { key: 'profil', label: 'Mon profil', icon: User, href: '/reglages' },
    { key: 'lots', label: 'Mes lots', icon: Bird, href: '/lots' },
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
          <MenuTile key={item.key} item={item} tint={semantic.primary} soft={semantic.primarySoft} onPress={() => router.push(item.href)} />
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
      iconColor: semantic.primary,
      iconBg: semantic.primarySoft,
      items: [
        { key: 'activites', label: 'Activités', icon: Activity, href: '/activites' },
        { key: 'sanitaire', label: 'Sanitaire', icon: Stethoscope, href: '/sanitary', perms: ['sanitaire:lecture'] },
        { key: 'stock', label: 'Stock & provendes', icon: Wheat, href: '/provende', perms: ['stock:gerer'] },
        { key: 'abattage', label: 'Abattage', icon: Drumstick, href: '/slaughter', perms: ['production:abattage'] },
      ],
    },
    {
      key: 'agriculture',
      title: 'Agriculture',
      subtitle: 'Parcelles, récoltes & terres',
      icon: Sprout,
      iconColor: palette.green[700],
      iconBg: semantic.successSoft,
      items: [
        { key: 'parcelles', label: 'Parcelles', icon: Sprout, href: '/parcelles' },
        { key: 'recoltes', label: 'Récoltes', icon: Tractor, href: '/recoltes' },
      ],
    },
    {
      key: 'comptoir',
      title: 'Comptoir',
      subtitle: 'Caisse, ventes, clients & points de vente',
      icon: HandCoins,
      iconColor: palette.accent[700],
      iconBg: semantic.accentSoft,
      items: [
        { key: 'caisse', label: 'Caisse', icon: Coins, href: '/pos?tab=CAISSE', perms: ['caisse:lire'] },
        { key: 'commandes', label: 'Commandes', icon: ClipboardList, href: '/commandes', perms: ['vente:commande'] },
        { key: 'clients', label: 'Clients', icon: Handshake, href: '/clients', perms: ['compta:client'] },
        { key: 'pointsvente', label: 'Points de vente', icon: MapPin, href: '/points-vente', perms: ['pdv:gerer'] },
        { key: 'marche', label: 'Marché', icon: Store, href: '/marche', perms: ['vente:creer'] },
      ],
    },
    {
      key: 'finances',
      title: 'Finances',
      subtitle: 'Rentabilité, écritures & bilans',
      icon: FileBarChart2,
      iconColor: palette.amber[700],
      iconBg: semantic.warnSoft,
      items: [
        { key: 'rapports', label: 'Rentabilité', icon: FileBarChart2, href: '/rapports', perms: ['compta:rapports'] },
        { key: 'comptabilite', label: 'Comptabilité SYSCOHADA', icon: Landmark, href: '/comptabilite', perms: ['compta:rapports'] },
        { key: 'depenses', label: 'Dépenses', icon: ReceiptText, href: '/depenses', perms: ['compta:depense'] },
      ],
    },
    {
      key: 'administration',
      title: 'Administration',
      subtitle: 'Équipe, profil & paramètres',
      icon: Settings,
      ...ADMIN_TINT,
      items: [
        { key: 'equipe', label: 'Équipe', icon: Users, href: '/equipe', perms: ['equipe:gerer'] },
        { key: 'rh', label: 'Dossiers RH', icon: Briefcase, href: '/rh', perms: ['rh:lire', 'equipe:gerer'] },
        { key: 'profil', label: 'Profil', icon: User, href: '/reglages' },
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
  const farm = farms.find((f) => f.id === farmId) ?? farms[0];

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
          <Pressable
            onPress={() => void offline.flush()}
            disabled={offline.syncing}
            accessibilityRole="button"
            accessibilityLabel={`${pending} opérations en attente, synchroniser maintenant`}
            style={[styles.metaChip, styles.syncChip]}>
            <AppText size="small" weight="semibold" color="warn">
              {offline.syncing ? 'Synchronisation…' : `${pending} en attente · Synchroniser`}
            </AppText>
          </Pressable>
        ) : null}
      </View>
      {offline.rejected.length > 0 ? (
        <View style={styles.rejectedBox}>
          <AppText size="small" weight="semibold" color="danger">
            {offline.rejected.length} encaissement(s) refusé(s) par le serveur
          </AppText>
          <AppText size="small" color="muted">
            L’argent a été encaissé mais l’opération n’a pas pu être enregistrée. Ressaisissez-la puis effacez la ligne.
          </AppText>
          {offline.rejected.map((op) => (
            <View key={op.id} style={styles.rejectedRow}>
              <AppText size="small" color="text" style={styles.rejectedText}>
                {op.createdAt.slice(0, 16).replace('T', ' ')} · {rejectedAmountLabel(op)} — {op.reason}
              </AppText>
              <Pressable
                onPress={() => dismissRejected(op.id)}
                accessibilityRole="button"
                accessibilityLabel="Effacer cette opération refusée">
                <AppText size="small" weight="semibold" color="brand">
                  Effacer
                </AppText>
              </Pressable>
            </View>
          ))}
        </View>
      ) : null}
    </View>
  );
}

/** Amount collected by a rejected cash op, for display. */
function rejectedAmountLabel(op: RejectedOp): string {
  const p = op.payload as {
    amountFcfa?: number;
    payments?: { amountFcfa: number }[];
    deposit?: { amountFcfa: number };
  };
  const amount =
    p.amountFcfa ??
    p.deposit?.amountFcfa ??
    (p.payments ?? []).reduce((s, x) => s + x.amountFcfa, 0);
  return `${amount.toLocaleString('fr-FR')} FCFA`;
}

/** Une catégorie du menu : titre + grille de tuiles. */
function MenuSection({ group, onPick }: { group: MenuGroup; onPick: (href: Href) => void }) {
  return (
    <View style={styles.section}>
      <SectionHeader title={group.title} subtitle={group.subtitle} icon={group.icon} iconColor={group.iconColor} iconBg={group.iconBg} />
      <View style={styles.grid}>
        {group.items.map((item) => (
          <MenuTile key={item.key} item={item} tint={group.iconColor} soft={group.iconBg} onPress={() => onPick(item.href)} />
        ))}
      </View>
    </View>
  );
}

/** Tuile « tuile colorée + libellé » : grille de navigation des écrans pro. */
function MenuTile({ item, tint, soft, onPress }: { item: MenuItem; tint: string; soft: string; onPress: () => void }) {
  const Icon = item.icon;
  return (
    <Pressable
      onPress={onPress}
      style={({ pressed }) => [styles.tile, pressed && styles.tilePressed]}
      accessibilityRole="menuitem"
      accessibilityLabel={item.label}>
      <View style={[styles.tileIcon, { backgroundColor: soft }]}>
        <Icon size={ICON - 2} color={tint} strokeWidth={2} />
      </View>
      <View style={styles.tileCol}>
        <AppText size="bodyM" weight="semibold" color="text" numberOfLines={2}>
          {item.label}
        </AppText>
      </View>
      <ChevronRight size={16} color={palette.ink[300]} />
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
    backgroundColor: semantic.surface,
    borderWidth: 1,
    borderColor: semantic.border,
    borderRadius: radii.pill,
    paddingHorizontal: 10,
    paddingVertical: 5,
  },
  metaChipText: {
    flexShrink: 1,
  },
  syncChip: {
    backgroundColor: semantic.warnSoft,
    borderColor: palette.amber[200],
  },
  rejectedBox: {
    marginTop: 10,
    padding: 10,
    gap: 6,
    borderRadius: radii.md,
    backgroundColor: semantic.dangerSoft,
  },
  rejectedRow: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 8,
  },
  rejectedText: {
    flex: 1,
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
    backgroundColor: semantic.surface,
    borderRadius: radii.lg,
    borderWidth: 1,
    borderColor: semantic.border,
    paddingVertical: 12,
    paddingLeft: 12,
    paddingRight: 8,
  },
  tilePressed: {
    backgroundColor: semantic.surfaceAlt,
  },
  tileCol: {
    flex: 1,
    gap: 1,
  },
  tileIcon: {
    width: 40,
    height: 40,
    borderRadius: radii.md,
    alignItems: 'center',
    justifyContent: 'center',
  },
});