import { useMutation, useQueryClient } from '@tanstack/react-query';
import {
  Briefcase,
  ChevronDown,
  ChevronUp,
  Coins,
  HandCoins,
  Landmark,
  Settings,
  ShieldCheck,
  Sprout,
  Stethoscope,
  UserCog,
  UserPlus,
  Users,
  Wheat,
  type LucideIcon,
} from 'lucide-react';
import { createElement, useState, type FormEvent } from 'react';
import { api } from '../../api/client';
import { useFarmProfile } from '../../app/useFarmProfile';
import type {
  BuildingOption,
  ContractType,
  FarmMember,
  PermissionCatalog,
  StaffProfile,
  StaffRole,
} from '../../api/types-org';
import { classNames } from '../../lib/format';
import { isGabonPhoneValid, normalizeGabonPhone } from '../../lib/phone';
import { Button, ErrorNote, Field, inputCls, Modal } from '../form';
import { ConfirmModal, CONTRACT_LABEL, CONTRACT_TYPES, invalidateFarm, Pill, STAFF_ROLE_LABEL } from './shared';

/** Same icon per permission group as the mobile settings screen. */
const GROUP_ICONS: Record<string, LucideIcon> = {
  production: Wheat,
  team: Users,
  rh: Briefcase,
  agriculture: Sprout,
  caisse: Coins,
  ventes: HandCoins,
  compta: Landmark,
  stock: Wheat,
  sanitaire: Stethoscope,
  reglages: Settings,
};

/** Not offered by the server: Administrator role with hand-picked rights. */
const CUSTOM_KEY = '__custom__';
const CUSTOM_PROFILE: StaffProfile = { key: CUSTOM_KEY, label: 'Profil personnalisé', role: 'ADMIN', jobTitle: '', permissions: [] };
/** Base rights of a new Administrator (mirror of the server's ADMIN_DEFAULT_PERMISSIONS). */
const ADMIN_BASE_PERMISSIONS = ['saisie:creer', 'caisse:lire', 'sanitaire:lecture', 'sanitaire:signaler'];

function matchProfileKey(member: FarmMember, profiles: StaffProfile[]): string {
  if (member.role === 'ELEVEUR') return 'eleveur';
  const mine = [...member.permissions].sort().join();
  return profiles.find((p) => p.role === 'ADMIN' && [...p.permissions].sort().join() === mine)?.key ?? CUSTOM_KEY;
}

/** Accepts "150 000"; returns null when empty, NaN when invalid. */
function parseSalary(raw: string): number | null {
  const digits = raw.replace(/\s/g, '');
  if (!digits) return null;
  return /^\d+$/.test(digits) ? Number(digits) : Number.NaN;
}

