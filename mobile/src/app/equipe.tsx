import React, { useState } from 'react';
import { Image, Keyboard, Pressable, StyleSheet, Switch, TextInput, View } from 'react-native';
import { useRouter } from 'expo-router';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { Building2, Briefcase, ChevronDown, ChevronUp, KeyRound, ListTodo, Phone, ShieldCheck, UserCog, UserPlus, Users } from 'lucide-react-native';

import { Screen, ScreenHeader } from '@/components/ui/Screen';
import { AppText } from '@/components/ui/AppText';
import { Button } from '@/components/ui/Button';
import { Card } from '@/components/ui/Card';
import { Chip } from '@/components/ui/Chip';
import { SectionHeader } from '@/components/ui/SectionHeader';
import { Sheet } from '@/components/ui/Sheet';
import { Spinner } from '@/components/ui/Spinner';
import { useAuth } from '@/auth/AuthContext';
import { useFarmProfile } from '@/hooks/useFarmProfile';
import { fetchBuildings, fetchFarmMembers, fetchPermissionCatalog } from '@/api';
import { createFarmMember, updateFarmMember } from '@/api/mutations';
import { canManageFarm, farmRoleLabel } from '@/api/roles';
import type { ContractType, FarmMember, PermissionCatalog, PermissionCode, StaffProfile } from '@/api/types';
import { CREATE_ADMIN_DEFAULT_PERMISSIONS, LOCAL_PERMISSION_GROUPS, STAFF_PROFILES_LOCAL } from '@/constants/permissions';
import { CONTRACT_TYPES, contractTypeLabel } from '@/constants/hr';
import { color, fmt, palette } from '@/constants/theme';

/** Clé du profil « sur mesure » (non fourni par le serveur) : rôle Admin, droits à cocher. */
const CUSTOM_PROFILE_KEY = '__custom__';
const CUSTOM_PROFILE: StaffProfile = {
  key: CUSTOM_PROFILE_KEY,
  label: 'Profil personnalisé',
  role: 'ADMIN',
  jobTitle: '',
  permissions: [],
};

function samePermissions(a: readonly string[], b: readonly string[]): boolean {
  if (a.length !== b.length) return false;
  const x = [...a].sort();
  const y = [...b].sort();
  return x.every((v, i) => v === y[i]);
}

/** Retrouve le profil correspondant à l'état courant ; « sur mesure » sinon. */
function matchProfileKey(role: 'ADMIN' | 'ELEVEUR', permissions: PermissionCode[], profiles: StaffProfile[]): string {
  if (role === 'ELEVEUR') return 'eleveur';
  const found = profiles.find((p) => p.role === 'ADMIN' && samePermissions(p.permissions, permissions));
  return found?.key ?? CUSTOM_PROFILE_KEY;
}

/** Grille de profils métier : un tap pré-remplit rôle, poste et permissions. */
function ProfileGrid({
  profiles,
  selected,
  onSelect,
}: {
  profiles: StaffProfile[];
  selected: string | null;
  onSelect: (p: StaffProfile) => void;
}) {
  if (profiles.length === 0) return null;
  return (
    <View style={{ marginTop: 4 }}>
      <AppText size="label" color="muted">
        PROFIL MÉTIER
      </AppText>
      <AppText size="caption" color="muted" style={{ marginBottom: 8 }}>
        Choisissez un profil : rôle, poste et droits sont pré-remplis.
      </AppText>
      <View style={styles.profileGrid}>
        {profiles.map((p) => {
          const on = selected === p.key;
          const custom = p.key === CUSTOM_PROFILE_KEY;
          const sub = custom
            ? 'Sur mesure'
            : p.role === 'ADMIN'
              ? `${p.permissions.length} droits`
              : 'Droits fixes';
          return (
            <Pressable
              key={p.key}
              onPress={() => onSelect(p)}
              style={[styles.profileChip, on && styles.profileChipOn]}
              accessibilityRole="button"
              accessibilityState={{ selected: on }}>
              <AppText size="small" weight={on ? 'bold' : 'medium'} color={on ? 'surface' : 'text'} numberOfLines={1}>
                {p.label}
              </AppText>
              <AppText size="caption" color={on ? 'surface' : 'muted'} numberOfLines={1}>
                {sub}
              </AppText>
            </Pressable>
          );
        })}
      </View>
    </View>
  );
}

