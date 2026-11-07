import React, { useState } from 'react';
import { Pressable, StyleSheet, View } from 'react-native';
import { useRouter, type Href } from 'expo-router';
import type { LucideIcon } from 'lucide-react-native';
import {
  Activity,
  Bell,
  Bird,
  BookOpen,
  Briefcase,
  ClipboardCheck,
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
  Stethoscope,
  Store,
  Drumstick,
  Truck,
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
import { confirmRejectedGps, dismissRejected, GPS_OUTSIDE_PROVINCE, useOfflineQueue, type RejectedOp } from '@/offline';
import { OutsideProvinceSheet } from '@/components/farm/OutsideProvinceSheet';
import { HeldCashNotice } from '@/components/HeldCashNotice';
import { farmRoleLabel } from '@/api/roles';
import type { PermissionCode } from '@/api/types';
// ── POUFA field work (M2) ──
import { useProgrammeAccess } from '@/hooks/useProgrammeAccess';
import { hasInbox, readsProgrammeDomain } from '@/poufa/access';
import { readsVisits } from '@/poufa/visits';
// POUFA lot A droits: Fermia tiles follow the matrix grants; the DGE synthesis tile.
import { menuItemVisible, readsEconomieSynthesis, type FermiaArea, type ProgrammeBonusArea } from '@/poufa/fermia-access';

/** Deliveries tile: farm accounts, or an institution whose matrix reads INTRANTS. */
function usePoufaMenuItems(): { deliveries: MenuItem[]; visits: MenuItem[]; inbox: MenuItem[]; synthesis: MenuItem[] } {
  const { user } = useAuth();
  const access = useProgrammeAccess();
  const deliveries: MenuItem[] = readsProgrammeDomain(user.role, access.matrix, 'INTRANTS')
    ? [{ key: 'livraisons', label: 'Livraisons d’intrants', icon: Truck, href: '/livraisons' as Href }]
    : [];
  // Technical visits and biosecurity (CDC n° 27, n° 45): the farm's accounts, or TECHNIQUE/SANITAIRE in consultation.
  const visits: MenuItem[] = readsVisits(user.role, access.matrix)
    ? [{ key: 'visites', label: 'Visites techniques', icon: ClipboardCheck, href: '/visites' as Href }]
    : [];
  const inbox: MenuItem[] = hasInbox(user.role)
    ? [{ key: 'notifications', label: 'Notifications', icon: Bell, href: '/notifications' as Href }]
    : [];
  const synthesis: MenuItem[] = readsEconomieSynthesis(user.role, access.matrix)
    ? [{ key: 'synthese', label: 'Synthèse du programme', icon: Landmark, href: '/synthese' as Href }]
    : [];
  return { deliveries, visits, inbox, synthesis };
}
// ── end POUFA ──

interface MenuItem {
  key: string;
  label: string;
  icon: LucideIcon;
  href: Href;
  /** Droits (au moins un) requis pour afficher la tuile ; absent = visible par tous. */
  perms?: PermissionCode[];
  /** Fermia area: an institution sees the tile with the area's read code (POUFA lot A droits). */
  fermiaArea?: FermiaArea;
  /** Programme domain of a bonus screen: an institution sees it with `<domain>:CONSULTER` (POUFA lot A2 dge). */
  programmeArea?: ProgrammeBonusArea;
  /** Veterinary tile: an institution sees it with SANITAIRE:VALIDER (declaration review). */
  vetReview?: boolean;
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

  const poufa = usePoufaMenuItems();
  const links: MenuItem[] = [
    { key: 'profil', label: 'Mon profil', icon: User, href: '/reglages' },
    { key: 'lots', label: 'Mes lots', icon: Bird, href: '/lots' },
    ...poufa.deliveries,
    ...poufa.visits,
    ...poufa.inbox,
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
  const { user } = useAuth();
  const { isGroundEleveur, hasPermission } = useFarmProfile();
  const poufa = usePoufaMenuItems();
  // POUFA lot A2 dge: the institution's matrix opens the stock, slaughter and sanitary tiles.
  const programmeMatrix = useProgrammeAccess().matrix;

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
        { key: 'sanitaire', label: 'Sanitaire', icon: Stethoscope, href: '/sanitary', perms: ['sanitaire:lecture'], programmeArea: 'SANITAIRE' },
        { key: 'declarations', label: 'Déclarations', icon: ClipboardCheck, href: '/declarations', vetReview: true },
        { key: 'stock', label: 'Stock & provendes', icon: Wheat, href: '/provende', perms: ['stock:gerer'], programmeArea: 'INTRANTS' },
        { key: 'abattage', label: 'Abattage', icon: Drumstick, href: '/slaughter', perms: ['production:abattage'], programmeArea: 'TRACABILITE' },
        ...poufa.deliveries,
        ...poufa.visits,
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
        { key: 'caisse', label: 'Caisse', icon: Coins, href: '/pos?tab=CAISSE', perms: ['caisse:lire'], fermiaArea: 'VENTES' },
        { key: 'commandes', label: 'Commandes', icon: ClipboardList, href: '/commandes', perms: ['vente:commande'], fermiaArea: 'VENTES' },
        { key: 'clients', label: 'Clients', icon: Handshake, href: '/clients', perms: ['compta:client'], fermiaArea: 'VENTES' },
        { key: 'pointsvente', label: 'Points de vente', icon: MapPin, href: '/points-vente', perms: ['pdv:gerer'], fermiaArea: 'VENTES' },
        { key: 'marche', label: 'Marché', icon: Store, href: '/marche', perms: ['market:publier', 'vente:commande'], fermiaArea: 'MARCHE' },
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
        { key: 'rapports', label: 'Rentabilité', icon: FileBarChart2, href: '/rapports', perms: ['compta:rapports'], fermiaArea: 'ECONOMIQUE' },
        { key: 'comptabilite', label: 'Comptabilité SYSCOHADA', icon: Landmark, href: '/comptabilite', perms: ['compta:rapports'], fermiaArea: 'COMPTABILITE' },
        { key: 'depenses', label: 'Dépenses', icon: ReceiptText, href: '/depenses', perms: ['compta:depense'], fermiaArea: 'ECONOMIQUE' },
        ...poufa.synthesis,
      ],
    },
    {
      key: 'administration',
      title: 'Administration',
      subtitle: 'Équipe, profil & paramètres',
      icon: Settings,
      ...ADMIN_TINT,
      items: [
        { key: 'equipe', label: 'Équipe', icon: Users, href: '/equipe', perms: ['equipe:gerer'], fermiaArea: 'EQUIPE' },
        { key: 'rh', label: 'Dossiers RH', icon: Briefcase, href: '/rh', perms: ['rh:lire', 'equipe:gerer'], fermiaArea: 'EQUIPE' },
        { key: 'profil', label: 'Profil', icon: User, href: '/reglages' },
        ...poufa.inbox,
      ],
    },
  ];

  // Ne montrer que les tuiles autorisées ; masquer une section devenue vide.
  const visibleGroups = groups
    .map((group) => ({
      ...group,
      items: group.items.filter(
        (item) => menuItemVisible(user.role, item, (code) => hasPermission(code as PermissionCode), programmeMatrix),
      ),
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
  const [confirmGps, setConfirmGps] = useState<RejectedOp | null>(null);
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
      <HeldCashNotice farmId={farmId} />
      {offline.rejected.length > 0 ? (
        <View style={styles.rejectedBox}>
          <AppText size="small" weight="semibold" color="danger">
            {offline.rejected.length} opération(s) refusée(s) par le serveur
          </AppText>
          <AppText size="small" color="muted">
            Elles n’ont pas pu être enregistrées (l’argent éventuel a bien été encaissé). Ressaisissez-les puis effacez la ligne.
          </AppText>
          {offline.rejected.map((op) => (
            <View key={op.id} style={styles.rejectedRow}>
              <AppText size="small" color="text" style={styles.rejectedText}>
                {op.createdAt.slice(0, 16).replace('T', ' ')} · {rejectedLabel(op)} — {op.reason}
              </AppText>
              {op.kind === 'farm-gps' && op.code === GPS_OUTSIDE_PROVINCE ? (
                <Pressable
                  onPress={() => setConfirmGps(op)}
                  accessibilityRole="button"
                  accessibilityLabel="Confirmer ce point hors province avec un motif">
                  <AppText size="small" weight="semibold" color="warn">
                    Confirmer
                  </AppText>
                </Pressable>
              ) : null}
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
          <OutsideProvinceSheet
            visible={confirmGps != null}
            message={confirmGps?.reason ?? ''}
            onCancel={() => setConfirmGps(null)}
            onConfirm={(reason) => {
              if (confirmGps) confirmRejectedGps(confirmGps.id, reason);
              setConfirmGps(null);
            }}
          />
        </View>
      ) : null}
    </View>
  );
}

const REJECTED_KIND_LABEL: Partial<Record<RejectedOp['kind'], string>> = {
  'daily-entry': 'Saisie du jour',
  sale: 'Vente',
  'feed-input': 'Entrée de stock',
  'stock-loss': 'Perte de stock',
  'order-create': 'Commande',
  'order-payment': 'Acompte',
  'customer-payment': 'Encaissement client',
  'pdv-create': 'Point de vente',
  'stock-transfer-create': 'Transfert',
  // POUFA field work (M2)
  'health-event': 'Déclaration sanitaire',
  'delivery-confirm': 'Confirmation de livraison',
  sortie: 'Sortie de bande',
  'farm-gps': 'Position GPS de la ferme',
  // POUFA lot A sante
  treatment: 'Traitement',
  'prophylaxis-complete': 'Soin réalisé',
  'farm-visit': 'Visite technique',
};

/** Kind of a rejected op, plus the amount collected if any, for display. */
function rejectedLabel(op: RejectedOp): string {
  const kind = REJECTED_KIND_LABEL[op.kind] ?? 'Opération';
  const amount = rejectedAmount(op);
  return amount > 0 ? `${kind} · ${amount.toLocaleString('fr-FR')} FCFA` : kind;
}

/** Amount collected by a rejected cash op (0 when none). */
function rejectedAmount(op: RejectedOp): number {
  const p = op.payload as {
    amountFcfa?: number;
    payments?: { amountFcfa: number }[];
    deposit?: { amountFcfa: number };
  };
  return (
    p.amountFcfa ??
    p.deposit?.amountFcfa ??
    (p.payments ?? []).reduce((s, x) => s + x.amountFcfa, 0)
  );
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