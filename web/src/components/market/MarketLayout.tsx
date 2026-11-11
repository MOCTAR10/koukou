import { ClipboardList, LayoutDashboard, LogIn, LogOut, Store, UserRound } from 'lucide-react';
import { Link, NavLink, Outlet } from 'react-router-dom';
import { FarmProvider } from '../../app/FarmContext';
import { canUseBuyerArea, isBuyer } from '../../app/roles';
import { useAuth } from '../../auth/AuthContext';
import { classNames } from '../../lib/format';
import { FermiaLeaf } from '../Logo';
import { ConnectionPulse } from '../ConnectionPulse';
import { OfflineBar } from '../OfflineBar';

const linkCls = ({ isActive }: { isActive: boolean }) =>
  classNames(
    'inline-flex items-center gap-1.5 rounded-full px-3 py-1.5 text-sm font-medium transition-colors',
    isActive ? 'bg-white/15 text-white' : 'text-brand-100 hover:bg-white/10 hover:text-white',
  );

/** Frame of the Market: open without an account, and the whole space of a buyer. */
export function MarketLayout() {
  const { user, logout } = useAuth();
  return (
    <FarmProvider>
      {/* overflow-x-clip: the catalogue hero is full-bleed (w-screen), scrollbar width included. */}
      <div className="flex min-h-screen flex-col overflow-x-clip bg-slate-50">
        <header className="z-20 border-b border-white/10 bg-brand-950/95 backdrop-blur md:sticky md:top-0">
          <div className="mx-auto flex min-h-16 max-w-page flex-wrap items-center gap-x-3 gap-y-1 px-4 py-2.5 xl:px-8">
            <Link to="/marche" className="flex items-center gap-2.5 text-white">
              <FermiaLeaf className="h-7 w-7" />
              <span className="text-lg font-bold tracking-tight">Fermia</span>
              <span className="rounded-full bg-white/10 px-2 py-0.5 text-[11px] font-semibold uppercase tracking-[0.14em] text-emerald-300 ring-1 ring-inset ring-white/10">
                Marché
              </span>
            </Link>
            <ConnectionPulse interactive className="ml-auto" />
            <nav className="flex flex-wrap items-center gap-1">
              <NavLink to="/marche" end className={linkCls}>
                <Store className="h-4 w-4" /> Annonces
              </NavLink>
              {user ? (
                <>
                  {canUseBuyerArea(user.role) ? (
                    <>
                      <NavLink to="/marche/commandes" className={linkCls}>
                        <ClipboardList className="h-4 w-4" /> Mes commandes
                      </NavLink>
                      <NavLink to="/marche/compte" className={linkCls}>
                        <UserRound className="h-4 w-4" /> Mon compte
                      </NavLink>
                    </>
                  ) : null}
                  {isBuyer(user.role) ? (
                    <button onClick={logout} className={linkCls({ isActive: false })}>
                      <LogOut className="h-4 w-4" /> Déconnexion
                    </button>
                  ) : (
                    <Link to="/app" className={linkCls({ isActive: false })}>
                      <LayoutDashboard className="h-4 w-4" /> {user.role === 'INSTITUTION' ? 'Espace programme' : 'Ma ferme'}
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
                    className="ml-1 rounded-full bg-accent-500 px-4 py-1.5 text-sm font-semibold text-slate-950 shadow-sm transition-colors hover:bg-accent-400"
                  >
                    Créer un compte client
                  </Link>
                </>
              )}
            </nav>
          </div>
        </header>
        <OfflineBar note="Les commandes pourront être passées une fois reconnecté." />
        <main className="mx-auto w-full max-w-page flex-1 px-4 py-6 xl:px-8">
          <Outlet />
        </main>
        <footer className="border-t border-slate-200 bg-white">
          <div className="mx-auto flex max-w-page flex-wrap items-center justify-between gap-x-6 gap-y-2 px-4 py-5 text-xs text-slate-500 xl:px-8">
            <p className="flex items-center gap-2">
              <FermiaLeaf className="h-4 w-4" />
              <span>
                <span className="font-semibold text-slate-700">Marché Fermia</span> · Des fermes vérifiées, en direct.
              </span>
            </p>
            <p>La ferme accepte votre demande, puis vous la payez directement. Fermia n’encaisse rien.</p>
          </div>
        </footer>
      </div>
    </FarmProvider>
  );
}
