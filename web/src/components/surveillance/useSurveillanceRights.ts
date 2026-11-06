import { useAuth } from '../../auth/AuthContext';
import { useInstitutionAccess } from '../../app/useInstitutionAccess';
import { notificationRights, surveillanceRights, type NotificationRights, type SurveillanceRights } from './surveillanceAccess';

/** Surveillance rights of the signed-in account (`surveillanceAccess.ts`). */
export function useSurveillanceRights(): SurveillanceRights & { loading: boolean } {
  const { user } = useAuth();
  const inst = useInstitutionAccess();
  const profile = inst.revoked ? null : inst.access?.profile;
  return { ...surveillanceRights(user?.role, profile), loading: inst.pending };
}

/** Inbox and notification-rule rights of the signed-in account. */
export function useNotificationRights(): NotificationRights & { loading: boolean } {
  const { user } = useAuth();
  const inst = useInstitutionAccess();
  return { ...notificationRights(user?.role, inst.access?.profile, inst.revoked), loading: inst.pending };
}
