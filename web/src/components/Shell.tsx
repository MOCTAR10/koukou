import { useState } from 'react';
import { NavLink, Outlet, useLocation, useNavigate } from 'react-router-dom';
import {
  Activity,
  AlertTriangle,
  BadgePercent,
  Briefcase,
  ClipboardList,
  Coins,
  Factory,
  FileBarChart,
  Handshake,
  LayoutDashboard,
  LifeBuoy,
  ListTodo,
  LogOut,
  Landmark,
  MapPin,
  Menu,
  NotebookPen,
  ReceiptText,
  ScrollText,
  Settings,
  Shield,
  ShoppingCart,
  Store,
  Tractor,
  Users,
  Warehouse,
  X,
  type LucideIcon,
} from 'lucide-react';
import { useAuth } from '../auth/AuthContext';
import { useFarm } from '../app/FarmContext';
import { farmSpaceState, worksWithoutFarm } from '../app/roles';
import { useMenuAccess } from '../app/useMenuAccess';
import { Logo } from './Logo';
import { NoFarmScreen } from './NoFarmScreen';
import { OfflineBar } from './OfflineBar';
import { QuickCreate } from './QuickCreate';
import { classNames, initials, statusLabel } from '../lib/format';
import { pageTm } from '../lib/motion';
import { motion, useReducedMotion } from 'motion/react';

/** `perms`: at least one is required to show the entry; absent means visible to all. */
const NAV: Array<{
  title: string;
  items: Array<{ to: string; label: string; icon: LucideIcon; perms?: string[] }>;
}> = [
  {
    title: 'Pilotage',
    items: [
      { to: '/app/dashboard', label: 'Tableau de bord', icon: LayoutDashboard },
      { to: '/app/alerts', label: 'Alertes', icon: AlertTriangle },
      { to: '/app/tasks', label: 'Tâches', icon: ListTodo },
    ],
  },
  {
    title: 'Élevage',
    items: [
      { to: '/app/batches', label: 'Lots & suivi', icon: Activity },
      { to: '/app/activities', label: 'Activités', icon: NotebookPen },
      { to: '/app/sanitary', label: 'Sanitaire', icon: ScrollText, perms: ['sanitaire:lecture'] },
      { to: '/app/stock', label: 'Stock & provendes', icon: Warehouse, perms: ['stock:gerer'] },
      { to: '/app/slaughter', label: 'Abattage', icon: Factory, perms: ['production:abattage'] },
    ],
  },
  // No « Cultures » group: crops are hidden on the POUFA instance (poultry programme).
  {
    title: 'Ventes',
    items: [
      { to: '/app/finance/ventes', label: 'Ventes', icon: ShoppingCart, perms: ['vente:creer'] },
      { to: '/app/finance/caisse', label: 'Caisse', icon: Coins, perms: ['caisse:lire'] },
      { to: '/app/orders', label: 'Commandes', icon: ClipboardList, perms: ['vente:commande', 'vente:creer'] },
      { to: '/app/market', label: 'Marché', icon: Store, perms: ['market:publier', 'vente:commande'] },
      { to: '/app/finance/clients', label: 'Clients', icon: Handshake, perms: ['compta:client'] },
      { to: '/app/points-of-sale', label: 'Points de vente', icon: MapPin, perms: ['pdv:gerer'] },
      { to: '/app/finance/promotions', label: 'Promotions', icon: BadgePercent, perms: ['vente:promotion'] },
    ],
  },
  {
    title: 'Finance',
    items: [
      { to: '/app/reports', label: 'Rentabilité', icon: FileBarChart, perms: ['compta:rapports'] },
      { to: '/app/accounting', label: 'Comptabilité', icon: Landmark, perms: ['compta:rapports'] },
      { to: '/app/expenses', label: 'Dépenses', icon: ReceiptText, perms: ['compta:depense'] },
    ],
  },
  {
    title: 'Gestion',
    items: [
      { to: '/app/team', label: 'Équipe', icon: Users, perms: ['equipe:gerer'] },
      { to: '/app/hr', label: 'Dossiers RH', icon: Briefcase, perms: ['rh:lire', 'equipe:gerer'] },
      { to: '/app/settings', label: 'Réglages', icon: Settings },
      { to: '/app/help', label: 'Aide', icon: LifeBuoy },
    ],
  },
];

/** Hidden in the collapsed rail, back when it opens on hover or keyboard focus. */
const RAIL_TEXT = 'md:max-xl:hidden md:max-xl:group-hover/side:inline md:max-xl:group-has-[:focus-visible]/side:inline';
const RAIL_BLOCK = 'md:max-xl:hidden md:max-xl:group-hover/side:block md:max-xl:group-has-[:focus-visible]/side:block';

