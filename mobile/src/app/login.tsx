import React, { useState } from 'react';
import { Pressable, ScrollView, StyleSheet, View } from 'react-native';
import { router } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import { ArrowRight, LogOut, ShieldCheck } from 'lucide-react-native';

import { AppText } from '@/components/ui/AppText';
import { Button } from '@/components/ui/Button';
import { PhoneInput } from '@/components/ui/PhoneInput';
import { AuthHero } from '@/components/auth/AuthHero';
import { SecretCodePad } from '@/components/ui/SecretCodePad';
import { useAuth } from '@/auth/AuthContext';
import { roleLabel } from '@/api/roles';
import { palette, radii, semantic, shadow } from '@/constants/theme';
import { useKeyboardInset } from '@/hooks/useKeyboardInset';

export default function LoginScreen() {
  const { signedIn, user, farms, busy, error, signIn, signOut } = useAuth();
  const [phone, setPhone] = useState('');
  const [code, setCode] = useState('');
  const keyboardInset = useKeyboardInset();

  const canSubmit = phone.trim().length > 0 && code.length >= 6 && !busy;

  const submit = async () => {
    if (!canSubmit) return;
    const ok = await signIn(phone.trim(), code);
    if (ok) router.replace('/');
  };

  return (
    <View style={styles.root}>
      <StatusBar style="light" />
      <ScrollView
        contentContainerStyle={[styles.scroll, { paddingBottom: keyboardInset + 24 }]}
        keyboardShouldPersistTaps="handled"
        keyboardDismissMode="on-drag"
        automaticallyAdjustKeyboardInsets={false}
        showsVerticalScrollIndicator={false}
      >
          <AuthHero subtitle="Élevage et cultures, pilotés au quotidien." />

          <View style={styles.sheet}>
          <AppText size="h2" weight="bold" color="text">
            {signedIn ? 'Bon retour' : 'Connexion'}
          </AppText>
          <AppText size="caption" color="muted" style={styles.sheetSub}>
            {signedIn ? 'Votre session est active sur cet appareil.' : 'Votre numéro de téléphone et votre code secret.'}
          </AppText>

          {signedIn ? (
            <View style={{ gap: 10 }}>
              <View style={styles.connectedRow}>
                <ShieldCheck size={18} color={palette.green[600]} />
                <View style={{ flex: 1 }}>
                  <AppText size="bodyM" weight="semibold" color="text">
                    {user.fullName} · {roleLabel(user.role)}
                  </AppText>
                  <AppText size="caption" color="muted">
                    {user.phone} · connecté au serveur
                  </AppText>
                </View>
              </View>
              {farms[0] ? (
                <AppText size="caption" color="muted">
                  Ferme active : {farms[0].name}
                </AppText>
              ) : null}
              <View style={{ gap: 8, marginTop: 4 }}>
                <Button label="Continuer" tone="primary" icon={ArrowRight} onPress={() => router.replace('/')} />
                <Button label="Se déconnecter" tone="ghost" icon={LogOut} onPress={() => signOut()} />
              </View>
            </View>
          ) : (
            <View style={{ gap: 14 }}>
              <PhoneInput
                value={phone}
                onChangeText={setPhone}
                returnKeyType="next"
                onSubmitEditing={() => void submit()}
              />

              <SecretCodePad
                value={code}
                onChange={setCode}
                onSubmit={() => void submit()}
                disabled={busy}
                submitEnabled={phone.trim().length > 0}
                caption="6 chiffres minimum"
                size="sm"
              />

              {error ? (
                <AppText size="small" color="danger">
                  {error}
                </AppText>
              ) : null}

              <View style={{ gap: 10, marginTop: 2 }}>
                <Button
                  label="Se connecter"
                  tone="primary"
                  size="lg"
                  labelSize="body"
                  icon={ArrowRight}
                  loading={busy}
                  disabled={!canSubmit}
                  onPress={submit}
                />
              </View>

              <Pressable onPress={() => router.push('/register')} style={styles.registerLink} accessibilityRole="link">
                <AppText size="bodyM" align="center" color="muted">
                  Pas encore de compte ?{' '}
                  <AppText size="bodyM" weight="semibold" color="brand">
                    Créer mon compte →
                  </AppText>
                </AppText>
              </Pressable>
            </View>
          )}
          </View>
        </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  root: {
    flex: 1,
    backgroundColor: semantic.bg,
  },
  scroll: {
    flexGrow: 1,
  },
  // Form card overlaps the hero: one raised surface, the brand behind it.
  sheet: {
    marginTop: -40,
    marginHorizontal: 16,
    padding: 20,
    gap: 4,
    backgroundColor: semantic.surface,
    borderRadius: radii.xxl,
    borderWidth: 1,
    borderColor: palette.border,
    ...shadow.raised,
  },
  sheetSub: {
    marginBottom: 14,
  },
  registerLink: {
    paddingVertical: 12,
    alignItems: 'center',
  },
  connectedRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
  },
});
