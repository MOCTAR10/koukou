import React, { useRef, useState } from 'react';
import { Pressable, ScrollView, StyleSheet, TextInput, View } from 'react-native';
import { router } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import { ArrowLeft, ArrowRight, Check, Tractor, User } from 'lucide-react-native';

import { AppText } from '@/components/ui/AppText';
import { Button } from '@/components/ui/Button';
import { PhoneInput } from '@/components/ui/PhoneInput';
import { AuthHero } from '@/components/auth/AuthHero';
import { SecretCodePad } from '@/components/ui/SecretCodePad';
import { useAuth } from '@/auth/AuthContext';
import { isGabonPhoneValid } from '@/constants/phone';
import { color, palette, fontFamily, radii, semantic, shadow } from '@/constants/theme';
import { useKeyboardInset } from '@/hooks/useKeyboardInset';

type Step = 1 | 2;
type CodePhase = 'code' | 'confirm';

export default function RegisterScreen() {
  const { busy, error, signUp } = useAuth();
  const [step, setStep] = useState<Step>(1);
  const [fullName, setFullName] = useState('');
  const [farmName, setFarmName] = useState('');
  const [phone, setPhone] = useState('');
  const [code, setCode] = useState('');
  const [codeConfirm, setCodeConfirm] = useState('');
  const [codePhase, setCodePhase] = useState<CodePhase>('code');
  const [localError, setLocalError] = useState<string | null>(null);

  const farmNameRef = useRef<TextInput>(null);
  const keyboardInset = useKeyboardInset();

  const canContinue = fullName.trim().length >= 3 && farmName.trim().length >= 3 && !busy;
  const canSubmit =
    isGabonPhoneValid(phone) && code.length >= 6 && codeConfirm.length > 0 && code === codeConfirm && !busy;

  const submit = async () => {
    if (!canSubmit) return;
    if (code !== codeConfirm) {
      setLocalError('Les deux codes ne correspondent pas.');
      return;
    }
    setLocalError(null);
    const ok = await signUp(phone, fullName.trim(), code, farmName.trim());
    if (ok) router.replace('/');
  };

  const activeCode = codePhase === 'code' ? code : codeConfirm;
  const setActiveCode = codePhase === 'code' ? setCode : setCodeConfirm;

  const handlePadSubmit = () => {
    if (codePhase === 'code') {
      if (code.length < 6) return;
      setLocalError(null);
      setCodeConfirm('');
      setCodePhase('confirm');
      return;
    }
    void submit();
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
              <AppText size="label" color="brand" style={styles.stepEyebrow}>ÉTAPE 1 SUR 2</AppText>
              <AppText size="h2" weight="bold" color="text">Créer mon compte</AppText>
              <AppText size="caption" color="muted" style={styles.sheetSub}>Votre nom et celui de votre ferme.</AppText>
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
                  placeholder="Nom de la ferme"
                  placeholderTextColor={palette.ink[300]}
                  autoCapitalize="words"
                  returnKeyType="go"
                  onSubmitEditing={() => {
                    if (canContinue) setStep(2);
                  }}
                  accessibilityLabel="Nom de la ferme"
                />
              </View>

              {farmName.trim().length > 0 && farmName.trim().length < 3 ? (
                <AppText size="small" color="danger">
                  Le nom de la ferme doit comporter au moins 3 lettres.
                </AppText>
              ) : null}

              <AppText size="small" color="faint">
                Modifiable plus tard dans Mon profil.
              </AppText>

              <Button
                label="Continuer"
                tone="primary"
                size="lg"
                labelSize="body"
                icon={ArrowRight}
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
      <StatusBar style="light" />
      <ScrollView
        contentContainerStyle={[styles.scroll, { paddingBottom: keyboardInset + 24 }]}
        keyboardShouldPersistTaps="handled"
        keyboardDismissMode="on-drag"
        automaticallyAdjustKeyboardInsets={false}
        showsVerticalScrollIndicator={false}
      >
          <AuthHero compact />

          <View style={styles.sheet}>
          <AppText size="label" color="brand" style={styles.stepEyebrow}>ÉTAPE 2 SUR 2</AppText>
          <AppText size="h2" weight="bold" color="text">Votre accès</AppText>
          <AppText size="caption" color="muted" style={styles.sheetSub}>Votre numéro et un code secret pour vous connecter.</AppText>

          <Pressable onPress={() => setStep(1)} style={styles.backLink} accessibilityRole="link">
            <ArrowLeft size={15} color={palette.ink[400]} />
            <AppText size="bodyM" color="muted">
              Revenir au nom
            </AppText>
          </Pressable>

          <View style={{ gap: 10 }}>
            <PhoneInput
              compact
              value={phone}
              onChangeText={setPhone}
              returnKeyType="next"
            />

            <View style={styles.phaseRow}>
              <Pressable
                onPress={() => setCodePhase('code')}
                style={[styles.phaseChip, codePhase === 'code' && styles.phaseChipOn]}
                accessibilityRole="tab"
                accessibilityState={{ selected: codePhase === 'code' }}>
                <AppText
                  size="label"
                  weight={codePhase === 'code' ? 'semibold' : 'medium'}
                  color={codePhase === 'code' ? 'brand' : 'muted'}>
                  1 · Code secret
                </AppText>
              </Pressable>
              <Pressable
                onPress={() => code.length >= 6 && setCodePhase('confirm')}
                style={[styles.phaseChip, codePhase === 'confirm' && styles.phaseChipOn]}
                accessibilityRole="tab"
                accessibilityState={{ selected: codePhase === 'confirm' }}>
                <AppText
                  size="label"
                  weight={codePhase === 'confirm' ? 'semibold' : 'medium'}
                  color={codePhase === 'confirm' ? 'brand' : 'muted'}>
                  2 · Confirmation
                </AppText>
              </Pressable>
            </View>

            <SecretCodePad
              value={activeCode}
              onChange={(next) => {
                setActiveCode(next);
                if (localError) setLocalError(null);
              }}
              onSubmit={handlePadSubmit}
              disabled={busy}
              submitEnabled={
                codePhase === 'code' ? code.length >= 6 : code.length >= 6 && code === codeConfirm
              }
              label={codePhase === 'code' ? 'Choisissez un code secret' : 'Confirmez votre code secret'}
              caption="6 chiffres minimum"
              size="sm"
            />

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
                tone="primary"
                size="lg"
                labelSize="body"
                icon={Check}
                loading={busy}
                disabled={!canSubmit}
                onPress={submit}
              />
            </View>

            {signInLink}
          </View>
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
  sheet: {
    marginTop: -40,
    marginHorizontal: 16,
    padding: 20,
    gap: 12,
    backgroundColor: semantic.surface,
    borderRadius: radii.xxl,
    borderWidth: 1,
    borderColor: semantic.border,
    ...shadow.raised,
  },
  stepEyebrow: {
    letterSpacing: 1,
    marginBottom: -8,
  },
  sheetSub: {
    marginTop: -8,
  },
  phaseRow: {
    flexDirection: 'row',
    gap: 8,
  },
  phaseChip: {
    flex: 1,
    paddingVertical: 9,
    paddingHorizontal: 12,
    borderRadius: 999,
    backgroundColor: semantic.surfaceAlt,
    borderWidth: 1,
    borderColor: color.border,
    alignItems: 'center',
  },
  phaseChipOn: {
    backgroundColor: color.brand[50],
    borderColor: color.brand[300],
  },
  field: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    height: 44,
    borderRadius: 14,
    backgroundColor: semantic.surfaceAlt,
    paddingHorizontal: 14,
    borderWidth: 1,
    borderColor: color.border,
  },
  input: {
    fontFamily: fontFamily.regular,
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
    paddingVertical: 4,
    marginBottom: 8,
  },
  registerLink: {
    fontFamily: fontFamily.regular,
    paddingVertical: 12,
    alignItems: 'center',
  },
});