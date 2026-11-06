import { Navigate, Route, Routes } from 'react-router-dom';
import { FarmProvider } from './app/FarmContext';
import { useFarmProfile } from './app/useFarmProfile';
import { RequiresAuth, RequiresPermission, RequiresPlatformAdmin } from './auth/guards';
import { useAuth } from './auth/AuthContext';
import { LoginPage } from './auth/LoginPage';
import { RegisterPage } from './auth/RegisterPage';
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
import { OrdersPage } from './pages/OrdersPage';
import { PointsOfSalePage } from './pages/PointsOfSalePage';
import { ExpensesPage } from './pages/ExpensesPage';
import { AccountingPage } from './pages/AccountingPage';
import { ReportsPage } from './pages/ReportsPage';
import { TasksPage } from './pages/TasksPage';
import { HrPage } from './pages/HrPage';
import { ActivitiesPage } from './pages/ActivitiesPage';
import { ParcelsPage } from './pages/ParcelsPage';
import { HarvestsPage } from './pages/HarvestsPage';
import { HelpPage } from './pages/HelpPage';

function HomeRedirect() {
  const { user } = useAuth();
  const { isGroundEleveur, isLoading } = useFarmProfile();
  if (user?.role === 'PLATFORM_ADMIN') return <Navigate to="/app/platform" replace />;
  // The landing page depends on the profile: wait for it.
  if (isLoading) return <Loading />;
  return <Navigate to={isGroundEleveur ? '/app/home' : '/app/dashboard'} replace />;
}

export function App() {
  return (
    <Routes>
      <Route path="/login" element={<LoginPage />} />
      <Route path="/register" element={<RegisterPage />} />
      <Route path="/" element={<Navigate to="/app" replace />} />
      <Route element={<RequiresAuth />}>
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
          <Route path="points-of-sale" element={<RequiresPermission any={['pdv:gerer']}><PointsOfSalePage /></RequiresPermission>} />
          <Route path="expenses" element={<RequiresPermission any={['compta:depense']}><ExpensesPage /></RequiresPermission>} />
          <Route path="accounting" element={<RequiresPermission any={['compta:rapports']}><AccountingPage /></RequiresPermission>} />
          <Route path="reports" element={<RequiresPermission any={['compta:rapports']}><ReportsPage /></RequiresPermission>} />
          <Route path="tasks" element={<TasksPage />} />
          <Route path="hr" element={<RequiresPermission any={['rh:lire', 'equipe:gerer']}><HrPage /></RequiresPermission>} />
          <Route path="activities" element={<ActivitiesPage />} />
          <Route path="parcels" element={<ParcelsPage />} />
          <Route path="harvests" element={<HarvestsPage />} />
          <Route path="help" element={<HelpPage />} />
          <Route element={<RequiresPlatformAdmin />}>
            <Route path="platform" element={<PlatformPage />} />
          </Route>
        </Route>
      </Route>
      <Route path="*" element={<Navigate to="/app" replace />} />
    </Routes>
  );
}