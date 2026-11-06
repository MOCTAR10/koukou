import { Navigate, Route, Routes } from 'react-router-dom';
import { DatabaseBackup } from 'lucide-react';
import { useMenuAccess } from '../app/useMenuAccess';
import { JobDetail } from '../components/recovery/JobDetail';
import { JobsView } from '../components/recovery/JobsView';
import { Loading, PageHeader } from '../components/ui';

/**
 * Data recovery (CDC row 48, POUFA L8): AMI sheets and historical bands,
 * deposited, controlled in staging, dry run, validated, then integrated in
 * one transaction, with the recovery report. Platform admin, or a national
 * profile granted REGISTRE (validation: REGISTRE:VALIDER).
 */
export function RecoveryPage() {
  const { admin, isLoading } = useMenuAccess();
  if (!admin.recovery.view) return isLoading ? <Loading /> : <Navigate to="/app" replace />;
  return (
    <div className="space-y-6">
      <PageHeader
        title="Reprise des données"
        icon={<DatabaseBackup />}
        subtitle="Fiches AMI et bandes historiques : dépôt, contrôles ligne à ligne, essai à blanc, validation puis intégration, avec le rapport de reprise."
      />
      <Routes>
        <Route index element={<JobsView rights={admin.recovery} />} />
        <Route path=":jobId" element={<JobDetail rights={admin.recovery} />} />
      </Routes>
    </div>
  );
}
