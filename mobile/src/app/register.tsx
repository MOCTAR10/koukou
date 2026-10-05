import React, { useRef, useState } from 'react';
import { Pressable, ScrollView, StyleSheet, TextInput, View } from 'react-native';
import { router } from 'expo-router';
import { Image } from 'expo-image';
import { StatusBar } from 'expo-status-bar';
import { ArrowLeft, Check, CheckCircle2, Lock, Tractor, User } from 'lucide-react-native';

import { AppText } from '@/components/ui/AppText';
import { Button } from '@/components/ui/Button';
import { PhoneInput } from '@/components/ui/PhoneInput';
import { PulsarDot } from '@/components/ui/PulsarDot';
import { useAuth } from '@/auth/AuthContext';
import { isGabonPhoneValid } from '@/constants/phone';
import { color, palette } from '@/constants/theme';
import { useKeyboardInset } from '@/hooks/useKeyboardInset';

type Step = 1 | 2;

export default function RegisterScreen() {
  const { busy, error, signUp } = useAuth();
  const [step, setStep] = useState<Step>(1);
  const [fullName, setFullName] = useState('');
  const [farmName, setFarmName] = useState('');
  const [phone, setPhone] = useState('');
  const [code, setCode] = useState('');
  const [codeConfirm, setCodeConfirm] = useState('');
  const [localError, setLocalError] = useState<string | null>(null);

  const phoneRef = useRef<TextInput>(null);
  const farmNameRef = useRef<TextInput>(null);
  const codeRef = useRef<TextInput>(null);
  const codeConfirmRef = useRef<TextInput>(null);
  const keyboardInset = useKeyboardInset();

  const fallbackFarmName = fullName.trim() ? `Ferme de ${fullName.trim()}` : '';

  const canContinue = fullName.trim().length >= 3 && !busy;
  const canSubmit =
    isGabonPhoneValid(phone) && code.length >= 6 && codeConfirm.length > 0 && code === codeConfirm && !busy;

  const submit = async () => {
    if (!canSubmit) return;
    if (code !== codeConfirm) {
      setLocalError('Les deux codes ne correspondent pas.');
      return;
    }
    setLocalError(null);
    const ok = await signUp(phone, fullName.trim(), code, farmName.trim() || undefined);
    if (ok) router.replace('/');
  };

  const signInLink = (
    <Pressable onPress={() => router.back()} style={styles.registerLink} accessibilityRole="link">
      <AppText size="bodyM" color="muted" align="center">
        J’ai déjà un compte ?{' '}
        <AppText size="bodyM" weight="semibold" color="brand">
          Me connecter →
        </AppText>
      </AppText>
    </Pressable>
  );

  if (step === 1) {
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
            <View style={styles.heroBig}>
              <Image
                source={require('@/assets/images/logo.png')}
                style={styles.logoBig}
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

            <View style={{ gap: 12 }}>
              <View style={styles.field}>
                <User size={16} color={color.brand[600]} />
                <TextInput
                  style={styles.input}
                  value={fullName}
                  onChangeText={setFullName}
                  placeholder="Nom complet"
                  placeholderTextColor={palette.ink[300]}
                  autoCapitalize="words"
                  returnKeyType="next"
                  onSubmitEditing={() => farmNameRef.current?.focus()}
                  accessibilityLabel="Nom complet"
                />
              </View>

              {fullName.trim().length > 0 && fullName.trim().length < 3 ? (
                <AppText size="small" color="danger">
                  Le nom doit comporter au moins 3 lettres.
                </AppText>
              ) : null}

              <View style={styles.field}>
                <Tractor size={16} color={color.brand[600]} />
                <TextInput
                  ref={farmNameRef}
                  style={styles.input}
                  value={farmName}
                  onChangeText={setFarmName}
                  placeholder={fallbackFarmName || 'Nom de la ferme'}
                  placeholderTextColor={palette.ink[300]}
                  autoCapitalize="words"
                  returnKeyType="go"
                  onSubmitEditing={() => {
                    if (canContinue) setStep(2);
                  }}
                  accessibilityLabel="Nom de la ferme"
                />
              </View>

              <AppText size="small" color="faint">
                {fallbackFarmName && farmName.trim() === ''
                  ? `Optionnel — sans nom, votre ferme s’appellera « ${fallbackFarmName} ».`
                  : 'Optionnel — modifiable plus tard dans Mon profil.'}
              </AppText>

              <Button
                label="Continuer"
                tone="primary"
                size="lg"
                labelSize="body"
                image={require('@/assets/images/logo-white.png')}
                disabled={!canContinue}
                onPress={() => setStep(2)}
              />
              {signInLink}
            </View>
          </ScrollView>
      </View>
    );
  }

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
              style={styles.logoSmall}
              contentFit="contain"
              accessibilityLabel="Logo KouKou"
            />
            <AppText size="h1" weight="bold" color={color.accent[500]} style={{ marginTop: 10 }}>
              Créer mon compte
            </AppText>
          </View>

          <Pressable onPress={() => setStep(1)} style={styles.backLink} accessibilityRole="link">
            <ArrowLeft size={15} color={palette.ink[400]} />
            <AppText size="bodyM" color="muted">
              Revenir au nom
            </AppText>
          </Pressable>

          <View style={{ gap: 10 }}>
            <PhoneInput
              ref={phoneRef}
              compact
              value={phone}
              onChangeText={setPhone}
              returnKeyType="next"
              onSubmitEditing={() => codeRef.current?.focus()}
            />

            <View style={styles.field}>
              <Lock size={16} color={color.brand[600]} />
              <TextInput
                ref={codeRef}
                style={styles.input}
                value={code}
                onChangeText={setCode}
                placeholder="Code secret (min. 6 chiffres)"
                placeholderTextColor={palette.ink[300]}
                keyboardType="number-pad"
                secureTextEntry
                autoCapitalize="none"
                returnKeyType="next"
                onSubmitEditing={() => codeConfirmRef.current?.focus()}
                accessibilityLabel="Code secret"
              />
            </View>

            <View style={styles.field}>
              <Check size={16} color={color.brand[600]} />
              <TextInput
                ref={codeConfirmRef}
                style={styles.input}
                value={codeConfirm}
                placeholder="Confirmer le code secret"
                placeholderTextColor={palette.ink[300]}
                keyboardType="number-pad"
                secureTextEntry
                autoCapitalize="none"
                returnKeyType="go"
                onChangeText={t => {
                  setCodeConfirm(t);
                  if (localError) setLocalError(null);
                }}
                onSubmitEditing={submit}
                accessibilityLabel="Confirmer le code secret"
              />
              {code.length >= 6 && code === codeConfirm ? (
                <CheckCircle2 size={16} color={palette.green[600]} />
              ) : null}
            </View>

            {localError ? (
              <AppText size="small" color="danger">
                {localError}
              </AppText>
            ) : null}
            {!localError && error ? (
              <AppText size="small" color="danger">
                {error}
              </AppText>
            ) : null}

            <View style={{ gap: 8, marginTop: 4 }}>
              <Button
                label="Créer mon compte"
                tone="success"
                size="lg"
                labelSize="body"
                image={require('@/assets/images/logo-white.png')}
                loading={busy}
                disabled={!canSubmit}
                onPress={submit}
              />
            </View>

            {signInLink}
          </View>
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
  heroBig: {
    alignItems: 'center',
    marginBottom: 22,
  },
  titleRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    marginTop: 12,
  },
  logoBig: {
    width: 240,
    height: 240,
  },
  hero: {
    alignItems: 'center',
    marginBottom: 14,
  },
  logoSmall: {
    width: 176,
    height: 176,
  },
  field: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    height: 44,
    borderRadius: 14,
    backgroundColor: palette.surfaceAlt,
    paddingHorizontal: 14,
    borderWidth: 1,
    borderColor: color.border,
  },
  input: {
    flex: 1,
    fontSize: 15,
    color: palette.ink[900],
    padding: 0,
  },
  backLink: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    alignSelf: 'flex-start',
    paddingVertical: 6,
    marginBottom: 12,
  },
  registerLink: {
    paddingVertical: 12,
    alignItems: 'center',
  },
});