function navLinkCls({ isActive }: { isActive: boolean }) {
  return classNames(
    'flex items-center gap-2.5 whitespace-nowrap rounded-lg px-2.5 py-2 text-sm md:max-xl:justify-center md:max-xl:group-hover/side:justify-start md:max-xl:group-has-[:focus-visible]/side:justify-start',
    isActive
      ? 'bg-white/12 font-semibold text-white shadow-[inset_3px_0_0_var(--color-emerald-400)]'
      : 'text-brand-100 hover:bg-white/5 hover:text-white',
  );
}

export function Shell() {
  const { user, logout } = useAuth();
  const { farms, farmId, farm, setFarm, farmsLoading, farmsFailed, refetchFarms } = useFarm();
  const navigate = useNavigate();
  const [mobileOpen, setMobileOpen] = useState(false);

  const isAdmin = user?.role === 'PLATFORM_ADMIN';
  const { pathname } = useLocation();
  const onPlatform = pathname.startsWith('/app/platform');
  const reduced = useReducedMotion();
  const { hasPermission, isGroundEleveur } = useMenuAccess();
  const space = farmSpaceState({ farmsLoading, farmsFailed, farmCount: farms.length });
  const farmOptions = farms.map((f) => (
    <option key={f.id} value={f.id}>
      {f.code ? `${f.code} · ` : ''}
      {f.name}
      {!f.active ? ' (suspendue)' : ''}
    </option>
  ));
  const nav = NAV.map((group) => ({
    ...group,
    items: [
      ...(group.title === 'Pilotage' && isGroundEleveur
        ? [{ to: '/app/home', label: 'Mon terrain', icon: Tractor }]
        : []),
      // Without a farm, only the pages that work without one.
      ...group.items.filter((item) =>
        space === 'ready' ? !item.perms || hasPermission(...item.perms) : worksWithoutFarm(item.to),
      ),
    ],
  })).filter((group) => group.items.length > 0);

  return (
    <div className="min-h-screen bg-slate-50">
      <aside
        className={classNames(
          'group/side fixed inset-y-0 left-0 z-40 flex w-64 flex-col bg-gradient-to-b from-brand-900 to-brand-950 text-brand-100 transition-[transform,width] duration-200 motion-reduce:transition-none md:translate-x-0 md:max-xl:w-[76px] md:max-xl:hover:w-64 md:max-xl:hover:shadow-2xl md:max-xl:has-[:focus-visible]:w-64',
          mobileOpen ? 'translate-x-0' : '-translate-x-full',
        )}
      >
        <div className="flex items-center gap-2 px-5 py-5">
          <Logo className="h-9 w-auto shrink-0" />
          <div className={classNames('whitespace-nowrap', RAIL_BLOCK)}>
            <p className="text-sm font-bold text-white">Fermia</p>
            <p className="text-[11px] text-brand-200">{isAdmin ? 'Console plateforme' : 'Espace ferme'}</p>
          </div>
          <button
            className="ml-auto rounded p-1 text-brand-200 hover:text-white md:hidden"
            onClick={() => setMobileOpen(false)}
            aria-label="Fermer le menu"
          >
            <X className="h-5 w-5" />
          </button>
        </div>

        {!onPlatform && farms.length > 0 ? (
          <div className="px-3 md:max-xl:hidden">
            <label className="mb-1 block px-2 text-[11px] uppercase tracking-wide text-brand-300">
              {isAdmin ? 'Ferme à consulter' : 'Ferme active'}
            </label>
            <select
              className="select-on-dark w-full rounded-lg border border-white/10 bg-white/5 px-2.5 py-2 text-sm text-white outline-none focus:border-brand-400 [&>option]:text-slate-900"
              value={farmId ?? ''}
              onChange={(e) => setFarm(e.target.value)}
            >
              {farmOptions}
            </select>
          </div>
        ) : null}

        <nav className="mt-5 flex-1 overflow-y-auto overflow-x-hidden px-3">
          {nav.map((group) => (
            <div key={group.title} className="mb-4">
              <p className={classNames('mb-1 whitespace-nowrap px-2 text-[11px] font-medium uppercase tracking-wider text-brand-300', RAIL_BLOCK)}>
                {group.title}
              </p>
              <div className="space-y-0.5">
                {group.items.map((item) => (
                  <NavLink
                    key={item.to}
                    to={item.to}
                    onClick={() => setMobileOpen(false)}
                    aria-label={item.label}
                    className={navLinkCls}
                  >
                    <item.icon className="h-4 w-4 shrink-0" />
                    <span className={RAIL_TEXT}>{item.label}</span>
                  </NavLink>
                ))}
              </div>
            </div>
          ))}
          {isAdmin ? (
            <div>
              <p className={classNames('mb-1 whitespace-nowrap px-2 text-[11px] font-medium uppercase tracking-wider text-brand-300', RAIL_BLOCK)}>
                Plateforme
              </p>
              <div className="space-y-0.5">
                <NavLink
                  to="/app/platform"
                  onClick={() => setMobileOpen(false)}
                  aria-label="Cockpit plateforme"
                  className={navLinkCls}
                >
                  <Shield className="h-4 w-4 shrink-0" />
                  <span className={RAIL_TEXT}>Cockpit plateforme</span>
                </NavLink>
              </div>
            </div>
          ) : null}
        </nav>

        <div className="border-t border-white/10 px-3 py-3">
          <div className="flex items-center gap-2.5 rounded-lg bg-white/5 px-2.5 py-2 md:max-xl:flex-col md:max-xl:px-0 md:max-xl:group-hover/side:flex-row md:max-xl:group-hover/side:px-2.5 md:max-xl:group-has-[:focus-visible]/side:flex-row md:max-xl:group-has-[:focus-visible]/side:px-2.5">
            <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-accent-700 text-xs font-semibold text-white">
              {user ? initials(user.fullName) : '?'}
            </div>
            <div className={classNames('min-w-0 flex-1', RAIL_BLOCK)}>
              <p className="truncate text-sm font-medium text-white">
                {user?.fullName}
              </p>
              <p className="text-[11px] text-brand-200">
                {user ? statusLabel(user.role) : ''}
              </p>
            </div>
            <button
              onClick={logout}
              className="rounded p-1 text-brand-200 hover:text-white"
              title="Se déconnecter"
              aria-label="Se déconnecter"
            >
              <LogOut className="h-4 w-4" />
            </button>
          </div>
        </div>
      </aside>

      {mobileOpen ? (
        <div
          className="fixed inset-0 z-30 bg-brand-950/50 md:hidden"
          onClick={() => setMobileOpen(false)}
        />
      ) : null}

      <div className="md:pl-[76px] xl:pl-64">
        <header className="sticky top-0 z-20 flex h-14 items-center gap-3 border-b border-slate-200 bg-white/90 px-4 backdrop-blur sm:px-6 xl:h-16 xl:px-8">
          <button
            className="rounded p-1 text-slate-500 hover:bg-slate-100 md:hidden"
            onClick={() => setMobileOpen(true)}
            aria-label="Ouvrir le menu"
          >
            <Menu className="h-5 w-5" />
          </button>
          <div className="flex min-w-0 items-center text-sm font-medium text-slate-700">
            {!onPlatform && farm ? (
              <>
                {/* The rail has no room for the farm picker: it moves up here. */}
                <select
                  aria-label={isAdmin ? 'Ferme à consulter' : 'Ferme active'}
                  className="hidden max-w-56 rounded-lg border border-slate-200 bg-white py-1.5 pl-2.5 text-sm font-medium text-slate-700 outline-none focus:border-brand-500 md:max-xl:block"
                  value={farmId ?? ''}
                  onChange={(e) => setFarm(e.target.value)}
                >
                  {farmOptions}
                </select>
                <span className="truncate md:max-xl:hidden">
                  {isAdmin ? <span className="text-slate-400">Ferme : </span> : null}
                  {farm.name}
                </span>
                {farm.code ? (
                  <span className="ml-2 shrink-0 rounded bg-slate-100 px-1.5 py-0.5 font-mono text-xs font-semibold text-slate-600 md:max-xl:hidden">
                    {farm.code}
                  </span>
                ) : null}
                <span className="ml-2 hidden text-xs font-normal text-slate-400 sm:inline">
                  {farm.administrativeCity} · {farm.active ? 'ferme active' : 'ferme suspendue'}
                </span>
              </>
            ) : onPlatform ? (
              'Console administrateur plateforme'
            ) : null}
          </div>
          <div className="ml-auto hidden items-center gap-2 text-xs text-slate-400 lg:flex">
            {!onPlatform && farm?.capacityPlaces ? <span>Capacité {farm.capacityPlaces.toLocaleString('fr-FR')} places</span> : null}
          </div>
          <div className="ml-auto lg:ml-0">{!onPlatform && farmId ? <QuickCreate /> : null}</div>
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

        <OfflineBar />

        <main className="mx-auto max-w-page p-4 sm:p-6 xl:p-8">
          <motion.div
            key={pathname}
            initial={reduced ? false : { opacity: 0, y: 8 }}
            animate={{ opacity: 1, y: 0 }}
            transition={pageTm}
          >
            {space === 'ready' || worksWithoutFarm(pathname) ? (
              <Outlet />
            ) : (
              <NoFarmScreen state={space} onRetry={refetchFarms} />
            )}
          </motion.div>
        </main>
      </div>
    </div>
  );
}