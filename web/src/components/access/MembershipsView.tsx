import { useMutation, useQueryClient } from '@tanstack/react-query';
import { ChevronRight, KeyRound, Pencil, PlayCircle, PauseCircle, UserPlus, Users } from 'lucide-react';
import { useMemo, useState } from 'react';
import { api } from '../../api/client';
import type { AccessProfile, CreatedMembership, LoginCodeReset, Membership, ProvinceOption } from '../../api/types-access';
import { SCOPE_KIND_LABELS } from '../../api/types-access';
import { useFarm } from '../../app/FarmContext';
import { dateFr } from '../../lib/format';
import { Button, ErrorNote, inlineInputCls, inputCls, Modal } from '../form';
import { ConfirmModal, Pill, SuccessNote } from '../org/shared';
import { ONE_TIME_CODE_MUTATION, OneTimeCodeModal, useOneTimeCode } from '../login-code/OneTimeCodeModal';
import { Card, DataTable, EmptyState, Loading, Td, Th } from '../ui';
import { farmLabel } from './FarmMultiPicker';
import {
  dateFromValidUntil,
  MEMBERSHIP_STATUS_LABEL,
  membershipMatches,
  membershipStatus,
  NO_FILTERS,
  type MembershipFilters,
  type MembershipStatus,
} from './matrix';
import { MembershipFormModal } from './MembershipFormModal';
import { invalidateAccess, useAccessProfiles, useProvinces } from './queries';

const STATUS_TONE: Record<MembershipStatus, 'emerald' | 'amber' | 'red' | 'slate'> = {
  ACTIVE: 'emerald',
  EXPIRED: 'amber',
  SUSPENDED: 'red',
  ACCOUNT_SUSPENDED: 'red',
};

function StatusPill({ m }: { m: Membership }) {
  const s = membershipStatus(m);
  return <Pill tone={STATUS_TONE[s]}>{MEMBERSHIP_STATUS_LABEL[s]}</Pill>;
}

/** Validity of a membership for the list: `jusqu’au 31 déc. 2026` or « Sans limite ». */
function validityText(m: Membership): string {
  return m.validUntil ? `Jusqu’au ${dateFr(dateFromValidUntil(m.validUntil))}` : 'Sans limite';
}

/** What the account reaches, in a few words. */
function scopeText(m: Membership, farmName: (id: string) => string): string {
  const kind = m.profile?.scopeKind;
  if (kind === 'PROVINCES') return m.provinceCodes.length ? m.provinceCodes.join(', ') : '—';
  if (kind === 'FARMS') {
    if (m.farmIds.length === 1) return farmName(m.farmIds[0] ?? '');
    return `${m.farmIds.length} fermes`;
  }
  return kind ? SCOPE_KIND_LABELS[kind] : '—';
}

/**
 * Institutional accounts: filters, creation (login code shown once),
 * details, edit, suspension and, for the platform admin, a new login code.
 */
