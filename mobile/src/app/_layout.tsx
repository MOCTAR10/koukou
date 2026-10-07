import React, { useEffect } from 'react';
import { Platform } from 'react-native';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { Stack } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import * as NavigationBar from 'expo-navigation-bar';
import { SafeAreaProvider } from 'react-native-safe-area-context';

import { QuickCaptureProvider } from '@/components/capture/QuickCaptureProvider';
import { CreateCenterProvider } from '@/components/create/CreateCenter';
import { OfflineAutoSync } from '@/components/OfflineAutoSync';
import { AuthProvider, useAuth } from '@/auth/AuthContext';
import { palette } from '@/constants/theme';

const queryClient = new QueryClient({
  defaultOptions: { queries: { staleTime: 30_000, retry: 1 } },
});

function RootNavigator() {
  const { signedIn } = useAuth();

  return (
    <Stack
      screenOptions={{
        headerShown: false,
        contentStyle: { backgroundColor: palette.paper },
      }}>
      <Stack.Protected guard={signedIn}>
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
      <Stack.Screen name="login" />
      <Stack.Screen name="register" />
    </Stack>
  );
}

export default function RootLayout() {
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

  return (
    <SafeAreaProvider>
      <QueryClientProvider client={queryClient}>
        <AuthProvider>
          <QuickCaptureProvider>
            <CreateCenterProvider>
              <OfflineAutoSync />
              <StatusBar style="dark" />
              <RootNavigator />
            </CreateCenterProvider>
          </QuickCaptureProvider>
        </AuthProvider>
      </QueryClientProvider>
    </SafeAreaProvider>
  );
}