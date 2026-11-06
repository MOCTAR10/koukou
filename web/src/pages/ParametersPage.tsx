import { Gauge, ListChecks, Map as MapIcon, SlidersHorizontal } from 'lucide-react';
import { Navigate, NavLink, Route, Routes } from 'react-router-dom';
import { useMenuAccess } from '../app/useMenuAccess';
import { ListsView } from '../components/admin/ListsView';
import { ParametersView } from '../components/admin/ParametersView';
import { TerritoriesView } from '../components/admin/TerritoriesView';
// POUFA lot A droits (F8): Fermia conduct thresholds tab.
import { ThresholdsView } from '../components/admin/ThresholdsView';
import { Loading, PageHeader } from '../components/ui';
import { classNames } from '../lib/format';

const tabCls = ({ isActive }: { isActive: boolean }) =>
  classNames(
    'flex items-center gap-1.5 rounded-full px-3 py-1.5 text-xs font-semibold',
    isActive ? 'bg-slate-900 text-white' : 'bg-slate-100 text-slate-600 hover:bg-slate-200',
  );

/**
 * Programme settings without development (CDC §7.3): versioned parameters
 * (`/app/parametres`), configurable lists (`/app/parametres/listes`) and
 * provinces / localités (`/app/parametres/territoires`), and the Fermia
 * conduct thresholds (`/app/parametres/seuils`, POUFA lot A droits). Platform admin, or
 * an institution granted PARAMETRES (parameters) or ADMINISTRATION (lists,
 * territories); the server checks every write (owner profile, ADMINISTRER).
 */
export function ParametersPage() {
  const { admin, isLoading } = useMenuAccess();
  const { parameters, lists } = admin;
  if (!parameters.view && !lists.view) return isLoading ? <Loading /> : <Navigate to="/app" replace />;

  return (
    <div className="space-y-6">
      <PageHeader
        title="Paramètres du programme"
        icon={<SlidersHorizontal />}
        subtitle="Seuils, fréquences, formules, listes et territoires du programme POUFA, modifiables sans développement. Chaque changement est daté, motivé et journalisé."
      />

      <div className="flex flex-wrap items-center gap-2">
        {parameters.view ? (
          <NavLink to="/app/parametres" end className={tabCls}>
            <SlidersHorizontal className="h-3.5 w-3.5" /> Paramètres et formules
          </NavLink>
        ) : null}
        {parameters.view ? (
          <NavLink to="/app/parametres/seuils" className={tabCls}>
            <Gauge className="h-3.5 w-3.5" /> Seuils de conduite Fermia
          </NavLink>
        ) : null}
        {lists.view ? (
          <>
            <NavLink to="/app/parametres/listes" className={tabCls}>
              <ListChecks className="h-3.5 w-3.5" /> Listes
            </NavLink>
            <NavLink to="/app/parametres/territoires" className={tabCls}>
              <MapIcon className="h-3.5 w-3.5" /> Provinces et localités
            </NavLink>
          </>
        ) : null}
      </div>

      <Routes>
        <Route index element={parameters.view ? <ParametersView rights={parameters} /> : <Navigate to="listes" replace />} />
        <Route path="seuils" element={parameters.view ? <ThresholdsView rights={parameters} /> : <Navigate to="/app/parametres" replace />} />
        <Route path="listes" element={lists.view ? <ListsView rights={lists} /> : <Navigate to="/app/parametres" replace />} />
        <Route path="territoires" element={lists.view ? <TerritoriesView rights={lists} /> : <Navigate to="/app/parametres" replace />} />
        <Route path="*" element={<Navigate to="/app/parametres" replace />} />
      </Routes>
    </div>
  );
}
