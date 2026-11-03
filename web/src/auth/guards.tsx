import { Navigate, Outlet } from 'react-router-dom';
import type { ReactNode } from 'react';
import { useFarmProfile } from '../app/useFarmProfile';
import { Loading } from '../components/ui';
import { useAuth } from './AuthContext';

export function RequiresAuth() {
  const { user } = useAuth();
  if (!user) return <Navigate to="/login" replace />;
  return <Outlet />;
}

/**
 * Sends a typed URL back to /app instead of a page of 403 errors. Waits for the
 * profile first: a redirect during loading would throw out allowed users.
 */
export function RequiresPermission({ any, children }: { any: string[]; children: ReactNode }) {
  const { hasPermission, isLoading } = useFarmProfile();
  if (isLoading) return <Loading />;
  if (!hasPermission(...any)) return <Navigate to="/app" replace />;
  return <>{children}</>;
}

export function RequiresPlatformAdmin() {
  const { user } = useAuth();
  if (!user) return <Navigate to="/login" replace />;
  if (user.role !== 'PLATFORM_ADMIN') return <Navigate to="/app" replace />;
  return <Outlet />;
}
