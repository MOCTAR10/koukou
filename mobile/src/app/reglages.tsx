import React, { useEffect, useState } from 'react';
import { Pressable, StyleSheet, View } from 'react-native';
import { useQuery } from '@tanstack/react-query';
import Animated, { useAnimatedStyle, useSharedValue } from 'react-native-reanimated';
import type { LucideIcon } from 'lucide-react-native';
import {
  Building,
  Check,
  ChevronDown,
  Coins,
  Crosshair,
  Crown,
  HandCoins,
  Info,
  Landmark,
  Lock,
  MapPin,
  Phone,
  Scale,
  Settings,
  ShieldCheck,
  SlidersHorizontal,
  Stethoscope,
  User,
  Users,
  Wheat,
} from 'lucide-react-native';

import { Screen, ScreenHeader } from '@/components/ui/Screen';
import { AppText } from '@/components/ui/AppText';
import { Card } from '@/components/ui/Card';
import { Chip } from '@/components/ui/Chip';
import { FarmLogo } from '@/components/ui/FarmLogo';
import { SectionHeader } from '@/components/ui/SectionHeader';
import { Spinner } from '@/components/ui/Spinner';
import { FarmIdentityCard } from '@/components/farm/FarmIdentityCard';
import { useAuth } from '@/auth/AuthContext';
import { useFarmProfile } from '@/hooks/useFarmProfile';
import { fetchReferenceConstants } from '@/api';
import { farmRoleLabel, roleLabel } from '@/api/roles';
import type { ReferenceConstant } from '@/api/types';
import { groupPermissionCodes, permissionLabel } from '@/constants/permissions';
import { durations, enter, staggeredEnter, timed } from '@/constants/motion';
import { color, palette, radii, spacing } from '@/constants/theme';

/** Icône représentative de chaque groupe de droits (miroir `PERMISSION_GROUPS_LOCAL`). */
const GROUP_ICONS: Record<string, LucideIcon> = {
  production: Wheat,
  equipe: Users,
  caisse: Coins,
  ventes: HandCoins,
  compta: Landmark,
  stock: Wheat,
  sanitaire: Stethoscope,
  reglages: Settings,
};

function fmtValue(v: number): string {
  return Number.isInteger(v) ? String(v) : String(v).replace(/\.?0+$/, '');
}

/** Pilule translucide — les tons `Chip` sont clairs et illisibles sur le panneau brand foncé. */
function HeroPill({ label, active = true }: { label: string; active?: boolean }) {
  return (
    <View style={[styles.heroPill, active && styles.heroPillOn]}>
      <AppText size="small" weight="semibold" style={{ color: active ? palette.surface : palette.brand[200] }}>
        {label}
      </AppText>
    </View>
  );
}

/** Ligne « libellé → valeur » : signature visuelle des écrans pro (cf. POS). */
function InfoRow({ icon: Icon, label, value }: { icon: LucideIcon; label: string; value: string }) {
  return (
    <View style={styles.infoRow}>
      <View style={styles.infoIcon}>
        <Icon size={15} color={color.brand[600]} strokeWidth={2.4} />
      </View>
      <AppText size="bodyM" color="muted" style={styles.infoLabel}>
        {label}
      </AppText>
      <AppText size="bodyM" weight="semibold" color="text" numberOfLines={1} style={styles.infoValue}>
        {value}
      </AppText>
    </View>
  );
}

function ConstantRow({ c }: { c: ReferenceConstant }) {
  return (
    <View style={styles.constantRow}>
      <View style={styles.constantMain}>
        <AppText size="bodyM" weight="semibold" color="text" numberOfLines={1}>
          {c.key}
        </AppText>
        {c.description ? (
          <AppText size="caption" color="muted" numberOfLines={2}>
            {c.description}
          </AppText>
        ) : null}
      </View>
      <View style={styles.constantValueWrap}>
        <AppText size="body" weight="bold" color="brand">
          {fmtValue(c.value)}
        </AppText>
      </View>
    </View>
  );
}

