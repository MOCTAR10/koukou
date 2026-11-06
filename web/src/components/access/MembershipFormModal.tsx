import { useMutation, useQueryClient } from '@tanstack/react-query';
import { AlertTriangle, UserPlus } from 'lucide-react';
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
import { grantRefusal, provinceGrantable, type Granter } from './grantRules';
import {
  accountChanges,
  dateFromValidUntil,
  isBuyerPhoneConflict,
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
 * back once), or changes an account's name, phone (its login) and e-mail and
 * its membership's profile, scope and validity. The scope fields follow the
 * profile's scope kind: provinces, farms or nothing. Profiles and provinces
 * the caller can't grant are greyed out (`grantRules.ts`); the server decides.
 */
export function MembershipFormModal({
  membership,
  profiles,
  provinces,
  knownFarms,
  granter,
  onClose,
  onCreated,
  onSaved,
}: {
  membership: Membership | null;
  profiles: AccessProfile[];
  provinces: ProvinceOption[];
  knownFarms: ReadonlyMap<string, string>;
  granter: Granter;
  onClose: () => void;
  onCreated: (created: CreatedMembership) => void;
  onSaved: (message: string) => void;
}) {
  const queryClient = useQueryClient();
  const initialAccount = {
    fullName: membership?.user?.fullName ?? '',
    phone: membership?.user?.phone ?? '',
    email: membership?.user?.email ?? null,
  };
  const [fullName, setFullName] = useState(initialAccount.fullName);
  const [phone, setPhone] = useState(initialAccount.phone);
  const [email, setEmail] = useState(initialAccount.email ?? '');
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
      const account = accountChanges({ fullName, phone, email }, initialAccount);
      if ('error' in account) throw new Error(account.error);
      const body: UpdateMembershipBody = { ...account.changes, ...scope };
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
    } else {
      const account = accountChanges({ fullName, phone, email }, initialAccount);
      if ('error' in account) err = account.error;
    }
    err ??= profile ? null : 'Choisissez un profil d’accès.';
    err ??= profile && profile.code !== membership?.profile?.code ? grantRefusal(granter, profile) : null;
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
  // Profiles the caller can't hand out (the account's current one stays selectable).
  const refused = new Map<string, string>();
  for (const p of profiles) {
    const why = p.code === membership?.profile?.code ? null : grantRefusal(granter, p);
    if (why) refused.set(p.code, why);
  }
  const option = (p: AccessProfile) => (
    <option key={p.id} value={p.code} disabled={refused.has(p.code)}>
      {p.label} — {SCOPE_KIND_LABELS[p.scopeKind]}
      {refused.has(p.code) ? ' (hors de vos droits)' : ''}
    </option>
  );
  const lockedProvinces = provinces.some((p) => !provinceGrantable(granter, p.code));
  const buyerPhone = isBuyerPhoneConflict(save.error);

  return (
    <Modal title={membership ? `Accès de ${membership.user?.fullName ?? 'ce compte'}` : 'Nouveau compte institutionnel'} onClose={onClose} large>
      <form onSubmit={onSubmit} className="space-y-5">
        <FormColumns>
          <div className="space-y-4">
            <div className="grid gap-4 sm:grid-cols-2">
              <Field label="Nom complet *" className="sm:col-span-2">
                <input className={inputCls} value={fullName} onChange={(e) => setFullName(e.target.value)} maxLength={120} placeholder="Ex : Agent DGE Estuaire" required />
              </Field>
              <Field
                label="Téléphone *"
                hint={
                  membership
                    ? 'C’est l’identifiant de connexion : la personne se connectera avec le nouveau numéro et son code actuel.'
                    : 'Sert à la connexion (et au code SMS, s’il est activé).'
                }
              >
                <input className={inputCls} value={phone} onChange={(e) => setPhone(e.target.value)} placeholder="074 12 34 56" inputMode="tel" autoComplete="off" required />
              </Field>
              <Field label="E-mail" hint={membership ? 'Vide : l’adresse est retirée du compte.' : undefined}>
                <input className={inputCls} type="email" value={email} onChange={(e) => setEmail(e.target.value)} placeholder="prenom.nom@institution.ga" autoComplete="off" />
              </Field>
            </div>

            <Field label="Profil d’accès *" hint={profile ? scopeKindNote(profile.scopeKind) : 'Les droits viennent du profil : modifiez-les dans l’onglet Profils.'}>
              <select className={inputCls} value={profileCode} onChange={(e) => setProfileCode(e.target.value)} required>
                <option value="">Choisir un profil…</option>
                {systemProfiles.length > 0 ? <optgroup label="Profils du programme">{systemProfiles.map(option)}</optgroup> : null}
                {customProfiles.length > 0 ? <optgroup label="Profils personnalisés">{customProfiles.map(option)}</optgroup> : null}
              </select>
            </Field>
            {refused.size > 0 ? (
              <details className="rounded-lg bg-slate-50 px-3 py-2 text-xs text-slate-600 ring-1 ring-slate-200">
                <summary className="cursor-pointer font-medium text-slate-700">
                  {refused.size === 1 ? 'Un profil ne peut pas être attribué par vous' : `${refused.size} profils ne peuvent pas être attribués par vous`}
                </summary>
                <ul className="mt-1.5 space-y-1">
                  {profiles
                    .filter((p) => refused.has(p.code))
                    .map((p) => (
                      <li key={p.id}>
                        <b>{p.label}</b> : {refused.get(p.code)?.replace(/^Accès refusé : /, '')}
                      </li>
                    ))}
                </ul>
              </details>
            ) : null}

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
                Les provinces du programme n’ont pas pu être chargées : vérifiez la connexion et rouvrez le formulaire.
              </p>
            ) : need === 'provinces' ? (
              <div className="grid grid-cols-1 gap-1.5 sm:grid-cols-2 lg:grid-cols-1">
                {provinces.map((p) => {
                  const on = provinceCodes.includes(p.code);
                  // A province out of the caller's scope can be removed, not added.
                  const locked = !on && !provinceGrantable(granter, p.code);
                  return (
                    <label
                      key={p.id}
                      title={locked ? 'Hors de votre périmètre' : undefined}
                      className={classNames(
                        'flex items-center gap-2.5 rounded-lg border px-3 py-2 text-sm',
                        locked
                          ? 'cursor-not-allowed border-slate-100 text-slate-400'
                          : on
                            ? 'cursor-pointer border-brand-300 bg-brand-50 text-brand-900'
                            : 'cursor-pointer border-slate-200 text-slate-700 hover:bg-slate-50',
                      )}
                    >
                      <input type="checkbox" className="h-4 w-4 accent-brand-600" checked={on} disabled={locked} onChange={() => toggleProvince(p.code)} />
                      <span className="font-mono text-xs text-slate-500">{p.code}</span> {p.name}
                    </label>
                  );
                })}
                {lockedProvinces ? <p className="text-xs text-slate-500">Grisées : provinces hors de votre périmètre.</p> : null}
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

        {buyerPhone && !formError ? (
          <div className="flex items-start gap-2 rounded-lg bg-amber-50 px-3 py-2.5 text-sm text-amber-900 ring-1 ring-amber-200">
            <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" />
            <span>
              <b>Ce numéro est celui d’un compte acheteur du Market.</b> Un numéro ne sert qu’à un seul compte, et un compte acheteur ne
              peut pas devenir un compte institutionnel : renseignez un autre numéro pour cette personne.
            </span>
          </div>
        ) : (
          <ErrorNote error={formError ?? save.error} />
        )}

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
