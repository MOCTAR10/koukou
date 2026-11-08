import { useEffect, useState } from 'react';
import { NavLink, Outlet, useLocation, useNavigate } from 'react-router-dom';
import {
  Activity,
  BadgeCheck,
  AlertTriangle,
  BadgePercent,
  BookMarked,
  BellRing,
  Briefcase,
  DatabaseBackup,
  FileSearch,
  SlidersHorizontal,
  ClipboardList,
  Coins,
  Factory,
  FileBarChart,
  Handshake,
  KeyRound,
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
  Gauge,
  Settings,
  Shield,
  ShoppingCart,
  ShieldAlert,
  Store,
  Tractor,
  Users,
  Warehouse,
  X,
  ChevronDown,
  type LucideIcon,
} from 'lucide-react';
import { useAuth } from '../auth/AuthContext';
import { useFarm } from '../app/FarmContext';
import { farmSpaceState, worksWithoutFarm } from '../app/roles';
import { useMenuAccess } from '../app/useMenuAccess';
import { Logo } from './Logo';
import { PageNotOpen } from './access/PageNotOpen';
import { NoFarmScreen } from './NoFarmScreen';
import { Loading } from './ui';
import { ConnectionPulse } from './ConnectionPulse';
import { OfflineBar } from './OfflineBar';
import { FarmPicker } from './programme/FarmPicker';
import { QuickCreate } from './QuickCreate';
// POUFA L5: programme surveillance entries and the notification bell.
import { NotificationBell } from './surveillance/NotificationBell';
import { useNotificationRights, useSurveillanceRights } from './surveillance/useSurveillanceRights';
import { classNames, initials, statusLabel } from '../lib/format';
import { pageTm } from '../lib/motion';
import { motion, useReducedMotion } from 'motion/react';
// POUFA W6: inputs and traceability entries.
import { ClipboardCheck, QrCode, Truck } from 'lucide-react';
import { FARM_DELIVERIES_PATH, isProgrammeWidePath, programmeEntries, programmeWideLabel } from './trace/traceAccess';
// POUFA lot A droits: the programme economic synthesis entry.
import { useInstitutionAccess } from '../app/useInstitutionAccess';
import { ECONOMIE_PATH, economieRights } from './economie/economie';

