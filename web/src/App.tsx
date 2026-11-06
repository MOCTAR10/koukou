import { Navigate, Route, Routes } from 'react-router-dom';
import { FarmProvider } from './app/FarmContext';
import { useFarmProfile } from './app/useFarmProfile';
import { RequiresAccessAdmin, RequiresAuth, RequiresBuyerArea, RequiresFarmAccount, RequiresInstitution, RequiresPermission, RequiresPlatformAdmin } from './auth/guards';
import { useAuth } from './auth/AuthContext';
import { LoginPage } from './auth/LoginPage';
import { BuyerRegisterPage } from './auth/BuyerRegisterPage';
import { MarketLayout } from './components/market/MarketLayout';
import { Shell } from './components/Shell';
import { Loading } from './components/ui';
import { DashboardPage } from './pages/DashboardPage';
import { GroundHomePage } from './pages/GroundHomePage';
import { BatchesPage } from './pages/BatchesPage';
import { AlertsPage } from './pages/AlertsPage';
import { SalesPage } from './pages/SalesPage';
import { CaissePage } from './pages/CaissePage';
import { CustomersPage } from './pages/CustomersPage';
import { PromotionsPage } from './pages/PromotionsPage';
import { StockPage } from './pages/StockPage';
import { SanitaryPage } from './pages/SanitaryPage';
import { SlaughterPage } from './pages/SlaughterPage';
import { TeamPage } from './pages/TeamPage';
import { SettingsPage } from './pages/SettingsPage';
import { PlatformPage } from './pages/PlatformPage';
import { RegistryPage } from './pages/RegistryPage';
import { OrdersPage } from './pages/OrdersPage';
import { PointsOfSalePage } from './pages/PointsOfSalePage';
import { ExpensesPage } from './pages/ExpensesPage';
import { AccountingPage } from './pages/AccountingPage';
import { ReportsPage } from './pages/ReportsPage';
import { TasksPage } from './pages/TasksPage';
import { HrPage } from './pages/HrPage';
import { ActivitiesPage } from './pages/ActivitiesPage';
import { HelpPage } from './pages/HelpPage';
import { MarketCataloguePage } from './pages/MarketCataloguePage';
import { MarketListingPage } from './pages/MarketListingPage';
import { MarketFarmPage } from './pages/MarketFarmPage';
import { BuyerAccountPage } from './pages/BuyerAccountPage';
import { BuyerOrderPage, BuyerOrdersPage } from './pages/BuyerOrdersPage';
import { AccessPage } from './pages/AccessPage';
import { MyAccessPage } from './pages/MyAccessPage';
import { PilotagePage } from './pages/PilotagePage';
import { InstitutionHomeRedirect } from './components/access/InstitutionHomeRedirect';
// POUFA L5: sanitary surveillance and notifications.
import { SurveillancePage } from './pages/SurveillancePage';
import { SurveillanceSettingsPage } from './pages/SurveillanceSettingsPage';
import { NotificationsPage } from './pages/NotificationsPage';
import { NotificationRulesPage } from './pages/NotificationRulesPage';
// --- Programme administration (parameters, audit journal, data recovery) ---
import { ParametersPage } from './pages/ParametersPage';
import { AuditPage } from './pages/AuditPage';
import { RecoveryPage } from './pages/RecoveryPage';
// --- end programme administration ---

/** The farm space's landing page (a buyer never gets here: RequiresFarmAccount). */
function HomeRedirect() {
  const { user } = useAuth();
  const { isGroundEleveur, isLoading } = useFarmProfile();
  if (user?.role === 'PLATFORM_ADMIN') return <Navigate to="/app/platform" replace />;
  if (user?.role === 'INSTITUTION') return <InstitutionHomeRedirect />;
  // The landing page depends on the profile: wait for it.
  if (isLoading) return <Loading />;
  return <Navigate to={isGroundEleveur ? '/app/home' : '/app/dashboard'} replace />;
}

