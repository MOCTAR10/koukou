import { useState } from 'react';
import { NavLink, Outlet, useLocation, useNavigate } from 'react-router-dom';
import {
  Activity,
  AlertTriangle,
  Factory,
  FileBarChart,
  LayoutDashboard,
  LogOut,
  Menu,
  ScrollText,
  Settings,
  Shield,
  Users,
  Warehouse,
  X,
} from 'lucide-react';
import { useAuth } from '../auth/AuthContext';
import { useFarm } from '../app/FarmContext';
import { Logo } from './Logo';
import { classNames, initials, statusLabel } from '../lib/format';
import { pageTm } from '../lib/motion';
import { motion, useReducedMotion } from 'motion/react';

const NAV = [
  {
    title: 'Pilotage',
    items: [
      { to: '/app/dashboard', label: 'Tableau de bord', icon: LayoutDashboard },
      { to: '/app/batches', label: 'Lots & suivi', icon: Activity },
      { to: '/app/alerts', label: 'Alertes', icon: AlertTriangle },
    ],
  },
  {
    title: 'Production',
    items: [
      { to: '/app/finance', label: 'Finance & ventes', icon: FileBarChart },
      { to: '/app/stock', label: 'Stock & aliments', icon: Warehouse },
      { to: '/app/sanitary', label: 'Sanitaire', icon: ScrollText },
      { to: '/app/slaughter', label: 'Abattage', icon: Factory },
    ],
  },
  {
    title: 'Gestion',
    items: [
      { to: '/app/team', label: 'Équipe', icon: Users },
      { to: '/app/settings', label: 'Réglages', icon: Settings },
    ],
  },
];

