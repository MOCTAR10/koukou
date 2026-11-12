import '@/diagnostics/install-crash-log';
import React, { useEffect, useState } from 'react';
import { AppState, Platform } from 'react-native';
import { focusManager, QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { Stack } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import * as NavigationBar from 'expo-navigation-bar';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import * as SplashScreen from 'expo-splash-screen';
import { useFonts } from 'expo-font';
import { Inter_400Regular } from '@expo-google-fonts/inter/400Regular';
import { Inter_500Medium } from '@expo-google-fonts/inter/500Medium';
import { Inter_600SemiBold } from '@expo-google-fonts/inter/600SemiBold';
import { Inter_700Bold } from '@expo-google-fonts/inter/700Bold';

import { QuickCaptureProvider } from '@/components/capture/QuickCaptureProvider';
import { CreateCenterProvider } from '@/components/create/CreateCenter';
import { LocalReminders } from '@/components/LocalReminders';
import { PushRegistration } from '@/components/PushRegistration';
import { OfflineAutoSync } from '@/components/OfflineAutoSync';
import { AppUpdateBanner } from '@/components/AppUpdateBanner';
import { FeedbackHost } from '@/components/ui/Feedback';
import { AuthProvider, useAuth } from '@/auth/AuthContext';
import { semantic } from '@/constants/theme';
import { accountArea } from '@/api/roles';
import { QUERY_DEFAULT_OPTIONS } from '@/offline/query-defaults';
import { startQueryPersist } from '@/offline/query-persist';
import { previousCrash } from '@/diagnostics/crash-log';
import { CrashReportScreen } from '@/diagnostics/CrashReportScreen';

// Keep the native splash up until the brand typeface is ready, so the first
// frame never flashes in the system font.
SplashScreen.preventAutoHideAsync().catch(() => {});

const queryClient = new QueryClient({ defaultOptions: QUERY_DEFAULT_OPTIONS });

// Reads survive a cold start offline: the signed-in account's saved answers
// are loaded now, and kept saved while the app runs.
startQueryPersist(queryClient);

// Back in the foreground = refetch the stale queries (no window focus on native).
if (Platform.OS !== 'web') {
  AppState.addEventListener('change', (state) => focusManager.setFocused(state === 'active'));
}

function RootNavigator() {
  const { signedIn, user, farms } = useAuth();
  // A buyer only ever reaches the Market area (by role, whatever farms says);
  // any other account without a farm gets the « no farm » screen. A denied
  // route (deep link) falls back to the first screen its guard allows.
  const area = accountArea(user.role, farms.length);

  return (
    <Stack
      screenOptions={{
        headerShown: false,
        contentStyle: { backgroundColor: semantic.bg },
      }}>
      <Stack.Protected guard={signedIn && area === 'farm'}>
        <Stack.Screen name="(tabs)" />
        <Stack.Screen name="lot/[id]" />
        <Stack.Screen name="commande/[id]" />
        <Stack.Screen name="aide" />
        <Stack.Screen name="caisse" />
        <Stack.Screen name="clients" />
        <Stack.Screen name="commandes" />
        <Stack.Screen name="comptabilite" />
        <Stack.Screen name="depenses" />
        <Stack.Screen name="equipe" />
        <Stack.Screen name="points-vente" />
        <Stack.Screen name="pos" />
        <Stack.Screen name="rapports" />
        <Stack.Screen name="reglages" />
        <Stack.Screen name="rh" />
        <Stack.Screen name="declarations" />
        <Stack.Screen name="sanitary" />
        <Stack.Screen name="slaughter" />
        {/* POUFA lot A droits: programme economic synthesis (DGE / platform admin). */}
        <Stack.Screen name="synthese" />
        <Stack.Screen name="tasks" />
        {/* ── POUFA field work (M2) ── */}
        <Stack.Screen name="livraisons/index" />
        <Stack.Screen name="livraisons/[id]" />
        <Stack.Screen name="visites" />
        {/* ── end POUFA ── */}
      </Stack.Protected>
      {/* ── POUFA notification inbox (M2) ── */}
      <Stack.Protected guard={signedIn && area !== 'buyer'}>
        <Stack.Screen name="notifications/index" />
        <Stack.Screen name="notifications/[id]" />
      </Stack.Protected>
      {/* ── end POUFA ── */}
      <Stack.Protected guard={signedIn && area === 'buyer'}>
        <Stack.Screen name="(acheteur)" />
      </Stack.Protected>
      <Stack.Protected guard={signedIn && area === 'no-farm'}>
        <Stack.Screen name="sans-ferme" />
      </Stack.Protected>
      <Stack.Protected guard={signedIn}>
        <Stack.Screen name="achat/[id]" />
        <Stack.Screen name="mes-achats" />
        <Stack.Screen name="profil-acheteur" />
      </Stack.Protected>
      <Stack.Screen name="login" />
      <Stack.Screen name="inscription-acheteur" />
      <Stack.Screen name="annonces/index" />
      <Stack.Screen name="annonces/[id]" />
    </Stack>
  );
}

export default function RootLayout() {
  // A crash at startup would repeat before any alert shows: the report screen
  // uses React Native core components only and replaces the whole app once.
  const [crash, setCrash] = useState(previousCrash);
  if (crash) return <CrashReportScreen crash={crash} onContinue={() => setCrash(null)} />;
  return <AppRoot />;
}

function AppRoot() {
  // Per-weight imports: the package root would bundle all 18 Inter files.
  const [fontsLoaded, fontError] = useFonts({ Inter_400Regular, Inter_500Medium, Inter_600SemiBold, Inter_700Bold });
  const fontsReady = fontsLoaded || fontError != null;

  useEffect(() => {
    if (fontsReady) SplashScreen.hideAsync().catch(() => {});
  }, [fontsReady]);

  useEffect(() => {
    if (Platform.OS === "android") {
      // Edge-to-edge (SDK 54) : la barre système Android est transparente et le
      // contenu dessine derrière. `setStyle('dark')` demande des icônes sombres
      // (barre claire) — Android 15+ peut y substituer un contraste forcé ; on
      // force la synchro via `setButtonStyleAsync` pour tenir sur tous appareils.
      NavigationBar.setStyle("dark");
      NavigationBar.setButtonStyleAsync("dark").catch(() => {});
    }
  }, []);

  if (!fontsReady) return null;

  return (
    <SafeAreaProvider>
      <QueryClientProvider client={queryClient}>
        <AuthProvider>
          <QuickCaptureProvider>
            <CreateCenterProvider>
              <OfflineAutoSync />
              <LocalReminders />
              <PushRegistration />
              <StatusBar style="dark" />
              <RootNavigator />
              <AppUpdateBanner />
              <FeedbackHost />
            </CreateCenterProvider>
          </QuickCaptureProvider>
        </AuthProvider>
      </QueryClientProvider>
    </SafeAreaProvider>
  );
}