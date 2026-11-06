import { ClipboardList, LayoutDashboard, LogIn, LogOut, Store, UserRound } from 'lucide-react';
import { Link, NavLink, Outlet } from 'react-router-dom';
import { FarmProvider } from '../../app/FarmContext';
import { useAuth } from '../../auth/AuthContext';
import { classNames } from '../../lib/format';
import { Logo } from '../Logo';
import { OfflineBar } from '../OfflineBar';

const linkCls = ({ isActive }: { isActive: boolean }) =>
  classNames(
    'inline-flex items-center gap-1.5 rounded-lg px-2.5 py-1.5 text-sm font-medium',
    isActive ? 'bg-brand-50 text-brand-700' : 'text-slate-600 hover:bg-slate-100',
  );

/** Frame of the Market: open without an account, and the whole space of a buyer. */
export function MarketLayout() {
  const { user, logout } = useAuth();
  return (
    <FarmProvider>
      <div className="min-h-screen bg-slate-50">
        <header className="sticky top-0 z-20 border-b border-slate-200 bg-white/90 backdrop-blur">
          <div className="mx-auto flex max-w-page flex-wrap items-center gap-x-3 gap-y-1 px-4 py-2.5">
            <Link to="/marche" className="flex items-center gap-2 font-bold text-brand-800">
              <Logo className="h-7 w-auto" />
              Marché Fermia
            </Link>
            <nav className="ml-auto flex flex-wrap items-center gap-1">
              <NavLink to="/marche" end className={linkCls}>
                <Store className="h-4 w-4" /> Annonces
              </NavLink>
              {user ? (
                <>
                  <NavLink to="/marche/commandes" className={linkCls}>
                    <ClipboardList className="h-4 w-4" /> Mes commandes
                  </NavLink>
                  <NavLink to="/marche/compte" className={linkCls}>
                    <UserRound className="h-4 w-4" /> Mon compte
                  </NavLink>
                  {user.role === 'ACHETEUR' ? (
                    <button onClick={logout} className={linkCls({ isActive: false })}>
                      <LogOut className="h-4 w-4" /> Déconnexion
                    </button>
                  ) : (
                    <Link to="/app" className={linkCls({ isActive: false })}>
                      <LayoutDashboard className="h-4 w-4" /> Ma ferme
                    </Link>
                  )}
                </>
              ) : (
                <>
                  <Link to="/login" state={{ from: '/marche' }} className={linkCls({ isActive: false })}>
                    <LogIn className="h-4 w-4" /> Connexion
                  </Link>
                  <Link
                    to="/marche/inscription"
                    className="rounded-lg bg-brand-600 px-3 py-1.5 text-sm font-semibold text-white hover:bg-brand-700"
                  >
                    Créer un compte
                  </Link>
                </>
              )}
            </nav>
          </div>
        </header>
        <OfflineBar note="Les commandes pourront être passées une fois reconnecté." />
        <main className="mx-auto max-w-page px-4 py-6 xl:px-8">
          <Outlet />
        </main>
      </div>
    </FarmProvider>
  );
}