export function Shell() {
  const { user, logout } = useAuth();
  const { farms, farmId, farm, setFarm } = useFarm();
  const navigate = useNavigate();
  const [mobileOpen, setMobileOpen] = useState(false);

  const isAdmin = user?.role === 'PLATFORM_ADMIN';
  const { pathname } = useLocation();
  const onPlatform = pathname.startsWith('/app/platform');
  const reduced = useReducedMotion();

  return (
    <div className="min-h-screen bg-slate-100">
      <aside
        className={classNames(
          'fixed inset-y-0 left-0 z-40 flex w-64 flex-col bg-slate-900 text-slate-200 transition-transform lg:translate-x-0',
          mobileOpen ? 'translate-x-0' : '-translate-x-full',
        )}
      >
        <div className="flex items-center gap-2 px-5 py-5">
          <Logo className="h-9 w-auto" />
          <div>
            <p className="text-sm font-bold text-white">KouKou</p>
            <p className="text-[11px] text-slate-400">Console pilote</p>
          </div>
          <button
            className="ml-auto rounded p-1 text-slate-400 hover:text-white lg:hidden"
            onClick={() => setMobileOpen(false)}
            aria-label="Fermer le menu"
          >
            <X className="h-5 w-5" />
          </button>
        </div>

        {!onPlatform ? (
          <div className="px-3">
            <label className="mb-1 block px-2 text-[11px] uppercase tracking-wide text-slate-500">
              {isAdmin ? 'Ferme à consulter' : 'Ferme active'}
            </label>
            <select
              className="w-full rounded-lg border border-slate-700 bg-slate-800 px-2.5 py-2 text-sm text-slate-100 outline-none focus:border-brand-500"
              value={farmId ?? ''}
              onChange={(e) => setFarm(e.target.value)}
            >
              {farms.map((f) => (
                <option key={f.id} value={f.id}>
                  {f.name}
                  {!f.active ? ' (suspendue)' : ''}
                </option>
              ))}
            </select>
          </div>
        ) : null}

        <nav className="mt-5 flex-1 overflow-y-auto px-3">
          {NAV.map((group) => (
            <div key={group.title} className="mb-4">
              <p className="mb-1 px-2 text-[11px] font-medium uppercase tracking-wider text-slate-500">
                {group.title}
              </p>
              <div className="space-y-0.5">
                {group.items.map((item) => (
                  <NavLink
                    key={item.to}
                    to={item.to}
                    onClick={() => setMobileOpen(false)}
                    className={({ isActive }) =>
                      classNames(
                        'flex items-center gap-2.5 rounded-lg px-2.5 py-2 text-sm',
                        isActive
                          ? 'bg-sky-600 font-medium text-white'
                          : 'text-slate-300 hover:bg-slate-800 hover:text-white',
                      )
                    }
                  >
                    <item.icon className="h-4 w-4" />
                    {item.label}
                  </NavLink>
                ))}
              </div>
            </div>
          ))}
          {isAdmin ? (
            <div>
              <p className="mb-1 px-2 text-[11px] font-medium uppercase tracking-wider text-slate-500">
                Plateforme
              </p>
              <div className="space-y-0.5">
                <NavLink
                  to="/app/platform"
                  onClick={() => setMobileOpen(false)}
                  className={({ isActive }) =>
                    classNames(
                      'flex items-center gap-2.5 rounded-lg px-2.5 py-2 text-sm',
                      isActive
                        ? 'bg-sky-600 font-medium text-white'
                        : 'text-slate-300 hover:bg-slate-800 hover:text-white',
                    )
                  }
                >
                  <Shield className="h-4 w-4" />
                  Cockpit plateforme
                </NavLink>
              </div>
            </div>
          ) : null}
        </nav>

        <div className="border-t border-slate-800 px-3 py-3">
          <div className="flex items-center gap-2.5 rounded-lg bg-slate-800 px-2.5 py-2">
            <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-sky-700 text-xs font-semibold text-white">
              {user ? initials(user.fullName) : '?'}
            </div>
            <div className="min-w-0 flex-1">
              <p className="truncate text-sm font-medium text-white">
                {user?.fullName}
              </p>
              <p className="text-[11px] text-slate-400">
                {user ? statusLabel(user.role) : ''}
              </p>
            </div>
            <button
              onClick={logout}
              className="rounded p-1 text-slate-400 hover:text-white"
              title="Se déconnecter"
            >
              <LogOut className="h-4 w-4" />
            </button>
          </div>
        </div>
      </aside>

      {mobileOpen ? (
        <div
          className="fixed inset-0 z-30 bg-slate-900/50 lg:hidden"
          onClick={() => setMobileOpen(false)}
        />
      ) : null}

      <div className="lg:pl-64">
        <header className="sticky top-0 z-20 flex h-14 items-center gap-3 border-b border-slate-200 bg-white px-4">
          <button
            className="rounded p-1 text-slate-500 hover:bg-slate-100 lg:hidden"
            onClick={() => setMobileOpen(true)}
            aria-label="Ouvrir le menu"
          >
            <Menu className="h-5 w-5" />
          </button>
          <div className="text-sm font-medium text-slate-700">
            {!onPlatform && farm ? (
              <>
                {isAdmin ? <span className="text-slate-400">Ferme : </span> : null}
                {farm.name}
                <span className="ml-2 hidden text-xs font-normal text-slate-400 sm:inline">
                  {farm.administrativeCity} · {farm.active ? 'ferme active' : 'ferme suspendue'}
                </span>
              </>
            ) : (
              'Console administrateur plateforme'
            )}
          </div>
          <div className="ml-auto flex items-center gap-2 text-xs text-slate-400">
            {!onPlatform && farm ? <span>Capacité {farm.capacityPerBuilding ?? '—'} ois./bât.</span> : null}
          </div>
          {isAdmin ? (
            <button
              onClick={() => navigate('/app/platform')}
              className={classNames(
                'rounded-lg px-3 py-1.5 text-xs font-semibold transition',
                onPlatform
                  ? 'bg-brand-600 text-white'
                  : 'bg-brand-50 text-brand-700 hover:bg-brand-100',
              )}
            >
              Plateforme
            </button>
          ) : null}
        </header>

        <main className="mx-auto max-w-7xl p-4 sm:p-6">
          <motion.div
            key={pathname}
            initial={reduced ? false : { opacity: 0, y: 8 }}
            animate={{ opacity: 1, y: 0 }}
            transition={pageTm}
          >
            <Outlet />
          </motion.div>
        </main>
      </div>
    </div>
  );
}