/** `perms`: at least one is required to show the entry; absent means visible to all. */
const NAV: Array<{
  title: string;
  items: Array<{ to: string; label: string; icon: LucideIcon; perms?: string[] }>;
}> = [
  {
    title: 'Pilotage',
    items: [
      { to: '/app/dashboard', label: 'Tableau de bord', icon: LayoutDashboard },
      // POUFA lot A indic: Fermia's advice is not the programme's sanitary alerting (F12).
      { to: '/app/alerts', label: 'Conseils d’élevage', icon: AlertTriangle },
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
      { to: FARM_DELIVERIES_PATH, label: 'Livraisons d’intrants', icon: Truck, perms: ['intrants:lire', 'stock:gerer'] }, // POUFA W6; lot A droits: « intrants:lire »
      // POUFA visites techniques et biosécurité (CDC n° 27, n° 45): every farm account reads, the matrix gates institutions.
      { to: '/app/visites', label: 'Visites techniques', icon: ClipboardCheck },
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
      { to: '/app/market', label: 'Marché', icon: Store, perms: ['market:publier', 'vente:commande', 'market:lire'] },
      { to: '/app/finance/clients', label: 'Clients', icon: Handshake, perms: ['compta:client'] },
      { to: '/app/points-of-sale', label: 'Points de vente', icon: MapPin, perms: ['pdv:gerer'] },
      { to: '/app/finance/promotions', label: 'Promotions', icon: BadgePercent, perms: ['vente:promotion'] },
    ],
  },
  {
    title: 'Finance',
    items: [
      { to: '/app/reports', label: 'Rentabilité', icon: FileBarChart, perms: ['compta:rapports'] },
      // POUFA lot A droits: same codes as the routes (App.tsx).
      { to: '/app/accounting', label: 'Comptabilité', icon: Landmark, perms: ['compta:rapports', 'compta:lire'] },
      { to: '/app/expenses', label: 'Dépenses', icon: ReceiptText, perms: ['compta:depense', 'compta:rapports'] },
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

/** Programme console order for the platform admin and institutions (items absent from the list keep their place after). */
const PROGRAMME_ORDER = [
  '/app/pilotage',
  '/app/registre',
  '/app/surveillance',
  '/app/notifications/regles',
  '/app/economie',
  '/app/intrants',
  '/app/tracabilite',
  '/app/acces',
  '/app/mon-acces',
  '/app/parametres',
  '/app/audit',
  '/app/reprise',
  '/app/platform',
];

function programmeRank(to: string): number {
  const i = PROGRAMME_ORDER.findIndex((p) => to === p || to.startsWith(`${p}/`));
  return i === -1 ? PROGRAMME_ORDER.length : i;
}

function navLinkCls({ isActive }: { isActive: boolean }) {
  return classNames(
    'flex items-center gap-2.5 whitespace-nowrap rounded-lg px-2.5 py-2 text-sm md:max-xl:justify-center md:max-xl:group-hover/side:justify-start md:max-xl:group-has-[:focus-visible]/side:justify-start',
    isActive
      ? 'bg-white/12 font-semibold text-white shadow-[inset_3px_0_0_var(--color-emerald-400)]'
      : 'text-brand-100 hover:bg-white/5 hover:text-white',
  );
}

function NavItems({ items, onNavigate }: { items: Array<{ to: string; label: string; icon: LucideIcon }>; onNavigate: () => void }) {
  return (
    <div className="space-y-0.5">
      {items.map((item) => (
        <NavLink key={item.to} to={item.to} onClick={onNavigate} aria-label={item.label} className={navLinkCls}>
          <item.icon className="h-4 w-4 shrink-0" />
          <span className={RAIL_TEXT}>{item.label}</span>
        </NavLink>
      ))}
    </div>
  );
}

const HELP_PATH = '/app/help';

export function Shell() {
  const { user, logout } = useAuth();
  const { farms, farmId, farm, setFarm, farmsLoading, farmsFailed, refetchFarms } = useFarm();
  const navigate = useNavigate();
  const [mobileOpen, setMobileOpen] = useState(false);
  const [farmModulesOpen, setFarmModulesOpen] = useState(false);

  const isAdmin = user?.role === 'PLATFORM_ADMIN';
  const { pathname } = useLocation();
  // Programme-wide pages, not about the active farm: no farm picker nor quick actions.
  const onPlatform = pathname.startsWith('/app/platform');
  const onRegistry = pathname.startsWith('/app/registre');
  const onAccess = pathname.startsWith('/app/acces') || pathname.startsWith('/app/mon-acces');
  const onPilotage = pathname.startsWith('/app/pilotage');
  // POUFA L5 (begin)
  const onSurveillance = pathname.startsWith('/app/surveillance');
  const onNotifications = pathname.startsWith('/app/notifications');
  const surveillance = useSurveillanceRights();
  const notificationRights = useNotificationRights();
  // POUFA L5 (end)
  // --- Programme administration (parameters, audit journal, data recovery) ---
  const adminHeader = pathname.startsWith('/app/parametres')
    ? 'Paramètres et listes du programme'
    : pathname.startsWith('/app/audit')
      ? 'Journal d’audit du programme'
      : pathname.startsWith('/app/reprise')
        ? 'Reprise des données du programme'
        : pathname.startsWith(ECONOMIE_PATH) // POUFA lot A droits
          ? 'Synthèse économique du programme'
          : null;
  // --- end programme administration ---
  const onProgrammeWide = isProgrammeWidePath(pathname); // POUFA W6
  const onProgramme = onPlatform || onRegistry || onAccess || onPilotage || onSurveillance || onNotifications || adminHeader !== null || onProgrammeWide;
  const reduced = useReducedMotion();
  const { showEntry, canOpen, isLoading: accessLoading, isGroundEleveur, showPlatform, showAccessAdmin, showMyAccess, registry, pilotage, admin } =
    useMenuAccess();
  const space = farmSpaceState({ farmsLoading, farmsFailed, farmCount: farms.length });
  const economie = economieRights(user?.role, useInstitutionAccess().access?.profile); // POUFA lot A droits
  const pickerLabel = isAdmin ? 'Ferme à consulter' : 'Ferme active';
  const farmProvince = farm?.provinceName ?? undefined;
  // Programme-wide entries: the registry, the platform console, the institutional access administration, an institution's own access.
  const adminItems = [
    ...(registry.view ? [{ to: '/app/registre', label: 'Registre des fermes', icon: BookMarked }] : []),
    // POUFA L6: programme steering (PILOTAGE:CONSULTER or the platform admin).
    ...(pilotage.view ? [{ to: '/app/pilotage', label: 'Pilotage du programme', icon: Gauge }] : []),
    // POUFA lot A droits: programme economic synthesis (ECONOMIQUE:CONSULTER on farms, or the platform admin).
    ...(economie.view ? [{ to: ECONOMIE_PATH, label: 'Synthèse économique', icon: Landmark }] : []),
    ...(showPlatform ? [{ to: '/app/platform', label: 'Cockpit plateforme', icon: Shield }] : []),
    ...(showAccessAdmin ? [{ to: '/app/acces', label: 'Accès institutionnels', icon: KeyRound }] : []),
    // --- Programme administration, by domain: PARAMETRES (or ADMINISTRATION for the lists), AUDIT, REGISTRE (national) ---
    ...(admin.parameters.view || admin.lists.view ? [{ to: '/app/parametres', label: 'Paramètres', icon: SlidersHorizontal }] : []),
    ...(admin.audit.view ? [{ to: '/app/audit', label: 'Journal d’audit', icon: FileSearch }] : []),
    ...(admin.recovery.view ? [{ to: '/app/reprise', label: 'Reprise des données', icon: DatabaseBackup }] : []),
    // --- end programme administration ---
    // POUFA W6: programme inputs and traceability.
    ...programmeEntries(user?.role, (to) => showEntry(to)).map((e) => ({ to: e.to, label: e.label, icon: e.kind === 'intrants' ? Truck : QrCode })),
    ...(showMyAccess ? [{ to: '/app/mon-acces', label: 'Mon accès', icon: BadgeCheck }] : []),
    // POUFA L5: programme sanitary surveillance, notification rules.
    ...(surveillance.view ? [{ to: '/app/surveillance', label: 'Surveillance sanitaire', icon: ShieldAlert }] : []),
    ...(notificationRights.readRules ? [{ to: '/app/notifications/regles', label: 'Règles de notification', icon: BellRing }] : []),
  ];
  // Platform admin and institutions work from the programme console: programme sections first, farm modules folded below.
  const consoleMode = isAdmin || user?.role === 'INSTITUTION';
  // The help is not a farm module: in the console it closes the programme list, so an account with no
  // farm module (MAEDR, ANINF, BCEG…) gets no « Modules de gestion des fermes » section at all.
  const programmeItems = consoleMode
    ? [
        ...[...adminItems].sort((a, b) => programmeRank(a.to) - programmeRank(b.to)),
        ...(showEntry(HELP_PATH) ? [{ to: HELP_PATH, label: 'Aide', icon: LifeBuoy }] : []),
      ]
    : adminItems;
  const nav = NAV.map((group) => ({
    ...group,
    items: [
      ...(group.title === 'Pilotage' && isGroundEleveur
        ? [{ to: '/app/home', label: 'Mon terrain', icon: Tractor }]
        : []),
      // Without a farm, only the pages that work without one.
      ...group.items.filter(
        (item) =>
          !(consoleMode && item.to === HELP_PATH) &&
          (space === 'ready' || worksWithoutFarm(item.to)) &&
          showEntry(item.to, item.perms),
      ),
    ],
  })).filter((group) => group.items.length > 0);
  const onFarmModule = nav.some((g) => g.items.some((i) => pathname === i.to || pathname.startsWith(`${i.to}/`)));
  useEffect(() => {
    if (onFarmModule) setFarmModulesOpen(true);
  }, [onFarmModule]);

  return (
    <div className="min-h-screen bg-slate-50">
      <aside
        className={classNames(
          'group/side fixed inset-y-0 left-0 z-40 flex w-64 flex-col bg-gradient-to-b from-brand-900 to-brand-950 text-brand-100 transition-[transform,width] duration-200 motion-reduce:transition-none md:translate-x-0 md:max-xl:w-[76px] md:max-xl:hover:w-64 md:max-xl:hover:shadow-2xl md:max-xl:has-[:focus-visible]:w-64',
          mobileOpen ? 'translate-x-0' : '-translate-x-full',
        )}
      >
        <div className="flex items-center gap-3 px-4 py-4">
          {/* Fermia leaf on every screen: the top bar no longer repeats it. */}
          <Logo className="h-9 w-auto shrink-0" />
          <div className={classNames('whitespace-nowrap', RAIL_BLOCK)}>
            {consoleMode ? (
              <>
                <p className="text-base font-bold tracking-[0.16em] text-white">POUFA</p>
                <p className="text-[11px] text-brand-200">DGE</p>
              </>
            ) : (
              <>
                <p className="text-sm font-bold text-white">Fermia</p>
                <p className="text-[11px] text-brand-200">Espace ferme</p>
              </>
            )}
          </div>
          <button
            className="ml-auto rounded p-1 text-brand-200 hover:text-white md:hidden"
            onClick={() => setMobileOpen(false)}
            aria-label="Fermer le menu"
          >
            <X className="h-5 w-5" />
          </button>
        </div>

        {!onProgramme && farms.length > 0 ? (
          <div className="px-3 md:max-xl:hidden">
            <p className="mb-1 block px-2 text-[11px] uppercase tracking-wide text-brand-300">{pickerLabel}</p>
            <FarmPicker
              tone="dark"
              farms={farms}
              farmId={farmId}
              onPick={(id) => {
                setFarm(id);
                setMobileOpen(false);
              }}
              label={pickerLabel}
            />
          </div>
        ) : null}

        <nav className="side-scroll mt-5 flex-1 overflow-y-auto overflow-x-hidden px-3">
          {consoleMode && programmeItems.length > 0 ? (
            <div className="mb-4">
              <p className={classNames('mb-1 whitespace-nowrap px-2 text-[11px] font-medium uppercase tracking-wider text-brand-300', RAIL_BLOCK)}>
                Programme
              </p>
              <NavItems items={programmeItems} onNavigate={() => setMobileOpen(false)} />
            </div>
          ) : null}
          {consoleMode && nav.length > 0 ? (
            <div className="mb-4 border-t border-white/10 pt-3">
              <button
                type="button"
                onClick={() => setFarmModulesOpen((o) => !o)}
                aria-expanded={farmModulesOpen}
                className={classNames(
                  'flex w-full items-center justify-between whitespace-nowrap px-2 py-1 text-left text-[11px] font-medium uppercase tracking-wider text-brand-300 hover:text-white md:max-xl:justify-center',
                )}
                title="Modules de gestion des fermes"
              >
                <span className={RAIL_TEXT}>Modules de gestion des fermes</span>
                <ChevronDown className={classNames('h-3.5 w-3.5 shrink-0 transition-transform', farmModulesOpen ? 'rotate-180' : '')} />
              </button>
            </div>
          ) : null}
          {(!consoleMode || farmModulesOpen) &&
            nav.map((group) => (
              <div key={group.title} className="mb-4">
                <p className={classNames('mb-1 whitespace-nowrap px-2 text-[11px] font-medium uppercase tracking-wider text-brand-300', RAIL_BLOCK)}>
                  {group.title}
                </p>
                <NavItems items={group.items} onNavigate={() => setMobileOpen(false)} />
              </div>
            ))}
          {!consoleMode && adminItems.length > 0 ? (
            <div>
              <p className={classNames('mb-1 whitespace-nowrap px-2 text-[11px] font-medium uppercase tracking-wider text-brand-300', RAIL_BLOCK)}>
                Programme
              </p>
              <NavItems items={adminItems} onNavigate={() => setMobileOpen(false)} />
            </div>
          ) : null}
        </nav>

        <div className="border-t border-white/10 px-3 py-3">
          {consoleMode ? (
            <p className={classNames('mb-2 flex items-center gap-1.5 whitespace-nowrap px-1 text-[11px] text-brand-300', RAIL_BLOCK)}>
              <Logo className="h-3.5 w-auto opacity-80" />
              propulsé par Fermia
            </p>
          ) : null}
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
          <div className="flex min-w-0 flex-1 items-center text-sm font-medium text-slate-700 lg:flex-none">
            {!onProgramme && farm ? (
              <>
                {/* The rail has no room for the farm picker: it moves up here. */}
                <FarmPicker
                  tone="light"
                  className="hidden w-64 md:max-xl:block"
                  farms={farms}
                  farmId={farmId}
                  onPick={setFarm}
                  label={pickerLabel}
                />
                <span className="line-clamp-2 min-w-0 break-words leading-tight sm:truncate md:max-xl:hidden">
                  {isAdmin ? <span className="hidden text-slate-400 sm:inline">Ferme : </span> : null}
                  {farm.name}
                </span>
                {farm.code ? (
                  <span className="ml-2 shrink-0 rounded bg-slate-100 px-1.5 py-0.5 font-mono text-xs font-semibold text-slate-600 md:max-xl:hidden">
                    {farm.code}
                  </span>
                ) : null}
                <span className="ml-2 hidden text-xs font-normal text-slate-400 sm:inline">
                  {farmProvince ? `${farmProvince} · ` : ''}
                  {farm.administrativeCity} · {farm.active ? 'ferme active' : 'ferme suspendue'}
                </span>
              </>
            ) : onPlatform ? (
              'Console administrateur plateforme'
            ) : onRegistry ? (
              'Registre des fermes du programme'
            ) : onProgrammeWide ? (
              programmeWideLabel(pathname)
            ) : onAccess ? (
              'Accès institutionnels du programme'
            ) : onPilotage ? (
              pilotage.view ? 'Pilotage du programme' : 'Rapports de fin de bande'
            ) : onSurveillance ? (
              'Surveillance sanitaire du programme'
            ) : onNotifications ? (
              'Notifications'
            ) : (
              adminHeader
            )}
          </div>
          <div className="ml-auto hidden items-center gap-2 text-xs text-slate-400 lg:flex">
            {!onProgramme && farm?.capacityPlaces ? <span>Capacité {farm.capacityPlaces.toLocaleString('fr-FR')} places</span> : null}
          </div>
          <div className="shrink-0 lg:ml-0">{!onProgramme && farmId ? <QuickCreate /> : null}</div>
          <ConnectionPulse interactive />
          {/* POUFA L5: unread notifications (hidden without the inbox right). */}
          <NotificationBell />
          {isAdmin ? (
            <button
              onClick={() => navigate('/app/platform')}
              className={classNames(
                'shrink-0 rounded-lg px-3 py-1.5 text-xs font-semibold transition',
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
              canOpen(pathname) ? (
                <Outlet />
              ) : accessLoading ? (
                <Loading />
              ) : (
                <PageNotOpen />
              )
            ) : (
              <NoFarmScreen state={space} onRetry={refetchFarms} />
            )}
          </motion.div>
        </main>
      </div>
    </div>
  );
}