export function App() {
  return (
    <Routes>
      <Route path="/login" element={<LoginPage />} />
      <Route path="/" element={<Navigate to="/app" replace />} />
      <Route path="/marche/inscription" element={<BuyerRegisterPage />} />
      <Route path="/marche" element={<MarketLayout />}>
        <Route index element={<MarketCataloguePage />} />
        <Route element={<RequiresBuyerArea />}>
          <Route path="commandes" element={<BuyerOrdersPage />} />
          <Route path="commandes/:id" element={<BuyerOrderPage />} />
          <Route path="compte" element={<BuyerAccountPage />} />
        </Route>
        <Route path=":id" element={<MarketListingPage />} />
      </Route>
      <Route element={<RequiresAuth />}>
        <Route element={<RequiresFarmAccount />}>
        <Route
          path="/app"
          element={
            <FarmProvider>
              <Shell />
            </FarmProvider>
          }
        >
          <Route index element={<HomeRedirect />} />
          <Route path="dashboard" element={<DashboardPage />} />
          <Route path="home" element={<GroundHomePage />} />
          <Route path="batches" element={<BatchesPage />} />
          <Route path="alerts" element={<AlertsPage />} />
          <Route path="finance" element={<RequiresPermission any={['vente:creer']}><SalesPage /></RequiresPermission>} />
          <Route path="finance/ventes" element={<RequiresPermission any={['vente:creer']}><SalesPage /></RequiresPermission>} />
          <Route path="finance/caisse" element={<RequiresPermission any={['caisse:lire']}><CaissePage /></RequiresPermission>} />
          <Route path="finance/clients" element={<RequiresPermission any={['compta:client']}><CustomersPage /></RequiresPermission>} />
          <Route path="finance/promotions" element={<RequiresPermission any={['vente:promotion']}><PromotionsPage /></RequiresPermission>} />
          <Route path="stock" element={<RequiresPermission any={['stock:gerer']}><StockPage /></RequiresPermission>} />
          <Route path="sanitary" element={<RequiresPermission any={['sanitaire:lecture']}><SanitaryPage /></RequiresPermission>} />
          <Route path="slaughter" element={<RequiresPermission any={['production:abattage']}><SlaughterPage /></RequiresPermission>} />
          <Route path="team" element={<RequiresPermission any={['equipe:gerer']}><TeamPage /></RequiresPermission>} />
          <Route path="settings" element={<SettingsPage />} />
          <Route path="orders" element={<RequiresPermission any={['vente:commande', 'vente:creer']}><OrdersPage /></RequiresPermission>} />
          <Route path="market" element={<RequiresPermission any={['market:publier', 'vente:commande']}><MarketFarmPage /></RequiresPermission>} />
          <Route path="points-of-sale" element={<RequiresPermission any={['pdv:gerer']}><PointsOfSalePage /></RequiresPermission>} />
          <Route path="expenses" element={<RequiresPermission any={['compta:depense']}><ExpensesPage /></RequiresPermission>} />
          <Route path="accounting" element={<RequiresPermission any={['compta:rapports']}><AccountingPage /></RequiresPermission>} />
          <Route path="reports" element={<RequiresPermission any={['compta:rapports']}><ReportsPage /></RequiresPermission>} />
          <Route path="tasks" element={<TasksPage />} />
          <Route path="hr" element={<RequiresPermission any={['rh:lire', 'equipe:gerer']}><HrPage /></RequiresPermission>} />
          <Route path="activities" element={<ActivitiesPage />} />
          {/* Cultures are hidden on the POUFA instance (poultry programme). */}
          <Route path="parcels" element={<Navigate to="/app/dashboard" replace />} />
          <Route path="harvests" element={<Navigate to="/app/dashboard" replace />} />
          <Route path="help" element={<HelpPage />} />
          {/* Programme farm registry: the page checks its own access (useMenuAccess). */}
          <Route path="registre" element={<RegistryPage />} />
          {/* POUFA L6: steering screens and reports (rights in components/pilotage/pilotageAccess.ts). */}
          <Route path="pilotage/*" element={<PilotagePage />} />
          {/* --- Programme administration: each page checks its own access (useMenuAccess().admin). --- */}
          <Route path="parametres/*" element={<ParametersPage />} />
          <Route path="audit/*" element={<AuditPage />} />
          <Route path="reprise/*" element={<RecoveryPage />} />
          {/* --- end programme administration --- */}
          <Route element={<RequiresPlatformAdmin />}>
            <Route path="platform" element={<PlatformPage />} />
          </Route>
          {/* Institutional access (POUFA): administration, and the account's own access. */}
          <Route element={<RequiresAccessAdmin />}>
            <Route path="acces/*" element={<AccessPage />} />
          </Route>
          <Route element={<RequiresInstitution />}>
            <Route path="mon-acces" element={<MyAccessPage />} />
          </Route>
          {/* POUFA L5 (begin): sanitary surveillance and notifications; each page checks the server matrix itself. */}
          <Route path="surveillance" element={<SurveillancePage />} />
          <Route path="surveillance/parametres" element={<SurveillanceSettingsPage />} />
          <Route path="notifications" element={<NotificationsPage />} />
          <Route path="notifications/regles" element={<NotificationRulesPage />} />
          {/* POUFA L5 (end) */}
        </Route>
        </Route>
      </Route>
      <Route path="*" element={<Navigate to="/app" replace />} />
    </Routes>
  );
}
