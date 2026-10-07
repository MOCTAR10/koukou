import React from 'react';
import { StyleSheet, View } from 'react-native';
import { useRouter } from 'expo-router';
import { useQuery } from '@tanstack/react-query';
import { Briefcase, CalendarDays, PencilLine, UserRound, Users } from 'lucide-react-native';

import { Screen, ScreenHeader } from '@/components/ui/Screen';
import { AppText } from '@/components/ui/AppText';
import { Button } from '@/components/ui/Button';
import { Card } from '@/components/ui/Card';
import { Chip } from '@/components/ui/Chip';
import { SectionHeader } from '@/components/ui/SectionHeader';
import { Spinner } from '@/components/ui/Spinner';
import { useAuth } from '@/auth/AuthContext';
import { useFarmProfile } from '@/hooks/useFarmProfile';
import { fetchFarmMembers } from '@/api';
import { canManageFarm } from '@/api/roles';
import type { FarmMember } from '@/api/types';
import { contractTypeLabel } from '@/constants/hr';
import { color, fmt, fmtFcfa, palette } from '@/constants/theme';

function DossierRow({ member }: { member: FarmMember }) {
  const role = member.jobTitle?.trim() || (member.role === 'ADMIN' ? 'Administrateur' : 'Éleveur');
  const dates = [member.hireDate ? `Embauche ${member.hireDate}` : null, member.endDate ? `Fin ${member.endDate}` : null]
    .filter(Boolean)
    .join(' · ');

  return (
    <Card tone="default" style={styles.card}>
      <View style={styles.head}>
        <View style={styles.avatar}>
          <UserRound size={20} color={color.brand[700]} />
        </View>
        <View style={{ flex: 1, gap: 2 }}>
          <View style={styles.titleRow}>
            <AppText size="body" weight="bold" color="text" numberOfLines={1} style={{ flex: 1 }}>
              {member.user.fullName}
            </AppText>
            <Chip label={contractTypeLabel(member.contractType)} tone={member.contractType ? 'brand' : 'outline'} />
          </View>
          <AppText size="caption" color="muted" numberOfLines={1}>
            {role}
            {member.department ? ` · ${member.department}` : ''}
            {member.active ? '' : ' · inactif'}
          </AppText>
          <AppText size="caption" color="muted">
            {member.user.phone}
          </AppText>
        </View>
      </View>

      <View style={styles.metaRow}>
        <View style={styles.metaItem}>
          <CalendarDays size={14} color={color.ink[400]} />
          <AppText size="caption" color="muted" numberOfLines={1}>
            {dates || 'Dates non renseignées'}
          </AppText>
        </View>
        <View style={styles.metaItem}>
          <Briefcase size={14} color={color.ink[400]} />
          <AppText size="caption" color="muted" numberOfLines={1}>
            {member.salaryFcfa != null ? `${fmtFcfa(member.salaryFcfa)} / mois` : 'Salaire non renseigné'}
          </AppText>
        </View>
      </View>

      {member.notes ? (
        <AppText size="small" color="muted" numberOfLines={3}>
          {member.notes}
        </AppText>
      ) : null}
    </Card>
  );
}

export default function RhScreen() {
  const { farms, user, farmId } = useAuth();
  const router = useRouter();
  const profileHook = useFarmProfile();
  const canView =
    canManageFarm(user.role) || profileHook.isOwner || profileHook.hasPermission('equipe:gerer') || profileHook.hasPermission('rh:lire');
  const canEdit = canManageFarm(user.role) || profileHook.isOwner || profileHook.hasPermission('equipe:gerer');

  const members = useQuery({
    queryKey: ['farm-members', farmId],
    queryFn: () => fetchFarmMembers(farmId),
    enabled: Boolean(farmId) && canView,
  });

  const list = members.data ?? [];
  const activeCount = list.filter((m) => m.active).length;
  const withDossier = list.filter((m) => m.contractType || m.hireDate || m.salaryFcfa != null).length;

  return (
    <Screen header={<ScreenHeader title="Dossiers RH" subtitle={farms[0]?.name ?? 'Ferme'} back right={<Briefcase size={18} color={color.ink[300]} />} />}>
      {!canView ? (
        <Card tone="default" style={styles.card}>
          <AppText size="label" color="muted" style={{ marginBottom: 6 }}>
            RESSOURCES HUMAINES
          </AppText>
          <AppText size="body" color="muted">
            L’accès aux dossiers employés requiert la permission « Voir les dossiers employés ». Contactez le propriétaire de la ferme.
          </AppText>
        </Card>
      ) : members.isLoading ? (
        <Spinner label="Chargement des dossiers…" />
      ) : (
        <>
          <View style={styles.statsRow}>
            <Card tone="brand" style={styles.stat}>
              <Users size={18} color={color.brand[700]} />
              <AppText size="h2" weight="bold" color="text">
                {fmt(activeCount)}
              </AppText>
              <AppText size="caption" color="muted">
                Employés actifs
              </AppText>
            </Card>
            <Card tone="green" style={styles.stat}>
              <Briefcase size={18} color={color.green[700]} />
              <AppText size="h2" weight="bold" color="text">
                {fmt(withDossier)}
              </AppText>
              <AppText size="caption" color="muted">
                Dossiers renseignés
              </AppText>
            </Card>
          </View>

          {canEdit ? (
            <Button label="Gérer les dossiers dans Équipe" tone="brand" icon={PencilLine} onPress={() => router.push('/equipe')} />
          ) : null}

          <SectionHeader title={`Employés (${list.length})`} subtitle="Contrat, poste et rémunération" icon={UserRound} />

          {list.length === 0 ? (
            <Card tone="default" style={styles.card}>
              <AppText size="body" color="muted">
                Aucun employé rattaché à la ferme pour le moment.
              </AppText>
            </Card>
          ) : (
            <View style={{ gap: 8 }}>
              {list.map((m) => (
                <DossierRow key={m.id} member={m} />
              ))}
            </View>
          )}
        </>
      )}
    </Screen>
  );
}

const styles = StyleSheet.create({
  card: {
    gap: 10,
    padding: 14,
  },
  statsRow: {
    flexDirection: 'row',
    gap: 8,
    marginBottom: 8,
  },
  stat: {
    flex: 1,
    gap: 4,
    padding: 14,
  },
  head: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
  },
  avatar: {
    width: 44,
    height: 44,
    borderRadius: 22,
    backgroundColor: color.brand[50],
    alignItems: 'center',
    justifyContent: 'center',
  },
  titleRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  metaRow: {
    gap: 4,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: palette.border,
    paddingTop: 8,
  },
  metaItem: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
});
