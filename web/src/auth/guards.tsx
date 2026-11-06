import { Navigate, Outlet, useLocation } from 'react-router-dom';
import type { ReactNode } from 'react';
import { useFarmProfile } from '../app/useFarmProfile';
import { Loading } from '../components/ui';
import { useAuth } from './AuthContext';

export function RequiresAuth() {
  const { user } = useAuth();
  const { pathname } = useLocation();
  if (!user) return <Navigate to="/login" replace state={{ from: pathname }} />;
  return <Outlet />;
}

/**
 * The farm space. useFarmProfile is permissive without a farm, so without this
 * a buyer could open every farm page and only meet errors.
 */
export function RequiresFarmAccount() {
  const { user } = useAuth();
  if (user?.role === 'ACHETEUR') return <Navigate to="/marche" replace />;
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
