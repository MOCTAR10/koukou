import { plural } from '../../lib/format';
import { ChevronRight, Plus, ShieldCheck } from 'lucide-react';
import { useState } from 'react';
import type { AccessCatalog, AccessProfile, Membership } from '../../api/types-access';
import { SCOPE_KIND_LABELS } from '../../api/types-access';
import { Button, ErrorNote } from '../form';
import { Pill, SuccessNote } from '../org/shared';
import { Card, DataTable, EmptyState, Loading, Td, Th } from '../ui';
import { grantRefusal, type Granter } from './grantRules';
import { grantCount } from './matrix';
import { ProfileFormModal } from './ProfileFormModal';
import { useAccessCatalog, useAccessProfiles } from './queries';

/** List of access profiles; a row opens its form (read-only without ADMINISTRER, or on one's own profile). */
export function ProfilesView({
  canWrite,
  granter,
  ownProfileId,
  memberships,
}: {
  canWrite: boolean;
  /** An institutional admin edits only a profile it could grant (server `grantRefusal`). */
  granter: Granter;
  /** The caller's own profile (institutional admin): no self-edit. */
  ownProfileId: string | null;
  memberships: Membership[] | undefined;
}) {
  const catalog = useAccessCatalog();
  const profiles = useAccessProfiles();
  const [form, setForm] = useState<{ profile: AccessProfile | null } | null>(null);
  const [success, setSuccess] = useState<string | null>(null);

  const countOf = (p: AccessProfile): number | null =>
    memberships ? memberships.filter((m) => m.profile?.id === p.id).length : null;
  const rows = profiles.data ?? [];
  const scopeLabel = (c: AccessCatalog | undefined, kind: AccessProfile['scopeKind']) =>
    c?.scopeKinds.find((k) => k.code === kind)?.label ?? SCOPE_KIND_LABELS[kind];
  const domainLabels = new Map((catalog.data?.domains ?? []).map((d) => [d.code, d.label]));

  return (
    <div className="space-y-4">
      {success ? <SuccessNote>{success}</SuccessNote> : null}
      <ErrorNote error={profiles.error ?? catalog.error} />
      <Card className="overflow-hidden">
        <div className="flex flex-wrap items-center gap-2 border-b border-slate-100 px-4 py-3">
          <ShieldCheck className="h-4 w-4 text-slate-400" />
          <h2 className="text-sm font-semibold text-slate-700">Profils d’accès ({rows.length})</h2>
          <span className="text-xs text-slate-400">Chaque compte reçoit les droits de son profil.</span>
          {canWrite ? (
            <Button className="ml-auto" disabled={!catalog.data} onClick={() => { setSuccess(null); setForm({ profile: null }); }}>
              <Plus className="h-4 w-4" /> Nouveau profil
            </Button>
          ) : null}
        </div>
        {profiles.isLoading ? (
          <div className="p-4">
            <Loading label="Chargement des profils…" />
          </div>
        ) : rows.length === 0 ? (
          <div className="p-4">
            <EmptyState message="Aucun profil d’accès." icon={<ShieldCheck className="h-6 w-6" />} />
          </div>
        ) : (
          <DataTable>
            <thead className="bg-slate-50">
              <tr>
                <Th>Profil</Th>
                <Th>Périmètre</Th>
                <Th className="hidden lg:table-cell">Domaines</Th>
                <Th>Type</Th>
                <Th>Comptes</Th>
                <Th />
              </tr>
            </thead>
            <tbody>
              {rows.map((p) => {
                const domains = Object.keys(p.matrix) as Array<keyof typeof p.matrix>;
                const count = countOf(p);
                return (
                  <tr
                    key={p.id}
                    className="cursor-pointer border-t border-slate-100 align-top hover:bg-slate-50"
                    onClick={() => { setSuccess(null); setForm({ profile: p }); }}
                  >
                    <Td className="font-medium text-slate-900">
                      <button type="button" className="text-left" onClick={(e) => { e.stopPropagation(); setSuccess(null); setForm({ profile: p }); }}>
                        {p.label}
                        <span className="block font-mono text-xs font-normal text-slate-500">{p.code}</span>
                      </button>
                    </Td>
                    <Td label="Périmètre">{scopeLabel(catalog.data, p.scopeKind)}</Td>
                    <Td label="Domaines" className="md:max-lg:hidden">
                      <span className="text-xs text-slate-600">
                        {domains.length === 0
                          ? 'Aucun droit'
                          : `${plural(grantCount(p.matrix), 'droit')} : ${domains.map((d) => domainLabels.get(d) ?? d).join(', ')}`}
                      </span>
                    </Td>
                    <Td label="Type">{p.system ? <Pill tone="brand">Système</Pill> : <Pill>Personnalisé</Pill>}</Td>
                    <Td label="Comptes">{count ?? '—'}</Td>
                    <Td className="row-chevron text-right">
                      <ChevronRight className="ml-auto h-4 w-4 text-slate-400" />
                    </Td>
                  </tr>
                );
              })}
            </tbody>
          </DataTable>
        )}
      </Card>

      {form && catalog.data ? (
        <ProfileFormModal
          catalog={catalog.data}
          profile={form.profile}
          memberCount={form.profile ? countOf(form.profile) : null}
          readOnly={!canWrite || (!!form.profile && (form.profile.id === ownProfileId || !!grantRefusal(granter, form.profile)))}
          readOnlyReason={
            !canWrite
              ? 'Lecture seule : votre profil ne permet pas d’administrer les accès.'
              : form.profile?.id === ownProfileId
                ? 'C’est votre propre profil : un autre administrateur le modifie.'
                : form.profile && grantRefusal(granter, form.profile)
                  ? `Lecture seule. ${grantRefusal(granter, form.profile)}`
                  : undefined
          }
          onClose={() => setForm(null)}
          onSaved={(message) => {
            setForm(null);
            setSuccess(message);
          }}
        />
      ) : null}
    </div>
  );
}
