import React, { useEffect } from 'react';
import { Platform } from 'react-native';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
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
import { FeedbackHost } from '@/components/ui/Feedback';
import { AuthProvider, useAuth } from '@/auth/AuthContext';
import { semantic } from '@/constants/theme';
import { accountArea } from '@/api/roles';

// Keep the native splash up until the brand typeface is ready, so the first
// frame never flashes in the system font.
SplashScreen.preventAutoHideAsync().catch(() => {});

const queryClient = new QueryClient({
  defaultOptions: { queries: { staleTime: 30_000, retry: 1 } },
});

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
        <Stack.Screen name="sanitary" />
        <Stack.Screen name="slaughter" />
        <Stack.Screen name="tasks" />
      </Stack.Protected>
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
              <FeedbackHost />
            </CreateCenterProvider>
          </QuickCaptureProvider>
        </AuthProvider>
      </QueryClientProvider>
    </SafeAreaProvider>
  );
}