/** Section « Dossier RH » repliable et mise en avant (fiche employé optionnelle). */
function RhDossier(props: {
  open: boolean;
  onToggle: () => void;
  busy: boolean;
  filled: boolean;
  department: string;
  setDepartment: (v: string) => void;
  contractType: ContractType | null;
  setContractType: (v: ContractType | null) => void;
  hireDate: string;
  setHireDate: (v: string) => void;
  endDate: string;
  setEndDate: (v: string) => void;
  salary: string;
  setSalary: (v: string) => void;
  notes: string;
  setNotes: (v: string) => void;
}) {
  return (
    <View style={[styles.rhCard, props.open && styles.rhCardOpen]}>
      <Pressable onPress={props.onToggle} style={styles.rhHeader} accessibilityRole="button">
        <View style={styles.rhIcon}>
          <Briefcase size={18} color={color.brand[700]} />
        </View>
        <View style={{ flex: 1, gap: 1 }}>
          <AppText size="body" weight="semibold" color="text">
            Dossier RH
          </AppText>
          <AppText size="caption" color="muted">
            Contrat, poste, rémunération et notes
          </AppText>
        </View>
        <Chip label={props.filled ? 'Renseigné' : 'À compléter'} tone={props.filled ? 'green' : 'amber'} />
        {props.open ? <ChevronUp size={18} color={color.ink[400]} /> : <ChevronDown size={18} color={color.ink[400]} />}
      </Pressable>
      {props.open ? (
        <View style={styles.rhBody}>
          <Field icon={<Briefcase size={16} color={color.ink[400]} />} label="Service / département">
            <FieldInput value={props.department} onChangeText={props.setDepartment} placeholder="Ex : Production, Ventes…" editable={!props.busy} />
          </Field>
          <AppText size="small" weight="semibold" color="muted" style={{ marginBottom: 5 }}>
            Type de contrat
          </AppText>
          <View style={styles.chipWrap}>
            {CONTRACT_TYPES.map((t) => {
              const on = props.contractType === t;
              return (
                <Pressable
                  key={t}
                  onPress={() => props.setContractType(on ? null : t)}
                  style={[styles.miniChip, on && styles.miniChipOn]}
                  accessibilityRole="button"
                  accessibilityState={{ selected: on }}>
                  <AppText size="caption" weight={on ? 'bold' : 'medium'} color={on ? 'surface' : 'muted'}>
                    {contractTypeLabel(t)}
                  </AppText>
                </Pressable>
              );
            })}
          </View>
          <Field icon={<Briefcase size={16} color={color.ink[400]} />} label="Date d’embauche (AAAA-MM-JJ)">
            <FieldInput value={props.hireDate} onChangeText={props.setHireDate} placeholder="2026-01-15" editable={!props.busy} />
          </Field>
          <Field icon={<Briefcase size={16} color={color.ink[400]} />} label="Fin de contrat (AAAA-MM-JJ)">
            <FieldInput value={props.endDate} onChangeText={props.setEndDate} placeholder="2026-12-31" editable={!props.busy} />
          </Field>
          <Field icon={<Briefcase size={16} color={color.ink[400]} />} label="Salaire de référence (FCFA)">
            <FieldInput value={props.salary} onChangeText={props.setSalary} placeholder="Ex : 150000" keyboardType="number-pad" editable={!props.busy} />
          </Field>
          <Field icon={<Briefcase size={16} color={color.ink[400]} />} label="Observations">
            <FieldInput
              value={props.notes}
              onChangeText={props.setNotes}
              placeholder="Notes RH…"
              multiline
              editable={!props.busy}
              style={styles.notesInput}
            />
          </Field>
        </View>
      ) : null}
    </View>
  );
}

/** Sélecteur de bâtiment assigné : liste les bâtiments de la ferme. */
function BuildingPicker({
  value,
  options,
  onSelect,
  busy,
}: {
  value: string;
  options: string[];
  onSelect: (v: string) => void;
  busy: boolean;
}) {
  return (
    <Field icon={<Building2 size={16} color={color.ink[400]} />} label="Bâtiment assigné (optionnel)">
      {options.length === 0 ? (
        <AppText size="caption" color="muted">
          Aucun bâtiment enregistré. Créez-en depuis « Lots ».
        </AppText>
      ) : (
        <View style={styles.chipWrap}>
          <Pressable
            onPress={() => onSelect('')}
            style={[styles.miniChip, !value && styles.miniChipOn]}
            disabled={busy}
            accessibilityRole="button"
            accessibilityState={{ selected: !value }}>
            <AppText size="caption" weight={!value ? 'bold' : 'medium'} color={!value ? 'surface' : 'muted'}>
              Aucun
            </AppText>
          </Pressable>
          {options.map((name) => {
            const on = value === name;
            return (
              <Pressable
                key={name}
                onPress={() => onSelect(on ? '' : name)}
                style={[styles.miniChip, on && styles.miniChipOn]}
                disabled={busy}
                accessibilityRole="button"
                accessibilityState={{ selected: on }}>
                <AppText size="caption" weight={on ? 'bold' : 'medium'} color={on ? 'surface' : 'muted'}>
                  {name}
                </AppText>
              </Pressable>
            );
          })}
        </View>
      )}
    </Field>
  );
}

