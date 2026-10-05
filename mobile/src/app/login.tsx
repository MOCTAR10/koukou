import React, { useRef, useState } from 'react';
import { Pressable, ScrollView, StyleSheet, TextInput, View } from 'react-native';
import { router } from 'expo-router';
import { Image } from 'expo-image';
import { StatusBar } from 'expo-status-bar';
import { ArrowRight, Lock, LogOut, ShieldCheck } from 'lucide-react-native';

import { AppText } from '@/components/ui/AppText';
import { Button } from '@/components/ui/Button';
import { PhoneInput } from '@/components/ui/PhoneInput';
import { PulsarDot } from '@/components/ui/PulsarDot';
import { useAuth } from '@/auth/AuthContext';
import { API_BASE_URL } from '@/api/client';
import { roleLabel } from '@/api/roles';
import { color, palette } from '@/constants/theme';
import { useKeyboardInset } from '@/hooks/useKeyboardInset';

export default function LoginScreen() {
  const { signedIn, user, farms, busy, error, signIn, signOut } = useAuth();
  const [phone, setPhone] = useState('');
  const [code, setCode] = useState('');
  const phoneRef = useRef<TextInput>(null);
  const codeRef = useRef<TextInput>(null);
  const keyboardInset = useKeyboardInset();

  const canSubmit = phone.trim().length > 0 && code.length > 0 && !busy;

  const submit = async () => {
    if (!canSubmit) return;
    const ok = await signIn(phone.trim(), code);
    if (ok) router.replace('/');
  };

  const focusCode = () => { codeRef.current?.focus(); };

  return (
    <View style={styles.root}>
      <StatusBar style="dark" />
      <ScrollView
        contentContainerStyle={[styles.scroll, { paddingBottom: keyboardInset + 24 }]}
        keyboardShouldPersistTaps="handled"
        keyboardDismissMode="on-drag"
        automaticallyAdjustKeyboardInsets={false}
        showsVerticalScrollIndicator={false}
      >
          <View style={styles.hero}>
            <Image
              source={require('@/assets/images/logo.png')}
              style={styles.logo}
              contentFit="contain"
              accessibilityLabel="Logo KouKou"
            />
            <View style={styles.titleRow}>
              <AppText size="h1" weight="bold" color={color.accent[500]}>
                KouKou
              </AppText>
              <PulsarDot />
            </View>
            <AppText size="bodyM" align="center" color="muted" style={{ marginTop: 8 }}>
              Votre élevage avicole, piloté au quotidien.
            </AppText>
          </View>

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
              <AppText size="small" color="faint">
                Serveur : {API_BASE_URL}
              </AppText>
              <View style={{ gap: 8, marginTop: 4 }}>
                <Button label="Continuer" tone="primary" icon={ArrowRight} onPress={() => router.replace('/')} />
                <Button label="Se déconnecter" tone="ghost" icon={LogOut} onPress={() => signOut()} />
              </View>
            </View>
          ) : (
            <View style={{ gap: 14 }}>
                  <PhoneInput
                ref={phoneRef}
                value={phone}
                onChangeText={setPhone}
                returnKeyType="next"
                onSubmitEditing={focusCode}
              />
              <View style={styles.field}>
                <Lock size={18} color={color.brand[600]} />
                <TextInput
                  ref={codeRef}
                  style={styles.input}
                  value={code}
                  onChangeText={setCode}
                  placeholder="Code secret"
                  placeholderTextColor={palette.ink[300]}
                  keyboardType="number-pad"
                  autoCapitalize="none"
                  returnKeyType="go"
                  onSubmitEditing={submit}
                  accessibilityLabel="Code secret"
                />
              </View>

              <Pressable onPress={() => {}} style={styles.forgotLink} accessibilityRole="link">
                <AppText size="small" color="muted" align="right">
                  Mot de passe oublié ?
                </AppText>
              </Pressable>

              {error ? (
                <AppText size="small" color="danger">
                  {error}
                </AppText>
              ) : null}

              <View style={{ gap: 10, marginTop: 6 }}>
                <Button
                  label="Se connecter"
                  tone="success"
                  size="lg"
                  labelSize="body"
                  image={require('@/assets/images/logo-white.png')}
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
        </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  root: {
    flex: 1,
    backgroundColor: palette.surface,
  },
  scroll: {
    flexGrow: 1,
    justifyContent: 'center',
    paddingHorizontal: 24,
    paddingVertical: 32,
  },
  hero: {
    alignItems: 'center',
    marginBottom: 30,
  },
  titleRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    marginTop: 14,
  },
  logo: {
    width: 224,
    height: 224,
  },
  field: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    height: 52,
    borderRadius: 18,
    backgroundColor: palette.surfaceAlt,
    paddingHorizontal: 16,
    borderWidth: 1,
    borderColor: color.border,
  },
  input: {
    flex: 1,
    fontSize: 16,
    color: palette.ink[900],
    padding: 0,
  },
  registerLink: {
    paddingVertical: 12,
    alignItems: 'center',
  },
  forgotLink: {
    paddingVertical: 6,
    alignSelf: 'flex-end',
  },
  connectedRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
  },
});
