import { Navigate, Outlet, useNavigate } from 'react-router-dom';
import { Smartphone } from 'lucide-react';
import { useAuth } from './AuthContext';
import { Logo } from '../components/Logo';

export function RequiresAuth() {
  const { user } = useAuth();
  if (!user) return <Navigate to="/login" replace />;
  if (user.role !== 'PLATFORM_ADMIN') {
    return <MobileOnlyScreen />;
  }
  return <Outlet />;
}

export function RequiresPlatformAdmin() {
  const { user } = useAuth();
  if (!user) return <Navigate to="/login" replace />;
  if (user.role !== 'PLATFORM_ADMIN') return <Navigate to="/app" replace />;
  return <Outlet />;
}

function MobileOnlyScreen() {
  const { user, logout } = useAuth();
  const navigate = useNavigate();
  return (
    <div className="flex min-h-screen items-center justify-center bg-gradient-to-br from-brand-950 via-slate-900 to-brand-900 p-4">
      <div className="w-full max-w-sm rounded-2xl bg-white p-8 text-center shadow-2xl">
        <div className="mb-4 flex justify-center">
          <Logo className="h-20 w-auto drop-shadow-xl" />
        </div>
        <h1 className="text-lg font-bold text-slate-900">Console administrateur</h1>
        <p className="mt-2 flex items-start justify-center gap-2 text-left text-sm text-slate-500">
          <Smartphone className="mt-0.5 h-4 w-4 shrink-0 text-slate-400" />
          <span>
            Bonjour {user?.fullName}. Les comptes Propriétaire et Éleveur se connectent via{' '}
            <b>l'application mobile Fermia</b>. Cette console web est réservée à
            l'administrateur plateforme.
          </span>
        </p>
        <button
          onClick={() => {
            logout();
            navigate('/login');
          }}
          className="mt-6 w-full rounded-lg bg-brand-600 py-2.5 text-sm font-semibold text-white hover:bg-brand-700"
        >
          Changer de compte
        </button>
      </div>
    </div>
  );
}