function MemberRow({ member, farmName, onPress }: { member: FarmMember; farmName?: string; onPress: () => void }) {
  const isAdmin = member.role === 'ADMIN';
  const label = member.jobTitle?.trim() || farmRoleLabel(member.role, farmName);
  const hasDossier = Boolean(member.contractType || member.department || member.hireDate || member.salaryFcfa != null);
  return (
    <Pressable onPress={onPress} style={({ pressed }) => [styles.card, pressed && { opacity: 0.85 }]} accessibilityRole="button">
      <View style={styles.memberHead}>
        <View style={[styles.avatar, isAdmin && { backgroundColor: color.accent[600] }]}>
          <Image source={require('@/assets/images/logo-white.png')} style={styles.avatarLogo} accessibilityLabel="Logo KouKou" />
        </View>
        <View style={{ flex: 1, gap: 2 }}>
          <View style={styles.titleRow}>
            <AppText size="body" weight="bold" color="text" numberOfLines={1} style={{ flex: 1 }}>
              {member.user.fullName}
            </AppText>
            <Chip label={isAdmin ? 'ADMIN' : 'ÉLEVEUR'} tone={isAdmin ? 'accent' : 'brand'} />
          </View>
          <AppText size="caption" color="muted" numberOfLines={1}>
            {label}
            {member.active ? '' : ' · inactif'}
          </AppText>
          <AppText size="caption" color="muted">
            {member.user.phone}
            {member.buildingAssignment ? ` · ${member.buildingAssignment}` : ''}
          </AppText>
        </View>
      </View>

      {hasDossier ? (
        <View style={styles.memberTags}>
          {member.contractType ? <Chip label={contractTypeLabel(member.contractType)} tone="brand" /> : null}
          {member.department ? <Chip label={member.department} tone="outline" /> : null}
          {member.hireDate ? <Chip label={`Depuis ${member.hireDate}`} tone="neutral" /> : null}
          {member.salaryFcfa != null ? <Chip label={`${fmt(member.salaryFcfa)} F`} tone="neutral" /> : null}
        </View>
      ) : (
        <View style={styles.memberTags}>
          <Chip label="Dossier RH à compléter" tone="amber" />
        </View>
      )}
    </Pressable>
  );
}