export default function ReglagesScreen() {
  const { farms, user } = useAuth();
  const farm = farms[0];
  const profileHook = useFarmProfile();
  const [constantsOpen, setConstantsOpen] = useState(false);

  const constants = useQuery({ queryKey: ['reference-constants'], queryFn: () => fetchReferenceConstants() });

  // Repli des seuils : piloté par un shared value (opacity + rotation) plutôt
  // qu'une animation de layout `entering`/`exiting`, qui pouvait rester bloquée
  // en sous-opacité et donner l'impression que le bloc ne s'ouvrait pas.
  const reveal = useSharedValue(0);
  useEffect(() => {
    reveal.value = timed(constantsOpen ? 1 : 0, { duration: durations.base });
  }, [constantsOpen, reveal]);

  const revealStyle = useAnimatedStyle(() => ({
    opacity: reveal.value,
    transform: [{ translateY: (1 - reveal.value) * -8 }],
  }));

  const chevronStyle = useAnimatedStyle(() => ({
    transform: [{ rotate: `${reveal.value * 180}deg` }],
  }));

  const profile = profileHook.profile;
  const isSuspended = profile?.active === false;
  const hasAllRights = profile?.permissions.includes('*') === true;
  const canSeePermissions =
    profile !== undefined && profileHook.active && (hasAllRights || profile.permissions.length > 0);
  const grantedGroups = groupPermissionCodes(profile?.permissions ?? []);
  const permissionCount = profile?.permissions.length ?? 0;
  const canEditFarm = hasAllRights || profile?.permissions.includes('reglages:ferme') === true;
  const constantsList = constants.data ?? [];

  return (
    <Screen onRefresh={() => { void constants.refetch(); void profileHook.refetch(); }} refreshing={constants.isRefetching}>
      <ScreenHeader title="Réglages de ferme" subtitle={farm?.name ?? 'Ferme'} back right={<Settings size={18} color={color.ink[300]} />} />

      {/* ── Panneau identité ─────────────────────────────────────────────── */}
      <Animated.View style={styles.hero} entering={enter.fadeDown()}>
        <View pointerEvents="none" style={styles.heroGlow} />
        <View style={styles.heroTop}>
          <View style={styles.avatarRing}>
            <FarmLogo farm={farm} size={60} />
          </View>
          <View style={styles.heroIdentity}>
            <AppText size="h2" weight="bold" style={{ color: palette.surface }} numberOfLines={2}>
              {user.fullName || 'Compte Koukou'}
            </AppText>
            <AppText size="caption" style={{ color: palette.brand[200] }} numberOfLines={1}>
              {farmRoleLabel(profile?.role, farm?.name)}
            </AppText>
          </View>
        </View>

        <View style={styles.heroPills}>
          <HeroPill label={isSuspended ? 'Compte inactif' : 'Compte actif'} active={!isSuspended} />
          {profile?.jobTitle ? <HeroPill label={profile.jobTitle} active={false} /> : null}
          {profile?.buildingAssignment ? <HeroPill label={profile.buildingAssignment} active={false} /> : null}
        </View>
      </Animated.View>

      {/* ── Compte ────────────────────────────────────────────────────────── */}
      <Animated.View entering={staggeredEnter(1)}>
        <SectionHeader title="Compte" subtitle="Identité et rattachement" icon={User} />
        <Card tone="default" style={styles.card} padding={false}>
          <InfoRow icon={Phone} label="Téléphone" value={user.phone || '—'} />
          <View style={styles.divider} />
          <InfoRow icon={ShieldCheck} label="Rôle" value={roleLabel(user.role)} />
          {farm ? (
            <>
              <View style={styles.divider} />
              <InfoRow icon={Building} label="Ferme" value={farm.name} />
              <View style={styles.divider} />
              <InfoRow icon={MapPin} label="Commune" value={farm.administrativeCity || 'Non renseignée'} />
            </>
          ) : null}
        </Card>
      </Animated.View>

      {/* ── Droits effectifs ──────────────────────────────────────────────── */}
      {canSeePermissions ? (
        <Animated.View entering={staggeredEnter(2)}>
          <SectionHeader
            title="Mes droits"
            subtitle={hasAllRights ? 'Accès complet à la ferme' : `${permissionCount} droit${permissionCount > 1 ? 's' : ''} sur cette ferme`}
            icon={ShieldCheck}
          />
          {hasAllRights ? (
            <Card tone="default" style={styles.card}>
              <View style={styles.allRights}>
                <View style={styles.crownWrap}>
                  <Crown size={18} color={palette.amber[500]} strokeWidth={2.4} />
                </View>
                <View style={{ flex: 1, gap: 2, minWidth: 0 }}>
                  <AppText size="body" weight="bold" color="text">
                    Accès complet
                  </AppText>
                  <AppText size="caption" color="muted">
                    Propriétaire de la ferme (ou administrateur plateforme) : toutes les sections sont accessibles.
                  </AppText>
                </View>
              </View>
            </Card>
          ) : (
            <View style={{ gap: 8 }}>
              {profile?.role === 'ELEVEUR' ? (
                <Card tone="brand" style={styles.card}>
                  <View style={styles.noteRow}>
                    <Lock size={14} color={color.brand[600]} />
                    <AppText size="caption" color="brand" style={{ flex: 1 }}>
                      Droits fixes de terrain, définis par KouKou. Seuls les droits accordés ci-dessous s’appliquent.
                    </AppText>
                  </View>
                </Card>
              ) : null}

              {grantedGroups.map((group) => {
                const Icon = GROUP_ICONS[group.key] ?? ShieldCheck;
                return (
                  <Card key={group.key} tone="default" style={styles.card}>
                    <View style={styles.grpHead}>
                      <View style={styles.grpIcon}>
                        <Icon size={15} color={color.brand[600]} strokeWidth={2.4} />
                      </View>
                      <AppText size="small" weight="bold" color="text" style={{ flex: 1 }}>
                        {group.label}
                      </AppText>
                      <Chip label={String(group.granted.length)} tone="brand" />
                    </View>
                    <View style={styles.grpChips}>
                      {group.granted.map((item) => (
                        <View key={item.code} style={styles.grantChip}>
                          <Check size={12} color={palette.green[600]} strokeWidth={3} />
                          <AppText size="small" color="text" weight="medium" numberOfLines={1}>
                            {permissionLabel(item.code)}
                          </AppText>
                        </View>
                      ))}
                    </View>
                  </Card>
                );
              })}
            </View>
          )}
        </Animated.View>
      ) : null}

      {/* ── Ferme ─────────────────────────────────────────────────────────── */}
      {farm ? (
        <Animated.View entering={staggeredEnter(3)}>
          <SectionHeader
            title="Ma ferme"
            subtitle={canEditFarm ? 'Nom et logo modifiables' : 'Paramètres appliqués aux calculs'}
            icon={Crosshair}
          />
          <FarmIdentityCard farm={farm} canEdit={canEditFarm} />
        </Animated.View>
      ) : null}

      {/* ── Constantes de référence (repliable) ───────────────────────────── */}
      <Animated.View entering={staggeredEnter(4)}>
        <Pressable
          onPress={() => setConstantsOpen((v) => !v)}
          style={({ pressed }) => [styles.constantsHead, pressed && { opacity: 0.9 }]}
          accessibilityRole="button"
          accessibilityState={{ expanded: constantsOpen }}>
          <View style={styles.constantsHeadMain}>
            <View style={styles.constantsHeadTop}>
              <AppText size="h3" weight="bold" color="text">
                Seuils & repères
              </AppText>
              <View style={styles.constantsToggle}>
                <AppText size="small" weight="semibold" color="brand">
                  {constantsOpen ? 'Réduire' : `Afficher les ${constantsList.length}`}
                </AppText>
                <Animated.View style={chevronStyle}>
                  <ChevronDown size={15} color={color.brand[600]} />
                </Animated.View>
              </View>
            </View>
            <AppText size="caption" color="muted">
              Seuils d’alertes, vide sanitaire et autonomie provende — en vigueur sur cette ferme.
            </AppText>
          </View>
        </Pressable>

        {constants.isLoading ? (
          <View style={{ marginTop: 8 }}>
            <Spinner label="Lecture des constantes…" />
          </View>
        ) : constantsList.length === 0 ? (
          <Card tone="default" style={[styles.card, { marginTop: 8 }]}>
            <AppText size="caption" color="muted">
              Aucune constante disponible.
            </AppText>
          </Card>
        ) : null}

        {constantsOpen && constantsList.length > 0 ? (
          <Animated.View style={[styles.constantsBody, revealStyle]}>
            {constantsList.map((c) => (
              <ConstantRow key={c.key} c={c} />
            ))}
          </Animated.View>
        ) : null}

        <View style={[styles.card, styles.lockNote]}>
          <View style={styles.noteRow}>
            <Lock size={13} color={color.ink[300]} />
            <AppText size="caption" color="faint" style={{ flex: 1 }}>
              Constantes globales — modifiables uniquement par la plateforme (couche administrateur).
            </AppText>
          </View>
        </View>
      </Animated.View>

      {/* ── Périmètre fonctionnel ────────────────────────────────────────── */}
      <Animated.View entering={staggeredEnter(5)}>
        <Card tone="default" style={styles.card}>
          <View style={styles.grpHead}>
            <View style={[styles.grpIcon, { backgroundColor: color.green[50] }]}>
              <Info size={15} color={color.green[600]} strokeWidth={2.4} />
            </View>
            <AppText size="body" weight="semibold" color="text" style={{ flex: 1 }}>
              Ce que pilote l’application
            </AppText>
            <SlidersHorizontal size={16} color={color.ink[300]} />
          </View>
          <AppText size="caption" color="muted">
            Saisie journalière, ventes (POS espèces), soins prophylactiques, stock de provende, abattage et caisse —
            l’advisory s’appuie sur ces seuils pour prioriser vos prochaines actions.
          </AppText>
          <View style={styles.divider} />
          <View style={styles.scopeRow}>
            {['Saisie', 'POS', 'Sanitaire', 'Provende', 'Abattage', 'Caisse'].map((s) => (
              <View key={s} style={styles.scopeChip}>
                <AppText size="small" weight="medium" color="muted">
                  {s}
                </AppText>
              </View>
            ))}
          </View>
          <View style={styles.scaleNote}>
            <Scale size={12} color={color.ink[300]} />
            <AppText size="small" color="faint">
              {constantsList.length} seuils de référence appliqués à l’advisory
            </AppText>
          </View>
        </Card>
      </Animated.View>
    </Screen>
  );
}