export function MembershipsView({
  memberships,
  loading,
  error,
  canWrite,
  canResetCode,
  selfUserId,
}: {
  memberships: Membership[];
  loading: boolean;
  error: unknown;
  canWrite: boolean;
  /** `POST /admin/users/:id/login-code` is the platform admin's. */
  canResetCode: boolean;
  selfUserId: string | null;
}) {
  const profiles = useAccessProfiles();
  const provinces = useProvinces();
  const { farms } = useFarm();
  const [filters, setFilters] = useState<MembershipFilters>(NO_FILTERS);
  const [detailId, setDetailId] = useState<string | null>(null);
  const [form, setForm] = useState<{ membership: Membership | null } | null>(null);
  const [code, dispatch] = useOneTimeCode();
  const revealCode = (title: string, holder: { fullName: string; phone: string }, loginCode: string, regenerated: boolean) =>
    dispatch({ type: 'reveal', code: loginCode, holder, title, regenerated });
  const [success, setSuccess] = useState<string | null>(null);

  // Farm names and provinces from the farm list (every farm for an admin of the whole programme).
  const knownFarms = useMemo(() => new Map(farms.map((f) => [f.id, farmLabel({ code: f.code, name: f.name })])), [farms]);
  const farmProvince = useMemo(() => new Map(farms.map((f) => [f.id, f.provinceCode ?? null])), [farms]);
  const farmName = (id: string) => knownFarms.get(id) ?? 'Ferme du programme';

  const rows = memberships.filter((m) => membershipMatches(m, filters, (id) => farmProvince.get(id) ?? null));
  const detail = memberships.find((m) => m.id === detailId) ?? null;
  const filtered = rows.length !== memberships.length;

  const open = (m: Membership) => {
    setSuccess(null);
    setDetailId(m.id);
  };

  return (
    <div className="space-y-4">
      {success ? <SuccessNote>{success}</SuccessNote> : null}
      <ErrorNote error={error ?? profiles.error} />

      <Card className="overflow-hidden">
        <div className="flex flex-wrap items-center gap-2 border-b border-slate-100 px-4 py-3">
          <Users className="h-4 w-4 text-slate-400" />
          <h2 className="text-sm font-semibold text-slate-700">
            Comptes institutionnels ({filtered ? `${rows.length} sur ${memberships.length}` : memberships.length})
          </h2>
          {canWrite ? (
            <Button className="ml-auto" disabled={!profiles.data} onClick={() => { setSuccess(null); setForm({ membership: null }); }}>
              <UserPlus className="h-4 w-4" /> Nouveau compte
            </Button>
          ) : null}
        </div>

        <div className="flex flex-wrap items-end gap-2 border-b border-slate-100 bg-slate-50/60 px-4 py-3">
          <input
            className={`${inlineInputCls} w-full sm:w-56`}
            type="search"
            value={filters.q}
            onChange={(e) => setFilters({ ...filters, q: e.target.value })}
            placeholder="Nom, téléphone, e-mail…"
            aria-label="Rechercher un compte"
          />
          <select
            className={`${inlineInputCls} w-full sm:w-auto`}
            value={filters.profileCode}
            onChange={(e) => setFilters({ ...filters, profileCode: e.target.value })}
            aria-label="Profil"
          >
            <option value="">Tous les profils</option>
            {(profiles.data ?? []).map((p: AccessProfile) => (
              <option key={p.id} value={p.code}>
                {p.label}
              </option>
            ))}
          </select>
          <select
            className={`${inlineInputCls} w-full sm:w-auto`}
            value={filters.province}
            onChange={(e) => setFilters({ ...filters, province: e.target.value })}
            aria-label="Province"
          >
            <option value="">Toutes les provinces</option>
            {(provinces.data ?? []).map((p: ProvinceOption) => (
              <option key={p.id} value={p.code}>
                {p.code} · {p.name}
              </option>
            ))}
          </select>
          <select
            className={`${inlineInputCls} w-full sm:w-auto`}
            value={filters.status}
            onChange={(e) => setFilters({ ...filters, status: e.target.value as MembershipFilters['status'] })}
            aria-label="Statut"
          >
            <option value="">Tous les statuts</option>
            <option value="ACTIVE">Actifs</option>
            <option value="INACTIVE">Suspendus ou expirés</option>
          </select>
          {filtered ? (
            <Button tone="secondary" onClick={() => setFilters(NO_FILTERS)}>
              Effacer les filtres
            </Button>
          ) : null}
        </div>

        {loading ? (
          <div className="p-4">
            <Loading label="Chargement des comptes…" />
          </div>
        ) : rows.length === 0 ? (
          <div className="p-4">
            <EmptyState
              message={memberships.length === 0 ? 'Aucun compte institutionnel pour l’instant.' : 'Aucun compte ne correspond aux filtres.'}
              icon={<Users className="h-6 w-6" />}
            />
          </div>
        ) : (
          <DataTable>
            <thead className="bg-slate-50">
              <tr>
                <Th>Nom</Th>
                <Th>Profil</Th>
                <Th>Périmètre</Th>
                <Th className="hidden lg:table-cell">Validité</Th>
                <Th>Statut</Th>
                <Th />
              </tr>
            </thead>
            <tbody>
              {rows.map((m) => (
                <tr key={m.id} className="cursor-pointer border-t border-slate-100 align-top hover:bg-slate-50" onClick={() => open(m)}>
                  <Td className="font-medium text-slate-900">
                    <button type="button" className="text-left" onClick={(e) => { e.stopPropagation(); open(m); }}>
                      {m.user?.fullName ?? '—'}
                      {m.user?.id === selfUserId ? <span className="ml-1.5 text-xs font-normal text-slate-400">(vous)</span> : null}
                      <span className="block text-xs font-normal text-slate-500">{m.user?.phone}</span>
                    </button>
                  </Td>
                  <Td label="Profil">{m.profile?.label ?? '—'}</Td>
                  <Td label="Périmètre">
                    <span className="text-sm">{scopeText(m, farmName)}</span>
                  </Td>
                  <Td label="Validité" className="whitespace-nowrap md:max-lg:hidden">
                    {validityText(m)}
                  </Td>
                  <Td label="Statut">
                    <StatusPill m={m} />
                  </Td>
                  <Td className="row-chevron text-right">
                    <ChevronRight className="ml-auto h-4 w-4 text-slate-400" />
                  </Td>
                </tr>
              ))}
            </tbody>
          </DataTable>
        )}
      </Card>

      {detail ? (
        <MembershipPanel
          membership={detail}
          provinces={provinces.data ?? []}
          farmName={farmName}
          canWrite={canWrite && detail.user?.id !== selfUserId}
          isSelf={detail.user?.id === selfUserId}
          canResetCode={canResetCode}
          onClose={() => setDetailId(null)}
          onEdit={() => setForm({ membership: detail })}
          onCode={(holder, loginCode) => revealCode('Nouveau code de connexion', holder, loginCode, true)}
          onDone={setSuccess}
        />
      ) : null}

      {form ? (
        <MembershipFormModal
          membership={form.membership}
          profiles={profiles.data ?? []}
          provinces={provinces.data ?? []}
          knownFarms={knownFarms}
          onClose={() => setForm(null)}
          onCreated={(created: CreatedMembership) => {
            setForm(null);
            setSuccess(`Compte de ${created.user?.fullName ?? ''} créé.`);
            revealCode(
              'Compte créé : code de connexion',
              { fullName: created.user?.fullName ?? '', phone: created.user?.phone ?? '' },
              created.loginCode,
              false,
            );
          }}
          onSaved={(message) => {
            setForm(null);
            setSuccess(message);
          }}
        />
      ) : null}

      <OneTimeCodeModal
        state={code}
        dispatch={dispatch}
        recoveryHint="En cas de perte, générez-en un nouveau depuis la fiche du compte : l’ancien cessera alors de fonctionner."
      />
    </div>
  );
}