export default function EquipeScreen() {
  const { farms, user, farmId } = useAuth();
  const farmName = farms[0]?.name;
  const profileHook = useFarmProfile();
  const canManageAccount = canManageFarm(user.role) || profileHook.isOwner || profileHook.hasPermission('equipe:gerer');
  const queryClient = useQueryClient();
  const router = useRouter();

  const members = useQuery({
    queryKey: ['farm-members', farmId],
    queryFn: () => fetchFarmMembers(farmId),
    enabled: Boolean(farmId) && canManageAccount,
  });

  const permissionCatalog = useQuery({
    queryKey: ['permission-catalog', farmId],
    queryFn: () => fetchPermissionCatalog(farmId),
    enabled: Boolean(farmId) && canManageAccount,
    staleTime: 5 * 60_000,
  });

  const buildings = useQuery({
    queryKey: ['buildings', farmId],
    queryFn: () => fetchBuildings(farmId),
    enabled: Boolean(farmId) && canManageAccount,
    staleTime: 5 * 60_000,
  });

  const [showCreate, setShowCreate] = useState(false);
  const [fullName, setFullName] = useState('');
  const [phone, setPhone] = useState('');
  const [code, setCode] = useState('');
  const [role, setRole] = useState<'ADMIN' | 'ELEVEUR'>('ELEVEUR');
  const [jobTitle, setJobTitle] = useState('');
  const [building, setBuilding] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);
  const [createPermissions, setCreatePermissions] = useState<Set<string>>(new Set());
  const [createProfileKey, setCreateProfileKey] = useState<string | null>(null);
  const [createRhOpen, setCreateRhOpen] = useState(false);
  const [cDepartment, setCDepartment] = useState('');
  const [cContractType, setCContractType] = useState<ContractType | null>(null);
  const [cHireDate, setCHireDate] = useState('');
  const [cEndDate, setCEndDate] = useState('');
  const [cSalary, setCSalary] = useState('');
  const [cNotes, setCNotes] = useState('');

  const [editing, setEditing] = useState<FarmMember | null>(null);
  const [editRole, setEditRole] = useState<'ADMIN' | 'ELEVEUR'>('ELEVEUR');
  const [editJobTitle, setEditJobTitle] = useState('');
  const [editBuilding, setEditBuilding] = useState('');
  const [editActive, setEditActive] = useState(true);
  const [editPermissions, setEditPermissions] = useState<Set<string>>(new Set());
  const [editProfileKey, setEditProfileKey] = useState<string | null>(null);
  const [editRhOpen, setEditRhOpen] = useState(false);
  const [eDepartment, setEDepartment] = useState('');
  const [eContractType, setEContractType] = useState<ContractType | null>(null);
  const [eHireDate, setEHireDate] = useState('');
  const [eEndDate, setEEndDate] = useState('');
  const [eSalary, setESalary] = useState('');
  const [eNotes, setENotes] = useState('');

  const reset = () => {
    setFullName('');
    setPhone('');
    setCode('');
    setRole('ELEVEUR');
    setJobTitle('');
    setBuilding('');
    setCreatePermissions(new Set());
    setCreateProfileKey(null);
    setCreateRhOpen(false);
    setCDepartment('');
    setCContractType(null);
    setCHireDate('');
    setCEndDate('');
    setCSalary('');
    setCNotes('');
    setSuccess(null);
  };

  const openCreate = () => {
    reset();
    setError(null);
    setShowCreate(true);
  };

  const openEdit = (member: FarmMember) => {
    setEditing(member);
    setEditRole(member.role);
    setEditJobTitle(member.jobTitle ?? '');
    setEditBuilding(member.buildingAssignment ?? '');
    setEditActive(member.active);
    setEditPermissions(new Set(member.permissions));
    setEditProfileKey(matchProfileKey(member.role, member.permissions, profiles));
    setEDepartment(member.department ?? '');
    setEContractType(member.contractType);
    setEHireDate(member.hireDate ?? '');
    setEEndDate(member.endDate ?? '');
    setESalary(member.salaryFcfa != null ? String(member.salaryFcfa) : '');
    setENotes(member.notes ?? '');
    setEditRhOpen(Boolean(member.department || member.contractType || member.hireDate || member.endDate || member.salaryFcfa != null || member.notes));
    setError(null);
  };

  const applyProfile = (p: StaffProfile, target: 'create' | 'edit') => {
    const custom = p.key === CUSTOM_PROFILE_KEY;
    const permissions = custom ? [...CREATE_ADMIN_DEFAULT_PERMISSIONS] : p.permissions;
    if (target === 'create') {
      setCreateProfileKey(p.key);
      setRole(p.role);
      if (!custom) setJobTitle(p.jobTitle);
      setCreatePermissions(new Set(permissions));
    } else {
      setEditProfileKey(p.key);
      setEditRole(p.role);
      if (!custom) setEditJobTitle(p.jobTitle);
      setEditPermissions(new Set(permissions));
    }
  };

  const parseSalary = (raw: string, setErr: (m: string) => void): number | undefined => {
    const t = raw.trim();
    if (!t) return undefined;
    const n = Number(t);
    if (!Number.isInteger(n) || n < 0) {
      setErr('Salaire invalide : entier FCFA positif attendu.');
      return undefined;
    }
    return n;
  };

  const submit = async () => {
    if (!fullName.trim() || !phone.trim()) {
      setError('Nom et téléphone sont obligatoires.');
      return;
    }
    if (code.trim().length < 6) {
      setError('Le code doit contenir au moins 6 caractères.');
      return;
    }
    const salary = parseSalary(cSalary, setError);
    if (cSalary.trim() && salary === undefined) return;
    Keyboard.dismiss();
    setBusy(true);
    setError(null);
    try {
      await createFarmMember(farmId, {
        fullName: fullName.trim(),
        phone: phone.trim(),
        code: code.trim(),
        role,
        jobTitle: jobTitle.trim() ? jobTitle.trim() : undefined,
        buildingAssignment: building.trim() ? building.trim() : undefined,
        permissions: role === 'ADMIN' ? [...createPermissions] : undefined,
        profileKey: createProfileKey && createProfileKey !== CUSTOM_PROFILE_KEY ? createProfileKey : undefined,
        department: cDepartment.trim() || undefined,
        contractType: cContractType ?? undefined,
        hireDate: cHireDate.trim() || undefined,
        endDate: cEndDate.trim() || undefined,
        salaryFcfa: salary,
        notes: cNotes.trim() || undefined,
      });
      reset();
      setShowCreate(false);
      setSuccess('Compte créé et rattaché à la ferme.');
      void queryClient.invalidateQueries({ queryKey: ['farm-members', farmId] });
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Erreur lors de la création du compte.');
    } finally {
      setBusy(false);
    }
  };

  const saveEdit = async () => {
    if (!editing) return;
    const salary = parseSalary(eSalary, setError);
    if (eSalary.trim() && salary === undefined) return;
    setBusy(true);
    setError(null);
    try {
      const payload: Record<string, unknown> = {
        role: editRole,
      };
      if (editProfileKey && editProfileKey !== CUSTOM_PROFILE_KEY) {
        payload.profileKey = editProfileKey;
      }
      if (editRole === 'ADMIN') {
        payload.permissions = [...editPermissions];
      }
      if (editJobTitle.trim() !== (editing.jobTitle ?? '')) {
        payload.jobTitle = editJobTitle.trim() || null;
      }
      if (editBuilding.trim() !== (editing.buildingAssignment ?? '')) {
        payload.buildingAssignment = editBuilding.trim() || null;
      }
      if (editActive !== editing.active) {
        payload.active = editActive;
      }
      if (eDepartment.trim() !== (editing.department ?? '')) {
        payload.department = eDepartment.trim() || null;
      }
      if ((eContractType ?? null) !== (editing.contractType ?? null)) {
        payload.contractType = eContractType;
      }
      if (eHireDate.trim() !== (editing.hireDate ?? '')) {
        payload.hireDate = eHireDate.trim() || null;
      }
      if (eEndDate.trim() !== (editing.endDate ?? '')) {
        payload.endDate = eEndDate.trim() || null;
      }
      if (salary !== (editing.salaryFcfa ?? undefined)) {
        payload.salaryFcfa = salary ?? null;
      }
      if (eNotes.trim() !== (editing.notes ?? '')) {
        payload.notes = eNotes.trim() || null;
      }
      await updateFarmMember(farmId, editing.id, payload);
      setEditing(null);
      setSuccess(`Membre « ${editing.user.fullName} » mis à jour.`);
      void queryClient.invalidateQueries({ queryKey: ['farm-members', farmId] });
      void queryClient.invalidateQueries({ queryKey: ['farm-profile', farmId] });
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Erreur lors de la mise à jour.');
    } finally {
      setBusy(false);
    }
  };

  const togglePermission = (code: string) => {
    setEditProfileKey(CUSTOM_PROFILE_KEY);
    setEditPermissions((prev) => {
      const next = new Set(prev);
      if (next.has(code)) next.delete(code);
      else next.add(code);
      return next;
    });
  };

  const toggleCreatePermission = (code: string) => {
    setCreateProfileKey(CUSTOM_PROFILE_KEY);
    setCreatePermissions((prev) => {
      const next = new Set(prev);
      if (next.has(code)) next.delete(code);
      else next.add(code);
      return next;
    });
  };

  const catalog: PermissionCatalog | undefined = permissionCatalog.data;
  const groups = catalog?.groups?.length ? catalog.groups : LOCAL_PERMISSION_GROUPS;
  const profiles = catalog?.profiles?.length ? catalog.profiles : STAFF_PROFILES_LOCAL;
  const profileOptions: StaffProfile[] = [...profiles, CUSTOM_PROFILE];
  const buildingOptions = (buildings.data ?? []).map((b) => b.name);

  return (
    <Screen header={<ScreenHeader title="Équipe" subtitle={farms[0]?.name ?? 'Ferme'} back right={<Users size={18} color={color.ink[300]} />} />}>

      <Pressable
        onPress={() => router.push('/tasks')}
        style={({ pressed }) => [styles.tasksLink, pressed && { opacity: 0.8 }]}
        accessibilityRole="button"
        accessibilityLabel="Voir les tâches de l’équipe">
        <View style={styles.tasksLinkIcon}>
          <ListTodo size={20} color={color.amber[600]} />
        </View>
        <View style={{ flex: 1, gap: 1 }}>
          <AppText size="body" weight="semibold" color="text">
            Tâches de l’équipe
          </AppText>
          <AppText size="caption" color="muted" numberOfLines={1}>
            Planifier, assigner et suivre le travail quotidien
          </AppText>
        </View>
        <ListTodo size={16} color={color.ink[300]} />
      </Pressable>

      {canManageAccount ? (
        <Pressable
          onPress={() => router.push('/rh')}
          style={({ pressed }) => [styles.tasksLink, pressed && { opacity: 0.8 }]}
          accessibilityRole="button"
          accessibilityLabel="Ouvrir les dossiers RH">
          <View style={[styles.tasksLinkIcon, { backgroundColor: color.brand[50] }]}>
            <Briefcase size={20} color={color.brand[600]} />
          </View>
          <View style={{ flex: 1, gap: 1 }}>
            <AppText size="body" weight="semibold" color="text">
              Dossiers RH
            </AppText>
            <AppText size="caption" color="muted" numberOfLines={1}>
              Contrats, postes, rémunération et ancienneté
            </AppText>
          </View>
          <Briefcase size={16} color={color.ink[300]} />
        </Pressable>
      ) : null}

      {success ? (
        <Card tone="green" style={styles.card}>
          <AppText size="small" color="success">
            {success}
          </AppText>
        </Card>
      ) : null}

      {canManageAccount ? (
        <>
          {!showCreate ? (
            <Button label="Ajouter un membre" tone="brand" icon={UserPlus} onPress={openCreate} />
          ) : null}

          <SectionHeader
            title={`Membres (${(members.data?.length ?? 0) + (profileHook.profile?.role === 'PROPRIETAIRE' ? 1 : 0)})`}
            subtitle="Propriétaire, administrateurs et éleveurs"
          />
          {members.isLoading ? (
            <Spinner label="Chargement de l'équipe…" />
          ) : (
            <View style={{ gap: 8 }}>
              {profileHook.profile?.role === 'PROPRIETAIRE' ? (
                <Card tone="green" style={styles.card}>
                  <View style={styles.memberHead}>
                    <View style={[styles.avatar, { backgroundColor: color.green[600] }]}>
                        <Image source={require('@/assets/images/logo-white.png')} style={styles.avatarLogo} accessibilityLabel="Logo KouKou" />
                      </View>
                    <View style={{ flex: 1, gap: 2 }}>
                      <View style={styles.titleRow}>
                        <AppText size="body" weight="bold" color="text" numberOfLines={1} style={{ flex: 1 }}>
                          {user.fullName}
                        </AppText>
                        <Chip label="PROPRIÉTAIRE" tone="green" />
                      </View>
                      <AppText size="caption" color="muted">
                        {user.phone}
                      </AppText>
                    </View>
                  </View>
                </Card>
              ) : null}

              {(members.data ?? []).map((m) => (
                <MemberRow key={m.id} member={m} farmName={farmName} onPress={() => openEdit(m)} />
              ))}
            </View>
          )}
        </>
      ) : (
        <Card tone="default" style={styles.card}>
          <AppText size="label" color="muted" style={{ marginBottom: 6 }}>
            ÉQUIPE DE LA FERME
          </AppText>
          <AppText size="body" color="muted">
            La gestion de l’équipe requiert la permission « Gérer l’équipe ». Contactez le propriétaire de la ferme pour obtenir l’accès.
          </AppText>
        </Card>
      )}

      {showCreate ? (
        <Sheet
          visible={showCreate}
          title="Ajouter un membre"
          subtitle="Compte rattaché à l’équipe de la ferme"
          icon={
            <View style={styles.sheetIcon}>
              <UserPlus size={18} color={color.brand[600]} />
            </View>
          }
          accentColor={color.accent[600]}
          onClose={() => {
            if (!busy) setShowCreate(false);
          }}
          footer={
            <View style={styles.inlineActions}>
              <Button label="Annuler" tone="ghost" onPress={() => setShowCreate(false)} disabled={busy} style={{ flex: 1 }} />
              <Button label="Créer le compte" tone="brand" icon={UserPlus} onPress={() => void submit()} disabled={busy} loading={busy} style={{ flex: 2 }} />
            </View>
          }
        >
          <ProfileGrid profiles={profileOptions} selected={createProfileKey} onSelect={(p) => applyProfile(p, 'create')} />

          <Field icon={<UserCog size={16} color={color.ink[400]} />} label="Nom complet">
            <FieldInput value={fullName} onChangeText={setFullName} placeholder="Ex : Jean-Marc Ondo" editable={!busy} />
          </Field>
          <Field icon={<Phone size={16} color={color.ink[400]} />} label="Téléphone">
            <FieldInput value={phone} onChangeText={setPhone} placeholder="+241 77 XX XX XX" keyboardType="phone-pad" editable={!busy} />
          </Field>
          <Field icon={<KeyRound size={16} color={color.ink[400]} />} label="Code secret (≥ 6 caractères)">
            <FieldInput value={code} onChangeText={setCode} placeholder="••••••" secureTextEntry editable={!busy} />
          </Field>
          <Field icon={<ShieldCheck size={16} color={color.ink[400]} />} label="Intitulé du poste">
            <FieldInput value={jobTitle} onChangeText={setJobTitle} placeholder="Ex : Comptable, Chef d’élevage…" editable={!busy} />
          </Field>
          <BuildingPicker value={building} options={buildingOptions} onSelect={setBuilding} busy={busy} />

          {role === 'ADMIN' ? (
            <View style={{ marginTop: 4 }}>
              <AppText size="label" color="muted" style={{ marginBottom: 8 }}>
                PERMISSIONS DE L’ADMINISTRATEUR
              </AppText>
              {groups.length > 0 ? (
                <View style={{ gap: 12 }}>
                  {groups.map((group) => (
                    <View key={group.key} style={{ gap: 4 }}>
                      <AppText size="small" weight="bold" color="text">{group.label}</AppText>
                      {group.items.map((item) => {
                        const on = createPermissions.has(item.code);
                        return (
                          <Pressable
                            key={item.code}
                            onPress={() => toggleCreatePermission(item.code)}
                            style={styles.permissionRow}
                            accessibilityRole="checkbox"
                            accessibilityState={{ checked: on }}>
                            <View style={[styles.checkbox, on && styles.checkboxOn]}>
                              {on ? <AppText size="small" color="surface" weight="bold" style={{ fontSize: 11 }}>✓</AppText> : null}
                            </View>
                            <View style={{ flex: 1 }}>
                              <AppText size="small" weight={on ? 'bold' : 'medium'} color={on ? 'text' : 'muted'}>
                                {item.label}
                              </AppText>
                              <AppText size="caption" color="muted">
                                {item.description}
                              </AppText>
                            </View>
                          </Pressable>
                        );
                      })}
                    </View>
                  ))}
                </View>
              ) : null}
            </View>
          ) : (
            <AppText size="caption" color="muted" style={{ marginTop: 4 }}>
              L’Éleveur dispose de droits fixes (saisie du jour, ventes, lecture caisse et sanitaire).
            </AppText>
          )}

          <RhDossier
            open={createRhOpen}
            onToggle={() => setCreateRhOpen((v) => !v)}
            busy={busy}
            filled={Boolean(cDepartment.trim() || cContractType || cHireDate.trim() || cEndDate.trim() || cSalary.trim() || cNotes.trim())}
            department={cDepartment}
            setDepartment={setCDepartment}
            contractType={cContractType}
            setContractType={setCContractType}
            hireDate={cHireDate}
            setHireDate={setCHireDate}
            endDate={cEndDate}
            setEndDate={setCEndDate}
            salary={cSalary}
            setSalary={setCSalary}
            notes={cNotes}
            setNotes={setCNotes}
          />

          {error ? (
            <AppText size="small" color="danger" style={{ marginTop: 8 }}>
              {error}
            </AppText>
          ) : null}
        </Sheet>
      ) : null}

      {editing ? (
        <Card tone="default" style={styles.card}>
          <View style={styles.cardTitle}>
            <UserCog size={16} color={color.ink[400]} />
            <AppText size="label" weight="bold" color="text">MODIFIER LE MEMBRE</AppText>
          </View>
          <AppText size="caption" color="muted" style={{ marginBottom: 8 }}>
            {editing.user.fullName} — {farmRoleLabel(editRole, farmName)}
          </AppText>

          <ProfileGrid profiles={profileOptions} selected={editProfileKey} onSelect={(p) => applyProfile(p, 'edit')} />

          <Field icon={<ShieldCheck size={16} color={color.ink[400]} />} label="Intitulé du poste">
            <FieldInput value={editJobTitle} onChangeText={setEditJobTitle} placeholder="Ex : Comptable, Chef d’élevage…" editable={!busy} />
          </Field>
          <BuildingPicker value={editBuilding} options={buildingOptions} onSelect={setEditBuilding} busy={busy} />

          <View style={styles.switchRow}>
            <View style={{ flex: 1 }}>
              <AppText size="body" weight="semibold" color="text">Membre actif</AppText>
              <AppText size="caption" color="muted">Désactivé, le membre ne peut plus accéder à la ferme.</AppText>
            </View>
            <Switch
              value={editActive}
              onValueChange={setEditActive}
              disabled={busy}
              trackColor={{ true: color.brand[600], false: palette.border }}
              thumbColor={palette.surface}
            />
          </View>

          {editRole === 'ADMIN' ? (
            <View style={{ marginTop: 4 }}>
              <AppText size="label" color="muted" style={{ marginBottom: 8 }}>
                PERMISSIONS DE L’ADMINISTRATEUR
              </AppText>
              {groups.length > 0 ? (
                <View style={{ gap: 12 }}>
                  {groups.map((group) => (
                    <View key={group.key} style={{ gap: 4 }}>
                      <AppText size="small" weight="bold" color="text">{group.label}</AppText>
                      {group.items.map((item) => {
                        const on = editPermissions.has(item.code);
                        return (
                          <Pressable
                            key={item.code}
                            onPress={() => togglePermission(item.code)}
                            style={styles.permissionRow}
                            accessibilityRole="checkbox"
                            accessibilityState={{ checked: on }}>
                            <View style={[styles.checkbox, on && styles.checkboxOn]}>
                              {on ? <AppText size="small" color="surface" weight="bold" style={{ fontSize: 11 }}>✓</AppText> : null}
                            </View>
                            <View style={{ flex: 1 }}>
                              <AppText size="small" weight={on ? 'bold' : 'medium'} color={on ? 'text' : 'muted'}>
                                {item.label}
                              </AppText>
                              <AppText size="caption" color="muted">
                                {item.description}
                              </AppText>
                            </View>
                          </Pressable>
                        );
                      })}
                    </View>
                  ))}
                </View>
              ) : null}
            </View>
          ) : (
            <AppText size="caption" color="muted" style={{ marginTop: 4 }}>
              L’Éleveur dispose de droits fixes (saisie du jour, ventes, lecture caisse et sanitaire).
            </AppText>
          )}

          {error ? (
            <AppText size="small" color="danger" style={{ marginTop: 8 }}>
              {error}
            </AppText>
          ) : null}

          <RhDossier
            open={editRhOpen}
            onToggle={() => setEditRhOpen((v) => !v)}
            busy={busy}
            filled={Boolean(eDepartment.trim() || eContractType || eHireDate.trim() || eEndDate.trim() || eSalary.trim() || eNotes.trim())}
            department={eDepartment}
            setDepartment={setEDepartment}
            contractType={eContractType}
            setContractType={setEContractType}
            hireDate={eHireDate}
            setHireDate={setEHireDate}
            endDate={eEndDate}
            setEndDate={setEEndDate}
            salary={eSalary}
            setSalary={setESalary}
            notes={eNotes}
            setNotes={setENotes}
          />

          <View style={styles.inlineActions}>
            <Button label="Fermer" tone="ghost" onPress={() => setEditing(null)} disabled={busy} style={{ flex: 1 }} />
            <Button label="Enregistrer" tone="brand" icon={ShieldCheck} onPress={() => void saveEdit()} disabled={busy} loading={busy} style={{ flex: 2 }} />
          </View>
        </Card>
      ) : null}
    </Screen>
  );
}

