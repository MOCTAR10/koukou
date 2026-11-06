import { Navigate } from 'react-router-dom';
import { useFarm } from '../../app/FarmContext';
import { institutionLanding } from '../../app/menu-access';
import { useInstitutionAccess } from '../../app/useInstitutionAccess';
import { Loading } from '../ui';

/** `/app` for an institution: its first page the profile opens, else its access page. */
export function InstitutionHomeRedirect() {
  const { access, pending } = useInstitutionAccess();
  const { farms, farmsLoading } = useFarm();
  if (pending || farmsLoading) return <Loading />;
  return <Navigate to={institutionLanding(access?.profile ?? null, farms.length)} replace />;
}
