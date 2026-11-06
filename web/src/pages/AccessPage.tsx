import { KeyRound, ShieldCheck, Users } from 'lucide-react';
import { Navigate, NavLink, Route, Routes } from 'react-router-dom';
import { canAdministerAccess } from '../app/menu-access';
import { useInstitutionAccess } from '../app/useInstitutionAccess';
import { useAuth } from '../auth/AuthContext';
import { MembershipsView } from '../components/access/MembershipsView';
import { ProfilesView } from '../components/access/ProfilesView';
import type { Granter } from '../components/access/grantRules';
import { useMemberships } from '../components/access/queries';
import { PageHeader } from '../components/ui';
import { classNames } from '../lib/format';

const tabCls = ({ isActive }: { isActive: boolean }) =>
  classNames(
    'flex items-center gap-1.5 rounded-full px-3 py-1.5 text-xs font-semibold',
    isActive ? 'bg-slate-900 text-white' : 'bg-slate-100 text-slate-600 hover:bg-slate-200',
  );

/**
 * Institutional access of the programme (`/app/acces/comptes|profils`): the
 * platform admin, or an institution whose profile grants ADMINISTRATION
 * (Consulter to read, Administrer to change). The rights live in the
 * profiles' matrices, managed here, never in the app's code.
 */
export function AccessPage() {
  const { user } = useAuth();
  const { access } = useInstitutionAccess();
  const memberships = useMemberships();
  const canWrite = canAdministerAccess(user?.role, access?.profile, 'ADMINISTRER');
  const granter: Granter = { role: user?.role, access };

  return (
    <div className="space-y-6">
      <PageHeader
        title="Accès institutionnels"
        icon={<KeyRound className="h-6 w-6" />}
        subtitle="Comptes des institutions du programme et profils d’accès : qui voit quoi, sur quelles fermes."
      />

      <div className="flex flex-wrap items-center gap-2">
        <NavLink to="/app/acces/comptes" className={tabCls}>
          <Users className="h-3.5 w-3.5" /> Comptes
        </NavLink>
        <NavLink to="/app/acces/profils" className={tabCls}>
          <ShieldCheck className="h-3.5 w-3.5" /> Profils et droits
        </NavLink>
        {!canWrite ? <span className="text-xs text-slate-500">Lecture seule : votre profil ne permet pas d’administrer les accès.</span> : null}
      </div>

      <Routes>
        <Route index element={<Navigate to="comptes" replace />} />
        <Route
          path="comptes"
          element={
            <MembershipsView
              memberships={memberships.data ?? []}
              loading={memberships.isLoading}
              error={memberships.error}
              canWrite={canWrite}
              granter={granter}
              selfUserId={user?.role === 'INSTITUTION' ? user.id : null}
            />
          }
        />
        <Route path="profils" element={<ProfilesView canWrite={canWrite} granter={granter} ownProfileId={access?.profile.id ?? null} memberships={memberships.data} />} />
        <Route path="*" element={<Navigate to="comptes" replace />} />
      </Routes>
    </div>
  );
}