function Field({ icon, label, children }: { icon: React.ReactNode; label: string; children: React.ReactNode }) {
  return (
    <View style={{ marginBottom: 10 }}>
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6, marginBottom: 5 }}>
        {icon}
        <AppText size="small" weight="semibold" color="muted">
          {label}
        </AppText>
      </View>
      {children}
    </View>
  );
}

function FieldInput(props: React.ComponentProps<typeof TextInput>) {
  return <TextInput placeholderTextColor={color.ink[300]} style={styles.input} {...props} />;
}

const styles = StyleSheet.create({
  card: {
    gap: 10,
    padding: 14,
  },
  cardTitle: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  sheetIcon: {
    width: 40,
    height: 40,
    borderRadius: 13,
    backgroundColor: color.brand[50],
    alignItems: 'center',
    justifyContent: 'center',
  },
  tasksLink: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    backgroundColor: palette.surface,
    borderRadius: 16,
    borderWidth: 1,
    borderColor: palette.border,
    padding: 14,
    marginBottom: 12,
  },
  tasksLinkIcon: {
    width: 44,
    height: 44,
    borderRadius: 14,
    backgroundColor: color.amber[50],
    alignItems: 'center',
    justifyContent: 'center',
  },
  memberHead: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
  },
  memberTags: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 6,
    marginTop: 10,
  },
  avatar: {
    width: 44,
    height: 44,
    borderRadius: 22,
    backgroundColor: color.brand[600],
    alignItems: 'center',
    justifyContent: 'center',
  },
  avatarLogo: {
    width: 24,
    height: 24,
  },
  titleRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  input: {
    height: 48,
    borderWidth: 1,
    borderColor: palette.border,
    borderRadius: 12,
    paddingHorizontal: 14,
    fontSize: 15,
    color: color.ink[800],
    backgroundColor: palette.surface,
  },
  segmented: {
    flexDirection: 'row',
    gap: 8,
    marginBottom: 12,
  },
  segRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 5,
    paddingHorizontal: 6,
  },
  segLabel: {
    textAlign: 'center',
  },
  segOption: {
    flex: 1,
    minHeight: 40,
    paddingVertical: 10,
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: 12,
    borderWidth: 1,
    borderColor: palette.border,
    backgroundColor: palette.surface,
  },
  segOptionOn: {
    backgroundColor: color.brand[600],
    borderColor: color.brand[600],
  },
  inlineActions: {
    flexDirection: 'row',
    gap: 8,
    marginTop: 4,
  },
  switchRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    paddingVertical: 4,
  },
  permissionRow: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 10,
    paddingVertical: 6,
  },
  checkbox: {
    width: 22,
    height: 22,
    borderRadius: 6,
    borderWidth: 1.5,
    borderColor: palette.border,
    alignItems: 'center',
    justifyContent: 'center',
    marginTop: 1,
  },
  checkboxOn: {
    backgroundColor: color.brand[600],
    borderColor: color.brand[600],
  },
  profileGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
    marginBottom: 12,
  },
  profileChip: {
    minWidth: '47%',
    flexGrow: 1,
    gap: 2,
    paddingVertical: 10,
    paddingHorizontal: 12,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: palette.border,
    backgroundColor: palette.surface,
  },
  profileChipOn: {
    backgroundColor: color.brand[600],
    borderColor: color.brand[600],
  },
  rhCard: {
    marginTop: 6,
    borderRadius: 14,
    borderWidth: 1,
    borderColor: palette.brand[100],
    backgroundColor: palette.brand[50],
    paddingHorizontal: 12,
    paddingVertical: 4,
  },
  rhCardOpen: {
    borderColor: color.brand[300],
  },
  rhHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    paddingVertical: 10,
  },
  rhIcon: {
    width: 40,
    height: 40,
    borderRadius: 13,
    backgroundColor: palette.surface,
    alignItems: 'center',
    justifyContent: 'center',
  },
  rhBody: {
    gap: 2,
    paddingBottom: 10,
  },
  chipWrap: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
    marginBottom: 10,
  },
  miniChip: {
    paddingVertical: 7,
    paddingHorizontal: 12,
    borderRadius: 999,
    borderWidth: 1,
    borderColor: palette.border,
    backgroundColor: palette.surface,
  },
  miniChipOn: {
    backgroundColor: color.brand[600],
    borderColor: color.brand[600],
  },
  notesInput: {
    height: undefined,
    minHeight: 72,
    paddingTop: 12,
    textAlignVertical: 'top',
  },
});