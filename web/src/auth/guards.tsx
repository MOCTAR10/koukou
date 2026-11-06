import { Navigate, Outlet, useLocation } from 'react-router-dom';
import type { ReactNode } from 'react';
import { BUYER_HOME, canUseBuyerArea, FARM_HOME, isBuyer } from '../app/roles';
import { canAdministerAccess } from '../app/menu-access';
import { useInstitutionAccess } from '../app/useInstitutionAccess';
import { useMenuAccess } from '../app/useMenuAccess';
import { Loading } from '../components/ui';
import { useAuth } from './AuthContext';

export function RequiresAuth() {
  const { user } = useAuth();
  const { pathname } = useLocation();
  if (!user) return <Navigate to="/login" replace state={{ from: pathname }} />;
  return <Outlet />;
}

/**
 * The farm space. A buyer is a Market customer only: every /app URL sends him
 * back to the Market (useFarmProfile is permissive without a farm, so without
 * this he would open farm pages and only meet errors).
 */
export function RequiresFarmAccount() {
  const { user } = useAuth();
  if (isBuyer(user?.role)) return <Navigate to={BUYER_HOME} replace />;
  return <Outlet />;
}

/**
 * The buyer's own Market pages (requests, account). Signed-in only; an
 * institution, refused there by the server, goes back to its farm space.
 */
export function RequiresBuyerArea() {
  const { user } = useAuth();
  const { pathname } = useLocation();
  if (!user) return <Navigate to="/login" replace state={{ from: pathname }} />;
  if (!canUseBuyerArea(user.role)) return <Navigate to={FARM_HOME} replace />;
  return <Outlet />;
}

/**
 * Sends a typed URL back to /app instead of a page of 403 errors. Waits for the
 * profile first: a redirect during loading would throw out allowed users.
 * An institution is judged by its access profile (`useMenuAccess`), the
 * farm codes `any` being the rule of farm accounts.
 */
export function RequiresPermission({ any, children }: { any: string[]; children: ReactNode }) {
  const { pathname } = useLocation();
  const { canOpen, isLoading } = useMenuAccess();
  if (isLoading) return <Loading />;
  if (!canOpen(pathname, any)) return <Navigate to="/app" replace />;
  return <>{children}</>;
}

/** The institutional access administration: platform admin, or a profile granted ADMINISTRATION. */
export function RequiresAccessAdmin() {
  const { user } = useAuth();
  const { access, pending } = useInstitutionAccess();
  if (!user) return <Navigate to="/login" replace />;
  if (pending) return <Loading />;
  if (!canAdministerAccess(user.role, access?.profile)) return <Navigate to="/app" replace />;
  return <Outlet />;
}

/** The account's own access page: institutional accounts only. */
export function RequiresInstitution() {
  const { user } = useAuth();
  if (!user) return <Navigate to="/login" replace />;
  if (user.role !== 'INSTITUTION') return <Navigate to="/app" replace />;
  return <Outlet />;
}

export function RequiresPlatformAdmin() {
  const { user } = useAuth();
  if (!user) return <Navigate to="/login" replace />;
  if (user.role !== 'PLATFORM_ADMIN') return <Navigate to="/app" replace />;
  return <Outlet />;
}
