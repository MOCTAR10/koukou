import { Navigate, NavLink, Route, Routes, useLocation } from 'react-router-dom';
import { FileText, Gauge, LayoutDashboard, Map as MapIcon, Target } from 'lucide-react';
import { useMenuAccess } from '../app/useMenuAccess';
import { DashboardView } from '../components/pilotage/DashboardView';
import { MapView } from '../components/pilotage/MapView';
import { ObjectiveView } from '../components/pilotage/ObjectiveView';
import { PilotageFiltersBar } from '../components/pilotage/PilotageFiltersBar';
import { ReportsView } from '../components/pilotage/ReportsView';
import { usePilotageFilters } from '../components/pilotage/usePilotageFilters';
import { Loading, PageHeader } from '../components/ui';
import { classNames } from '../lib/format';

const TABS = [
  { to: '/app/pilotage', label: 'Tableau de bord', icon: LayoutDashboard, end: true },
  { to: '/app/pilotage/carte', label: 'Carte', icon: MapIcon, end: false },
  { to: '/app/pilotage/objectif', label: 'Objectif 100 000 t', icon: Target, end: false },
  { to: '/app/pilotage/rapports', label: 'Rapports', icon: FileText, end: false },
] as const;

/**
 * Programme steering (POUFA L6): dashboard, map, 100 000 t objective and
 * reports, for the platform admin and the profiles granted
 * PILOTAGE:CONSULTER (DGE, MAEDR…). Filters live in the URL and follow the
 * tabs. A farm owner or member only gets `/app/pilotage/rapports`: the
 * end-of-band reports of his farms.
 */
export function PilotagePage() {
  const { pilotage, isLoading } = useMenuAccess();
  const { search } = useLocation();
  const { filters, setFilters, params, setParam } = usePilotageFilters();

  if (!pilotage.view) {
    if (isLoading) return <Loading />;
    if (!pilotage.runs) return <Navigate to="/app" replace />;
    return (
      <div className="space-y-6">
        <PageHeader title="Rapports de fin de bande" icon={<FileText />} subtitle="Le bilan figé de chaque bande clôturée de vos fermes, en PDF." />
        <Routes>
          <Route path="rapports" element={<ReportsView rights={pilotage} />} />
          <Route path="*" element={<Navigate to="/app/pilotage/rapports" replace />} />
        </Routes>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <PageHeader
        title="Pilotage du programme"
        icon={<Gauge />}
        subtitle={
          pilotage.aggregateOnly
            ? 'Données agrégées du programme POUFA : aucune ferme n’est citée.'
            : 'Tableaux de bord, carte, objectif national et rapports du programme POUFA.'
        }
      />
      <nav className="inline-flex flex-wrap gap-1 rounded-xl bg-slate-100 p-1" aria-label="Pilotage">
        {TABS.map((t) => (
          <NavLink
            key={t.to}
            to={{ pathname: t.to, search: t.to.endsWith('rapports') ? '' : search }}
            end={t.end}
            className={({ isActive }) =>
              classNames(
                'inline-flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-sm font-medium transition',
                isActive ? 'bg-white text-slate-900 shadow-sm' : 'text-slate-500 hover:text-slate-800',
              )
            }
          >
            <t.icon className="h-4 w-4" /> {t.label}
          </NavLink>
        ))}
      </nav>
      <Routes>
        <Route
          index
          element={
            <>
              <PilotageFiltersBar filters={filters} onChange={setFilters} />
              <DashboardView filters={filters} aggregateOnly={pilotage.aggregateOnly} />
            </>
          }
        />
        <Route
          path="carte"
          element={
            <>
              <PilotageFiltersBar filters={filters} onChange={setFilters} />
              <MapView filters={filters} colourKeyParam={params.get('cle')} onColourKey={(k) => setParam('cle', k === 'mortality' ? null : k)} />
            </>
          }
        />
        <Route
          path="objectif"
          element={
            <>
              <PilotageFiltersBar filters={filters} onChange={setFilters} withPeriod={false} />
              <ObjectiveView filters={filters} />
            </>
          }
        />
        <Route path="rapports" element={<ReportsView rights={pilotage} />} />
        <Route path="*" element={<Navigate to="/app/pilotage" replace />} />
      </Routes>
    </div>
  );
}
