import { useMutation, useQueryClient } from '@tanstack/react-query';
import { UserPlus } from 'lucide-react';
import { useState, type FormEvent } from 'react';
import { api } from '../../api/client';
import {
  SCOPE_KIND_LABELS,
  type AccessProfile,
  type CreatedMembership,
  type CreateMembershipBody,
  type Membership,
  type ProvinceOption,
  type UpdateMembershipBody,
} from '../../api/types-access';
import { classNames } from '../../lib/format';
import { Button, ErrorNote, Field, FormColumns, inputCls, Modal } from '../form';
import { ONE_TIME_CODE_MUTATION } from '../login-code/OneTimeCodeModal';
import { FarmMultiPicker } from './FarmMultiPicker';
import {
  dateFromValidUntil,
  membershipPhone,
  membershipScopeError,
  scopeFieldsOf,
  scopeKindNote,
  scopeRequirement,
  validUntilError,
  validUntilFromDate,
} from './matrix';
import { invalidateAccess } from './queries';

/**
 * Creates an institutional account and its membership (the login code comes
 * back once), or changes a membership's profile, scope and validity. The
 * scope fields follow the profile's scope kind: provinces, farms or nothing.
 */
export function MembershipFormModal({
  membership,
  profiles,
  provinces,
  knownFarms,
  onClose,
  onCreated,
  onSaved,
}: {
  membership: Membership | null;
  profiles: AccessProfile[];
  provinces: ProvinceOption[];
  knownFarms: ReadonlyMap<string, string>;
  onClose: () => void;
  onCreated: (created: CreatedMembership) => void;
  onSaved: (message: string) => void;
}) {
  const queryClient = useQueryClient();
  const [fullName, setFullName] = useState('');
  const [phone, setPhone] = useState('');
  const [email, setEmail] = useState('');
  const [profileCode, setProfileCode] = useState(membership?.profile?.code ?? '');
  const [provinceCodes, setProvinceCodes] = useState<string[]>(membership?.provinceCodes ?? []);
  const [farmIds, setFarmIds] = useState<string[]>(membership?.farmIds ?? []);
  const [validDate, setValidDate] = useState(dateFromValidUntil(membership?.validUntil));
  const [formError, setFormError] = useState<string | null>(null);

  const profile = profiles.find((p) => p.code === profileCode) ?? null;
  const kind = profile?.scopeKind ?? null;
  const need = scopeRequirement(kind);
  const initialDate = dateFromValidUntil(membership?.validUntil);

  const save = useMutation({
    // A creation answers the login code: never kept once the form closes.
    ...ONE_TIME_CODE_MUTATION,
    mutationFn: async (): Promise<CreatedMembership | Membership> => {
      const scope = scopeFieldsOf(kind, provinceCodes, farmIds);
      if (!membership) {
        const tel = membershipPhone(phone);
        if ('error' in tel) throw new Error(tel.error);
        const body: CreateMembershipBody = {
          fullName: fullName.trim(),
          phone: tel.phone,
          profileCode,
          ...scope,
          ...(email.trim() ? { email: email.trim() } : {}),
          ...(validDate ? { validUntil: validUntilFromDate(validDate) } : {}),
        };
        return api.post<CreatedMembership>('/programme/access/memberships', body);
      }
      const body: UpdateMembershipBody = { ...scope };
      if (profileCode !== membership.profile?.code) body.profileCode = profileCode;
      if (validDate !== initialDate) body.validUntil = validUntilFromDate(validDate);
      return api.patch<Membership>(`/programme/access/memberships/${membership.id}`, body);
    },
    onSuccess: (saved) => {
      invalidateAccess(queryClient);
      if ('loginCode' in saved && saved.loginCode) onCreated(saved);
      else onSaved(`Accès de ${saved.user?.fullName ?? 'ce compte'} enregistré.`);
    },
  });

  function onSubmit(e: FormEvent) {
    e.preventDefault();
    if (save.isPending) return;
    let err: string | null = null;
    if (!membership) {
      if (!fullName.trim()) err = 'Le nom complet est obligatoire.';
      else {
        const tel = membershipPhone(phone);
        if ('error' in tel) err = tel.error;
      }
    }
    err ??= profile ? null : 'Choisissez un profil d’accès.';
    err ??= membershipScopeError(kind, provinceCodes, farmIds);
    err ??= validDate !== initialDate ? validUntilError(validDate) : null;
    if (err) return setFormError(err);
    setFormError(null);
    save.mutate();
  }

  const toggleProvince = (code: string) =>
    setProvinceCodes((cur) => (cur.includes(code) ? cur.filter((c) => c !== code) : [...cur, code]));

  const systemProfiles = profiles.filter((p) => p.system);
  const customProfiles = profiles.filter((p) => !p.system);
  const option = (p: AccessProfile) => (
    <option key={p.id} value={p.code}>
      {p.label} — {SCOPE_KIND_LABELS[p.scopeKind]}
    </option>
  );

  return (
    <Modal title={membership ? `Accès de ${membership.user?.fullName ?? 'ce compte'}` : 'Nouveau compte institutionnel'} onClose={onClose} large>
      <form onSubmit={onSubmit} className="space-y-5">
        <FormColumns>
          <div className="space-y-4">
            {membership ? (
              <div className="rounded-lg bg-slate-50 px-3 py-2.5 text-sm ring-1 ring-slate-200">
                <p className="font-semibold text-slate-900">{membership.user?.fullName}</p>
                <p className="text-slate-600">
                  {membership.user?.phone}
                  {membership.user?.email ? ` · ${membership.user.email}` : ''}
                </p>
                <p className="mt-1 text-xs text-slate-500">Le nom et le téléphone d’un compte ne se modifient pas ici.</p>
              </div>
            ) : (
              <div className="grid gap-4 sm:grid-cols-2">
                <Field label="Nom complet *" className="sm:col-span-2">
                  <input className={inputCls} value={fullName} onChange={(e) => setFullName(e.target.value)} maxLength={120} placeholder="Ex : Agent DGE Estuaire" required />
                </Field>
                <Field label="Téléphone *" hint="Sert à la connexion (et au code SMS, s’il est activé).">
                  <input className={inputCls} value={phone} onChange={(e) => setPhone(e.target.value)} placeholder="074 12 34 56" inputMode="tel" autoComplete="off" required />
                </Field>
                <Field label="E-mail">
                  <input className={inputCls} type="email" value={email} onChange={(e) => setEmail(e.target.value)} placeholder="prenom.nom@institution.ga" autoComplete="off" />
                </Field>
              </div>
            )}

            <Field label="Profil d’accès *" hint={profile ? scopeKindNote(profile.scopeKind) : 'Les droits viennent du profil : modifiez-les dans l’onglet Profils.'}>
              <select className={inputCls} value={profileCode} onChange={(e) => setProfileCode(e.target.value)} required>
                <option value="">Choisir un profil…</option>
                {systemProfiles.length > 0 ? <optgroup label="Profils du programme">{systemProfiles.map(option)}</optgroup> : null}
                {customProfiles.length > 0 ? <optgroup label="Profils personnalisés">{customProfiles.map(option)}</optgroup> : null}
              </select>
            </Field>

            <Field label="Fin de validité" hint="Vide : sans limite. L’accès cesse à la fin de ce jour.">
              <div className="flex gap-2">
                <input type="date" className={inputCls} value={validDate} onChange={(e) => setValidDate(e.target.value)} />
                {validDate ? (
                  <Button tone="secondary" className="shrink-0" onClick={() => setValidDate('')}>
                    Sans limite
                  </Button>
                ) : null}
              </div>
            </Field>
          </div>

          <div className="space-y-2">
            <p className="text-xs font-medium text-slate-600">
              Périmètre{need === 'provinces' ? ' : provinces *' : need === 'farms' ? ' : fermes *' : ''}
            </p>
            {!profile ? (
              <p className="rounded-lg border border-dashed border-slate-300 px-3 py-4 text-sm text-slate-500">Choisissez d’abord un profil.</p>
            ) : need === 'provinces' && provinces.length === 0 ? (
              <p className="rounded-lg bg-amber-50 px-3 py-3 text-sm text-amber-800 ring-1 ring-amber-200">
                Les provinces du programme n’ont pas pu être chargées (il faut le droit « Paramètres du programme : Consulter »).
              </p>
            ) : need === 'provinces' ? (
              <div className="grid grid-cols-1 gap-1.5 sm:grid-cols-2 lg:grid-cols-1">
                {provinces.map((p) => {
                  const on = provinceCodes.includes(p.code);
                  return (
                    <label
                      key={p.id}
                      className={classNames(
                        'flex cursor-pointer items-center gap-2.5 rounded-lg border px-3 py-2 text-sm',
                        on ? 'border-brand-300 bg-brand-50 text-brand-900' : 'border-slate-200 text-slate-700 hover:bg-slate-50',
                      )}
                    >
                      <input type="checkbox" className="h-4 w-4 accent-brand-600" checked={on} onChange={() => toggleProvince(p.code)} />
                      <span className="font-mono text-xs text-slate-500">{p.code}</span> {p.name}
                    </label>
                  );
                })}
              </div>
            ) : need === 'farms' ? (
              <FarmMultiPicker value={farmIds} onChange={setFarmIds} known={knownFarms} />
            ) : (
              <p className="rounded-lg bg-slate-50 px-3 py-3 text-sm text-slate-600 ring-1 ring-slate-200">
                {SCOPE_KIND_LABELS[profile.scopeKind]} : aucune liste à tenir.
              </p>
            )}
          </div>
        </FormColumns>

        <ErrorNote error={formError ?? save.error} />

        <div className="flex justify-end gap-2">
          <Button tone="secondary" onClick={onClose} disabled={save.isPending}>
            Annuler
          </Button>
          <Button type="submit" busy={save.isPending}>
            {save.isPending ? null : membership ? null : <UserPlus className="h-4 w-4" />}
            {membership ? 'Enregistrer' : 'Créer le compte'}
          </Button>
        </div>
      </form>
    </Modal>
  );
}
