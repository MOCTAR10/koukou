import { useState } from 'react';
import { Database, FileSearch, ListOrdered, ShieldCheck } from 'lucide-react';
import { Navigate, NavLink, Route, Routes } from 'react-router-dom';
import { useMenuAccess } from '../app/useMenuAccess';
import { EventsView } from '../components/audit/EventsView';
import { RowChangesView } from '../components/audit/RowChangesView';
import { SealsView } from '../components/audit/SealsView';
import { Loading, PageHeader } from '../components/ui';
import { classNames } from '../lib/format';

const tabCls = ({ isActive }: { isActive: boolean }) =>
  classNames(
    'flex items-center gap-1.5 rounded-full px-3 py-1.5 text-xs font-semibold',
    isActive ? 'bg-slate-900 text-white' : 'bg-slate-100 text-slate-600 hover:bg-slate-200',
  );

/**
 * Audit journal of the programme (CDC row 46, ANINF): actions (level 1),
 * row changes before / after (level 2), daily seals and their verification,
 * CSV export. Platform admin and profiles granted AUDIT (the ANINF account
 * sees only this). Every consultation here is itself journaled.
 */
export function AuditPage() {
  const { admin, isLoading } = useMenuAccess();
  // A request id picked in the actions opens its row changes.
  const [requestId, setRequestId] = useState('');
  if (!admin.audit.view) return isLoading ? <Loading /> : <Navigate to="/app" replace />;

  return (
    <div className="space-y-6">
      <PageHeader
        title="Journal d’audit"
        icon={<FileSearch />}
        subtitle="Qui a fait quoi, quand et d’où : actions, données avant / après et sceaux quotidiens. Le journal est en ajout seul ; vos consultations y sont aussi inscrites."
      />
      <div className="flex flex-wrap items-center gap-2">
        <NavLink to="/app/audit" end className={tabCls}>
          <ListOrdered className="h-3.5 w-3.5" /> Actions
        </NavLink>
        <NavLink to="/app/audit/donnees" className={tabCls}>
          <Database className="h-3.5 w-3.5" /> Données modifiées
        </NavLink>
        <NavLink to="/app/audit/sceaux" className={tabCls}>
          <ShieldCheck className="h-3.5 w-3.5" /> Sceaux et intégrité
        </NavLink>
      </div>
      <Routes>
        <Route index element={<EventsView onRowChanges={setRequestId} />} />
        <Route path="donnees" element={<RowChangesView initialRequestId={requestId} />} />
        <Route path="sceaux" element={<SealsView />} />
        <Route path="*" element={<Navigate to="/app/audit" replace />} />
      </Routes>
    </div>
  );
}