export function MemberFormModal({
  farmId,
  member,
  catalog,
  buildings,
  onClose,
  onSaved,
}: {
  farmId: string;
  member: FarmMember | null;
  catalog: PermissionCatalog | undefined;
  buildings: BuildingOption[];
  onClose: () => void;
  onSaved: (message: string) => void;
}) {
  const queryClient = useQueryClient();
  const { hasPermission } = useFarmProfile();
  const canEditHr = hasPermission('rh:gerer');
  // The server refuses to grant a right the caller doesn't hold: don't offer it.
  const canGrant = (codes: string[]) => codes.every((code) => hasPermission(code));
  const allProfiles = catalog?.profiles ?? [];
  const profiles = allProfiles.filter((p) => canGrant(p.permissions));
  // A new member defaults to Éleveur, whose fixed rights the caller must hold too.
  const eleveurGrantable = allProfiles.filter((p) => p.role === 'ELEVEUR').every((p) => canGrant(p.permissions));

  const [fullName, setFullName] = useState('');
  const [phone, setPhone] = useState('');
  const [code, setCode] = useState('');
  const [role, setRole] = useState<StaffRole>(member?.role ?? (eleveurGrantable ? 'ELEVEUR' : 'ADMIN'));
  const [profileKey, setProfileKey] = useState<string | null>(member ? matchProfileKey(member, profiles) : null);
  const [initialProfileKey] = useState(profileKey);
  const [permissions, setPermissions] = useState<Set<string>>(new Set(member?.role === 'ADMIN' ? member.permissions : []));
  const [jobTitle, setJobTitle] = useState(member?.jobTitle ?? '');
  const [building, setBuilding] = useState(member?.buildingAssignment ?? '');
  const [active, setActive] = useState(member?.active ?? true);
  const [department, setDepartment] = useState(member?.department ?? '');
  const [contractType, setContractType] = useState<ContractType | ''>(member?.contractType ?? '');
  const [hireDate, setHireDate] = useState(member?.hireDate ?? '');
  const [endDate, setEndDate] = useState(member?.endDate ?? '');
  const [salary, setSalary] = useState(member?.salaryFcfa != null ? String(member.salaryFcfa) : '');
  const [notes, setNotes] = useState(member?.notes ?? '');
  const hrFilled = Boolean(department.trim() || contractType || hireDate || endDate || salary.trim() || notes.trim());
  const [hrOpen, setHrOpen] = useState(hrFilled);
  const [formError, setFormError] = useState<string | null>(null);
  const [confirmSuspend, setConfirmSuspend] = useState(false);

  const applyProfile = (p: StaffProfile) => {
    const custom = p.key === CUSTOM_KEY;
    if (custom && profileKey === CUSTOM_KEY) return;
    setProfileKey(p.key);
    setRole(p.role);
    if (!custom) setJobTitle(p.jobTitle);
    setPermissions(new Set(custom ? ADMIN_BASE_PERMISSIONS.filter((code) => hasPermission(code)) : p.permissions));
  };

  const togglePermission = (permission: string) => {
    setProfileKey(CUSTOM_KEY);
    setPermissions((prev) => {
      const next = new Set(prev);
      if (next.has(permission)) next.delete(permission);
      else next.add(permission);
      return next;
    });
  };

  const profileToSend = profileKey && profileKey !== CUSTOM_KEY ? profileKey : undefined;

  const save = useMutation({
    mutationFn: async () => {
      const salaryFcfa = parseSalary(salary);
      if (member) {
        // Only what changed: sending role, profile or permissions makes the server
        // check that the caller holds all the member's rights, even when unchanged.
        const body: Record<string, unknown> = {};
        if (role !== member.role) body.role = role;
        if (profileToSend && profileToSend !== initialProfileKey) body.profileKey = profileToSend;
        const samePermissions =
          member.role === 'ADMIN' && permissions.size === member.permissions.length && member.permissions.every((code) => permissions.has(code));
        if (role === 'ADMIN' && !samePermissions) body.permissions = [...permissions];
        const putIfChanged = (key: string, next: string, prev: string | null) => {
          if (next.trim() !== (prev ?? '')) body[key] = next.trim() || null;
        };
        putIfChanged('jobTitle', jobTitle, member.jobTitle);
        putIfChanged('buildingAssignment', building, member.buildingAssignment);
        putIfChanged('department', department, member.department);
        putIfChanged('contractType', contractType, member.contractType);
        putIfChanged('hireDate', hireDate, member.hireDate);
        putIfChanged('endDate', endDate, member.endDate);
        putIfChanged('notes', notes, member.notes);
        if (active !== member.active) body.active = active;
        if (salaryFcfa !== member.salaryFcfa) body.salaryFcfa = salaryFcfa;
        await api.patch(`/farms/${farmId}/eleveurs/${member.id}`, body);
        return `Membre « ${member.user.fullName} » mis à jour.`;
      }
      await api.post(`/farms/${farmId}/eleveurs`, {
        fullName: fullName.trim(),
        phone: normalizeGabonPhone(phone),
        code: code.trim(),
        role,
        jobTitle: jobTitle.trim() || undefined,
        buildingAssignment: building || undefined,
        permissions: role === 'ADMIN' ? [...permissions] : undefined,
        profileKey: profileToSend,
        department: department.trim() || undefined,
        contractType: contractType || undefined,
        hireDate: hireDate || undefined,
        endDate: endDate || undefined,
        salaryFcfa: salaryFcfa ?? undefined,
        notes: notes.trim() || undefined,
      });
      return 'Compte créé et rattaché à la ferme.';
    },
    onSuccess: async (message) => {
      // Tasks read member names and the assignable team.
      await invalidateFarm(queryClient, farmId);
      onSaved(message);
    },
    onError: () => setConfirmSuspend(false),
  });

  const submit = (e: FormEvent) => {
    e.preventDefault();
    setFormError(null);
    if (!member) {
      if (!fullName.trim() || !phone.trim()) return setFormError('Nom et téléphone sont obligatoires.');
      if (!isGabonPhoneValid(normalizeGabonPhone(phone))) {
        return setFormError('Numéro invalide : 9 chiffres commençant par 0, par exemple 074 12 34 56.');
      }
      if (code.trim().length < 6) return setFormError('Le code doit contenir au moins 6 caractères.');
    }
    if (Number.isNaN(parseSalary(salary))) {
      setHrOpen(true);
      return setFormError('Salaire invalide : entier FCFA positif attendu.');
    }
    if (member?.active && !active) return setConfirmSuspend(true);
    save.mutate();
  };

  // Shown in place of the form (whose state stays alive): Esc must not close both.
  if (confirmSuspend && member) {
    return (
      <ConfirmModal
        title="Suspendre le membre"
        message={`${member.user.fullName} ne pourra plus accéder à la ferme ni recevoir de tâche.`}
        confirmLabel="Suspendre"
        busy={save.isPending}
        onConfirm={() => save.mutate()}
        onCancel={() => setConfirmSuspend(false)}
      />
    );
  }

  const buildingNames = buildings.map((b) => b.name);
  // A value typed before the picker existed stays selectable.
  if (member?.buildingAssignment && !buildingNames.includes(member.buildingAssignment)) {
    buildingNames.unshift(member.buildingAssignment);
  }

  return (
    <Modal
      wide
      title={member ? `Modifier ${member.user.fullName}` : 'Ajouter un membre'}
      onClose={() => !save.isPending && onClose()}
    >
      <form className="space-y-5" onSubmit={submit}>
        {profiles.length > 0 ? (
          <div>
            <p className="flex items-center gap-1.5 text-xs font-medium text-slate-600">
              <UserCog className="h-3.5 w-3.5 text-brand-600" /> Profil métier
            </p>
            <p className="mb-2 text-xs text-slate-400">Choisissez un profil : rôle, poste et droits sont pré-remplis.</p>
            <div className="grid grid-cols-2 gap-2 sm:grid-cols-3">
              {[...profiles, CUSTOM_PROFILE].map((p) => {
                const on = profileKey === p.key;
                const sub = p.key === CUSTOM_KEY ? 'Sur mesure' : p.role === 'ADMIN' ? `${p.permissions.length} droits` : 'Droits fixes';
                return (
                  <button
                    key={p.key}
                    type="button"
                    aria-pressed={on}
                    onClick={() => applyProfile(p)}
                    className={classNames(
                      'rounded-lg border px-3 py-2 text-left',
                      on ? 'border-brand-600 bg-brand-600 text-white' : 'border-slate-200 bg-white text-slate-700 hover:bg-slate-50',
                    )}
                  >
                    <span className="block text-sm font-semibold">{p.label}</span>
                    <span className={classNames('block text-xs', on ? 'text-brand-100' : 'text-slate-400')}>{sub}</span>
                  </button>
                );
              })}
            </div>
          </div>
        ) : null}

        <div className="grid gap-4 sm:grid-cols-2">
          {member ? null : (
            <>
              <Field label="Nom complet *" className="sm:col-span-2">
                <input className={inputCls} value={fullName} onChange={(e) => setFullName(e.target.value)} placeholder="Ex : Jean-Marc Ondo" required />
              </Field>
              <Field label="Téléphone *">
                <input className={inputCls} value={phone} onChange={(e) => setPhone(e.target.value)} placeholder="074 12 34 56" inputMode="tel" required />
              </Field>
              <Field label="Code secret * (6 caractères minimum)">
                <input type="password" autoComplete="new-password" className={inputCls} value={code} onChange={(e) => setCode(e.target.value)} required />
              </Field>
            </>
          )}
          <Field label="Intitulé du poste">
            <input className={inputCls} maxLength={80} value={jobTitle} onChange={(e) => setJobTitle(e.target.value)} placeholder="Ex : Comptable, Chef d’élevage…" />
          </Field>
          <Field label="Bâtiment assigné" hint={buildingNames.length === 0 ? 'Aucun bâtiment enregistré pour cette ferme.' : undefined}>
            <select className={inputCls} value={building} onChange={(e) => setBuilding(e.target.value)}>
              <option value="">Aucun</option>
              {buildingNames.map((name) => (
                <option key={name} value={name}>
                  {name}
                </option>
              ))}
            </select>
          </Field>
        </div>

        {member ? (
          <label className="flex items-start gap-3 rounded-lg border border-slate-200 px-3 py-2.5">
            <input type="checkbox" className="mt-0.5 h-4 w-4 accent-brand-600" checked={active} onChange={(e) => setActive(e.target.checked)} />
            <span>
              <span className="block text-sm font-semibold text-slate-800">Membre actif</span>
              <span className="block text-xs text-slate-500">Désactivé, le membre ne peut plus accéder à la ferme.</span>
            </span>
          </label>
        ) : null}

        {role === 'ADMIN' ? (
          <div>
            <p className="mb-2 flex items-center gap-1.5 text-xs font-medium text-slate-600">
              <ShieldCheck className="h-3.5 w-3.5 text-brand-600" /> Permissions de l’administrateur
            </p>
            <div className="space-y-4">
              {(catalog?.groups ?? []).map((group) => (
                <div key={group.key}>
                  <p className="mb-1 flex items-center gap-1.5 text-sm font-semibold text-slate-800">
                    {createElement(GROUP_ICONS[group.key] ?? ShieldCheck, { className: 'h-4 w-4 text-brand-600' })}
                    {group.label}
                  </p>
                  <div className="grid gap-x-4 gap-y-1 sm:grid-cols-2">
                    {group.items.filter((item) => hasPermission(item.code)).map((item) => (
                      <label key={item.code} className="flex items-start gap-2 rounded px-1 py-1 hover:bg-slate-50">
                        <input
                          type="checkbox"
                          className="mt-0.5 h-4 w-4 shrink-0 accent-brand-600"
                          checked={permissions.has(item.code)}
                          onChange={() => togglePermission(item.code)}
                        />
                        <span>
                          <span className="block text-sm text-slate-800">{item.label}</span>
                          <span className="block text-xs text-slate-400">{item.description}</span>
                        </span>
                      </label>
                    ))}
                  </div>
                </div>
              ))}
            </div>
          </div>
        ) : (
          <p className="text-xs text-slate-500">
            L’Éleveur dispose de droits fixes (saisie du jour, ventes, lecture caisse et sanitaire).
          </p>
        )}

        {canEditHr ? (
        <div className="rounded-lg border border-slate-200">
          <button type="button" onClick={() => setHrOpen((v) => !v)} aria-expanded={hrOpen} className="flex w-full items-center gap-3 px-3 py-2.5 text-left">
            <Briefcase className="h-4 w-4 shrink-0 text-brand-600" />
            <span className="min-w-0 flex-1">
              <span className="block text-sm font-semibold text-slate-800">Dossier RH</span>
              <span className="block text-xs text-slate-500">Contrat, poste, rémunération et notes</span>
            </span>
            <Pill tone={hrFilled ? 'emerald' : 'amber'}>{hrFilled ? 'Renseigné' : 'À compléter'}</Pill>
            {hrOpen ? <ChevronUp className="h-4 w-4 text-slate-400" /> : <ChevronDown className="h-4 w-4 text-slate-400" />}
          </button>
          {hrOpen ? (
            <div className="grid gap-4 border-t border-slate-100 p-3 sm:grid-cols-2">
              <Field label="Service / département">
                <input className={inputCls} maxLength={80} value={department} onChange={(e) => setDepartment(e.target.value)} placeholder="Ex : Production, Ventes…" />
              </Field>
              <Field label="Type de contrat">
                <select className={inputCls} value={contractType} onChange={(e) => setContractType(e.target.value as ContractType | '')}>
                  <option value="">Non renseigné</option>
                  {CONTRACT_TYPES.map((t) => (
                    <option key={t} value={t}>
                      {CONTRACT_LABEL[t]}
                    </option>
                  ))}
                </select>
              </Field>
              <Field label="Date d’embauche">
                <input type="date" className={inputCls} value={hireDate} onChange={(e) => setHireDate(e.target.value)} />
              </Field>
              <Field label="Fin de contrat">
                <input type="date" className={inputCls} value={endDate} onChange={(e) => setEndDate(e.target.value)} />
              </Field>
              <Field label="Salaire de référence (FCFA)">
                <input className={inputCls} inputMode="numeric" value={salary} onChange={(e) => setSalary(e.target.value)} placeholder="Ex : 150000" />
              </Field>
              <Field label="Observations" className="sm:col-span-2">
                <textarea className={inputCls} rows={3} maxLength={1000} value={notes} onChange={(e) => setNotes(e.target.value)} placeholder="Notes RH…" />
              </Field>
            </div>
          ) : null}
        </div>
        ) : null}

        <ErrorNote error={formError ?? save.error} />

        <div className="flex items-center justify-between gap-2">
          <span className="text-xs text-slate-400">Rôle : {STAFF_ROLE_LABEL[role]}</span>
          <div className="flex gap-2">
            <Button tone="secondary" onClick={onClose} disabled={save.isPending}>
              Annuler
            </Button>
            <Button type="submit" busy={save.isPending}>
              {save.isPending ? null : member ? <ShieldCheck className="h-4 w-4" /> : <UserPlus className="h-4 w-4" />}
              {member ? 'Enregistrer' : 'Créer le compte'}
            </Button>
          </div>
        </div>
      </form>
    </Modal>
  );
}