const styles = StyleSheet.create({
  /* Panneau identité */
  hero: {
    backgroundColor: palette.brand[800],
    borderRadius: radii.xl,
    padding: spacing.lg,
    gap: spacing.md,
    overflow: 'hidden',
  },
  heroGlow: {
    position: 'absolute',
    top: -70,
    right: -50,
    width: 190,
    height: 190,
    borderRadius: 95,
    backgroundColor: 'rgba(255, 255, 255, 0.06)',
  },
  heroTop: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
  },
  avatarRing: {
    width: 72,
    height: 72,
    borderRadius: 36,
    borderWidth: 2,
    borderColor: 'rgba(255, 255, 255, 0.22)',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: palette.surface,
    overflow: 'hidden',
  },
  heroIdentity: {
    flex: 1,
    minWidth: 0,
    gap: 2,
  },
  heroPills: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 6,
  },
  heroPill: {
    paddingHorizontal: 10,
    paddingVertical: 5,
    borderRadius: radii.pill,
    borderWidth: 1,
    borderColor: 'rgba(255, 255, 255, 0.18)',
  },
  heroPillOn: {
    backgroundColor: 'rgba(255, 255, 255, 0.14)',
  },

  /* Cartes & lignes */
  card: {
    gap: 10,
    padding: 14,
  },
  divider: {
    height: StyleSheet.hairlineWidth,
    backgroundColor: color.border,
  },
  infoRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    paddingHorizontal: 14,
    paddingVertical: 12,
  },
  infoIcon: {
    width: 28,
    height: 28,
    borderRadius: 10,
    backgroundColor: color.brand[50],
    alignItems: 'center',
    justifyContent: 'center',
  },
  infoLabel: {
    flex: 1,
  },
  infoValue: {
    flexShrink: 1,
    textAlign: 'right',
  },

  /* Droits */
  allRights: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
  },
  crownWrap: {
    width: 40,
    height: 40,
    borderRadius: 14,
    backgroundColor: color.amber[50],
    alignItems: 'center',
    justifyContent: 'center',
  },
  grpHead: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 9,
  },
  grpIcon: {
    width: 26,
    height: 26,
    borderRadius: 9,
    backgroundColor: color.brand[50],
    alignItems: 'center',
    justifyContent: 'center',
  },
  grpChips: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 6,
  },
  grantChip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
    paddingHorizontal: 9,
    paddingVertical: 5,
    borderRadius: radii.pill,
    backgroundColor: color.green[50],
  },

  /* Ferme */
  farmHead: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 12,
  },
  farmIcon: {
    width: 42,
    height: 42,
    borderRadius: 14,
    backgroundColor: palette.brand[600],
    alignItems: 'center',
    justifyContent: 'center',
  },
  factRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    marginTop: 8,
  },
  fact: {
    gap: 1,
  },
  factDivider: {
    width: 1,
    alignSelf: 'stretch',
    backgroundColor: color.brand[100],
  },
  factPills: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 6,
    flex: 1,
  },

  /* Constantes */
  constantsHead: {
    marginTop: 10,
    marginBottom: 6,
  },
  constantsHeadMain: {
    gap: 3,
  },
  constantsHeadTop: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
  },
  constantsToggle: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    paddingHorizontal: 9,
    paddingVertical: 5,
    borderRadius: radii.pill,
    backgroundColor: color.brand[50],
  },
  constantsBody: {
    gap: 8,
    marginTop: 8,
  },
  constantRow: {    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    backgroundColor: palette.surface,
    borderWidth: 1,
    borderColor: color.border,
    borderRadius: radii.lg,
    paddingVertical: 11,
    paddingHorizontal: 14,
  },
  constantMain: {
    flex: 1,
    minWidth: 0,
    gap: 1,
  },
  constantValueWrap: {
    paddingHorizontal: 11,
    paddingVertical: 5,
    borderRadius: radii.pill,
    backgroundColor: color.brand[50],
  },
  lockNote: {
    marginTop: 8,
    gap: 0,
  },

  /* Pied de page */
  noteRow: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 6,
  },
  scopeRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 6,
  },
  scopeChip: {
    paddingHorizontal: 9,
    paddingVertical: 4,
    borderRadius: radii.sm,
    backgroundColor: color.surfaceAlt,
  },
  scaleNote: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
  },
});