function MembershipPanel({
  membership: m,
  provinces,
  farmName,
  canWrite,
  isSelf,
  canResetCode,
  onClose,
  onEdit,
  onCode,
  onDone,
}: {
  membership: Membership;
  provinces: ProvinceOption[];
  farmName: (id: string) => string;
  canWrite: boolean;
  isSelf: boolean;
  canResetCode: boolean;
  onClose: () => void;
  onEdit: () => void;
  onCode: (holder: { fullName: string; phone: string }, loginCode: string) => void;
  onDone: (message: string) => void;
}) {
  const queryClient = useQueryClient();
  const [confirm, setConfirm] = useState<'suspend' | 'code' | null>(null);
  const [farmQuery, setFarmQuery] = useState('');
  const kind = m.profile?.scopeKind;
  const provinceName = new Map(provinces.map((p) => [p.code, p.name]));
  const name = m.user?.fullName ?? 'ce compte';

  const setActive = useMutation({
    mutationFn: (active: boolean) => api.patch<Membership>(`/programme/access/memberships/${m.id}`, { active }),
    onSuccess: (saved) => {
      invalidateAccess(queryClient);
      setConfirm(null);
      onDone(saved.active ? `Accès de ${name} réactivé.` : `Accès de ${name} suspendu.`);
    },
  });

  const resetCode = useMutation({
    ...ONE_TIME_CODE_MUTATION,
    mutationFn: () => api.post<LoginCodeReset>(`/admin/users/${m.user?.id}/login-code`),
    onSuccess: (res) => {
      setConfirm(null);
      onCode(res.user, res.loginCode);
      // The code now lives in the dialog's state only.
      resetCode.reset();
    },
  });

  const farms = m.farmIds.map((id) => ({ id, label: farmName(id) }));
  const shownFarms = farmQuery.trim()
    ? farms.filter((f) => f.label.toLowerCase().includes(farmQuery.trim().toLowerCase()))
    : farms;

  return (
    <Modal title={name} onClose={onClose} side>
      <div className="space-y-5">
        <div className="flex flex-wrap items-center gap-2">
          <StatusPill m={m} />
          {m.profile ? <Pill tone="brand">{m.profile.label}</Pill> : null}
          {isSelf ? <Pill>Votre compte</Pill> : null}
        </div>

        <dl className="divide-y divide-slate-100 rounded-xl border border-slate-200 text-sm">
          {[
            ['Téléphone', m.user?.phone ?? '—'],
            ['E-mail', m.user?.email ?? '—'],
            ['Profil', m.profile ? `${m.profile.label} (${m.profile.code})` : '—'],
            ['Périmètre', kind ? SCOPE_KIND_LABELS[kind] : '—'],
            ['Validité', validityText(m)],
            ['Créé le', dateFr(m.createdAt)],
          ].map(([k, v]) => (
            <div key={k} className="flex gap-3 px-3 py-2">
              <dt className="w-28 shrink-0 text-slate-500">{k}</dt>
              <dd className="min-w-0 break-words font-medium text-slate-800">{v}</dd>
            </div>
          ))}
        </dl>

        {kind === 'PROVINCES' ? (
          <div>
            <h3 className="mb-1.5 text-xs font-semibold uppercase tracking-wide text-slate-500">Provinces</h3>
            <div className="flex flex-wrap gap-1.5">
              {m.provinceCodes.map((c) => (
                <Pill key={c}>
                  {c} · {provinceName.get(c) ?? c}
                </Pill>
              ))}
            </div>
          </div>
        ) : null}
        {kind === 'FARMS' ? (
          <div>
            <h3 className="mb-1.5 text-xs font-semibold uppercase tracking-wide text-slate-500">Fermes ({farms.length})</h3>
            {farms.length > 8 ? (
              <input className={`${inputCls} mb-2`} type="search" value={farmQuery} onChange={(e) => setFarmQuery(e.target.value)} placeholder="Filtrer les fermes…" />
            ) : null}
            <ul className="max-h-60 space-y-1 overflow-y-auto text-sm text-slate-700">
              {shownFarms.map((f) => (
                <li key={f.id} className="rounded bg-slate-50 px-2 py-1">
                  {f.label}
                </li>
              ))}
            </ul>
          </div>
        ) : null}

        {isSelf ? (
          <p className="rounded-lg bg-slate-50 px-3 py-2 text-sm text-slate-600 ring-1 ring-slate-200">
            Votre propre accès ne se modifie pas d’ici : un autre administrateur s’en charge.
          </p>
        ) : null}

        <ErrorNote error={setActive.error} />

        <div className="flex flex-wrap gap-2">
          {canWrite ? (
            <>
              <Button tone="secondary" onClick={onEdit}>
                <Pencil className="h-4 w-4" /> Modifier l’accès
              </Button>
              {m.active ? (
                <Button tone="secondary" className="!text-red-600" onClick={() => setConfirm('suspend')}>
                  <PauseCircle className="h-4 w-4" /> Suspendre
                </Button>
              ) : (
                <Button tone="secondary" busy={setActive.isPending} onClick={() => setActive.mutate(true)}>
                  <PlayCircle className="h-4 w-4" /> Réactiver
                </Button>
              )}
            </>
          ) : null}
          {canResetCode && m.user && !isSelf ? (
            <Button tone="secondary" onClick={() => setConfirm('code')}>
              <KeyRound className="h-4 w-4" /> Nouveau code de connexion
            </Button>
          ) : null}
        </div>
      </div>

      {confirm === 'suspend' ? (
        <ConfirmModal
          title="Suspendre l’accès"
          message={`${name} ne pourra plus rien consulter ni saisir dans le programme jusqu’à sa réactivation. Le compte et son historique sont conservés.`}
          confirmLabel="Suspendre"
          busy={setActive.isPending}
          error={setActive.error}
          onConfirm={() => setActive.mutate(false)}
          onCancel={() => {
            setActive.reset();
            setConfirm(null);
          }}
        />
      ) : null}
      {confirm === 'code' ? (
        <ConfirmModal
          title="Générer un nouveau code"
          message={`Le code actuel de ${name} cessera aussitôt de fonctionner. Le nouveau code ne s’affichera qu’une fois.`}
          confirmLabel="Générer le code"
          busy={resetCode.isPending}
          error={resetCode.error}
          onConfirm={() => resetCode.mutate()}
          onCancel={() => {
            resetCode.reset();
            setConfirm(null);
          }}
        />
      ) : null}
    </Modal>
  );
}
