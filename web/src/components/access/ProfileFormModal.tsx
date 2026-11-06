import { plural } from '../../lib/format';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { AlertTriangle, ShieldCheck, Trash2 } from 'lucide-react';
import { useState, type FormEvent } from 'react';
import { api } from '../../api/client';
import type { AccessCatalog, AccessProfile, CreateProfileBody, ScopeKind, UpdateProfileBody } from '../../api/types-access';
import { Button, ErrorNote, Field, inputCls, Modal } from '../form';
import { ConfirmModal, Pill } from '../org/shared';
import { MatrixEditor } from './MatrixEditor';
import {
  cellsOf,
  domainsWithoutConsult,
  matrixOf,
  normalizeProfileCode,
  profileCodeError,
  sameMatrix,
  scopeKindNote,
  scopeKindOpen,
} from './matrix';
import { invalidateAccess } from './queries';

/**
 * Creates or edits an access profile: code (creation only), label, scope
 * kind (fixed for a system profile, and once accounts use it), matrix. The
 * server's 400/409 come back in French.
 */
export function ProfileFormModal({
  catalog,
  profile,
  memberCount,
  readOnly,
  readOnlyReason,
  onClose,
  onSaved,
}: {
  catalog: AccessCatalog;
  profile: AccessProfile | null;
  /** Accounts using the profile (null: unknown). */
  memberCount: number | null;
  readOnly: boolean;
  readOnlyReason?: string;
  onClose: () => void;
  onSaved: (message: string) => void;
}) {
  const queryClient = useQueryClient();
  const [code, setCode] = useState(profile?.code ?? '');
  const [label, setLabel] = useState(profile?.label ?? '');
  const [scopeKind, setScopeKind] = useState<ScopeKind>(profile?.scopeKind ?? 'PROVINCES');
  const [cells, setCells] = useState<Set<string>>(() => cellsOf(profile?.matrix));
  const [formError, setFormError] = useState<string | null>(null);
  const [confirmDelete, setConfirmDelete] = useState(false);

  const matrix = matrixOf(cells, scopeKind);
  const noConsult = domainsWithoutConsult(matrix);
  const domainLabel = new Map(catalog.domains.map((d) => [d.code, d.label]));
  const scopeFixed = !!profile && (profile.system || (memberCount ?? 0) > 0);

  const save = useMutation({
    mutationFn: () => {
      if (!profile) {
        const body: CreateProfileBody = { code, label: label.trim(), scopeKind, matrix };
        return api.post<AccessProfile>('/programme/access/profiles', body);
      }
      const body: UpdateProfileBody = {};
      if (label.trim() !== profile.label) body.label = label.trim();
      if (!profile.system && scopeKind !== profile.scopeKind) body.scopeKind = scopeKind;
      if (!sameMatrix(matrix, profile.matrix) || body.scopeKind) body.matrix = matrix;
      return api.patch<AccessProfile>(`/programme/access/profiles/${profile.id}`, body);
    },
    onSuccess: (saved) => {
      invalidateAccess(queryClient);
      onSaved(profile ? `Profil « ${saved.label} » enregistré.` : `Profil « ${saved.label} » créé.`);
    },
  });

  const remove = useMutation({
    mutationFn: () => api.del(`/programme/access/profiles/${profile?.id}`),
    onSuccess: () => {
      invalidateAccess(queryClient);
      onSaved(`Profil « ${profile?.label} » supprimé.`);
    },
  });

  function onSubmit(e: FormEvent) {
    e.preventDefault();
    if (readOnly || save.isPending) return;
    const codeErr = profile ? null : profileCodeError(code);
    if (codeErr) return setFormError(codeErr);
    if (!label.trim()) return setFormError('Le libellé du profil est obligatoire.');
    if (!scopeKindOpen(scopeKind)) return setFormError('Le périmètre « opérateur » sera ouvert avec le module de traçabilité.');
    setFormError(null);
    save.mutate();
  }

  const title = profile ? (readOnly ? `Profil « ${profile.label} »` : `Modifier le profil « ${profile.label} »`) : 'Nouveau profil d’accès';

  return (
    <Modal title={title} onClose={onClose} large>
      <form onSubmit={onSubmit} className="space-y-5">
        {readOnly && readOnlyReason ? (
          <p className="rounded-lg bg-slate-50 px-3 py-2 text-sm text-slate-600 ring-1 ring-slate-200">{readOnlyReason}</p>
        ) : null}
        {profile?.system ? (
          <p className="flex flex-wrap items-center gap-2 text-sm text-slate-600">
            <Pill tone="brand">Profil système</Pill>
            Ses droits s’ajustent ; il ne se supprime pas et son périmètre ne change pas.
          </p>
        ) : null}

        <div className="grid gap-4 lg:grid-cols-3">
          <Field label="Code *" hint={profile ? 'Le code ne change plus.' : 'Majuscules, chiffres et « _ » (ex. AGENT_PROVINCIAL).'}>
            <input
              className={`${inputCls} font-mono`}
              value={code}
              onChange={(e) => setCode(normalizeProfileCode(e.target.value))}
              maxLength={40}
              disabled={!!profile || readOnly}
              placeholder="AGENT_PROVINCIAL"
              required
            />
          </Field>
          <Field label="Libellé *">
            <input
              className={inputCls}
              value={label}
              onChange={(e) => setLabel(e.target.value)}
              maxLength={120}
              disabled={readOnly}
              placeholder="Ex : Agent provincial"
              required
            />
          </Field>
          <Field
            label="Périmètre *"
            hint={
              profile?.system
                ? 'Fixé pour un profil système.'
                : scopeFixed
                  ? 'Des comptes utilisent ce profil : son périmètre ne change plus.'
                  : scopeKindNote(scopeKind)
            }
          >
            <select
              className={inputCls}
              value={scopeKind}
              onChange={(e) => setScopeKind(e.target.value as ScopeKind)}
              disabled={scopeFixed || readOnly}
            >
              {catalog.scopeKinds.map((k) => (
                <option key={k.code} value={k.code} disabled={!scopeKindOpen(k.code) && k.code !== scopeKind}>
                  {k.label}
                  {scopeKindOpen(k.code) ? '' : ' (bientôt)'}
                </option>
              ))}
            </select>
          </Field>
        </div>

        <div>
          <p className="mb-2 flex items-center gap-1.5 text-xs font-medium text-slate-600">
            <ShieldCheck className="h-3.5 w-3.5 text-brand-600" /> Droits par domaine
          </p>
          <MatrixEditor catalog={catalog} cells={cells} scopeKind={scopeKind} readOnly={readOnly} onChange={setCells} />
          <p className="mt-2 text-xs text-slate-500">
            Les domaines propres à Fermia (ventes, marché, comptabilité, équipe…) ne s’accordent jamais à un profil institutionnel.
          </p>
          {noConsult.length > 0 ? (
            <p className="mt-2 flex items-start gap-1.5 rounded-lg bg-amber-50 px-3 py-2 text-xs text-amber-800 ring-1 ring-amber-200">
              <AlertTriangle className="mt-0.5 h-3.5 w-3.5 shrink-0" />
              Sans « Consulter », les écrans de ces domaines restent hors du menu :{' '}
              {noConsult.map((d) => domainLabel.get(d) ?? d).join(', ')}.
            </p>
          ) : null}
        </div>

        <ErrorNote error={formError ?? save.error} />

        <div className="flex flex-wrap items-center justify-between gap-2">
          <div>
            {profile && !profile.system && !readOnly ? (
              <Button tone="secondary" className="!text-red-600" onClick={() => setConfirmDelete(true)} disabled={save.isPending}>
                <Trash2 className="h-4 w-4" /> Supprimer
              </Button>
            ) : null}
          </div>
          <div className="flex gap-2">
            <Button tone="secondary" onClick={onClose} disabled={save.isPending}>
              {readOnly ? 'Fermer' : 'Annuler'}
            </Button>
            {readOnly ? null : (
              <Button type="submit" busy={save.isPending}>
                {profile ? 'Enregistrer' : 'Créer le profil'}
              </Button>
            )}
          </div>
        </div>
      </form>

      {confirmDelete && profile ? (
        <ConfirmModal
          title="Supprimer le profil"
          message={
            memberCount
              ? `${plural(memberCount, 'compte')} ${memberCount < 2 ? 'utilise' : 'utilisent'} « ${profile.label} » : changez-les de profil avant de le supprimer.`
              : `Le profil « ${profile.label} » sera supprimé. Cette action est définitive.`
          }
          confirmLabel="Supprimer"
          busy={remove.isPending}
          error={remove.error}
          onConfirm={() => remove.mutate()}
          onCancel={() => {
            remove.reset();
            setConfirmDelete(false);
          }}
        />
      ) : null}
    </Modal>
  );
}
