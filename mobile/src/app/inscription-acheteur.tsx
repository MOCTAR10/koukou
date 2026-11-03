import React, { useState } from 'react';
import { Pressable, ScrollView, StyleSheet, View } from 'react-native';
import { router, useLocalSearchParams, type Href } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import { ArrowLeft, ArrowRight } from 'lucide-react-native';

import { safeReturnPath } from '@/api/roles';
import type { CustomerType } from '@/api/types';
import { useAuth } from '@/auth/AuthContext';
import { AuthHero } from '@/components/auth/AuthHero';
import { BUYER_TYPES, Labeled, PillRow } from '@/components/market/shared';
import { AppText } from '@/components/ui/AppText';
import { Button } from '@/components/ui/Button';
import { PhoneInput } from '@/components/ui/PhoneInput';
import { SecretCodePad } from '@/components/ui/SecretCodePad';
import { TextField } from '@/components/ui/TextField';
import { customerTypeLabel } from '@/constants/customers';
import { isGabonPhoneValid } from '@/constants/phone';
import { palette, radii, semantic, shadow } from '@/constants/theme';
import { useKeyboardInset } from '@/hooks/useKeyboardInset';

/** Account of someone who buys: no farm is created. */
export default function BuyerRegisterScreen() {
  const { from } = useLocalSearchParams<{ from?: string }>();
  const { busy, error, registerBuyer } = useAuth();
  const keyboardInset = useKeyboardInset();
  const [step, setStep] = useState<1 | 2>(1);
  const [fullName, setFullName] = useState('');
  const [type, setType] = useState<CustomerType>('PARTICULIER');
  const [organizationName, setOrganizationName] = useState('');
  const [city, setCity] = useState('');
  const [phone, setPhone] = useState('');
  const [code, setCode] = useState('');
  const [confirmation, setConfirmation] = useState('');
  const [phase, setPhase] = useState<'code' | 'confirm'>('code');

  const mismatch = phase === 'confirm' && confirmation.length >= code.length && confirmation !== code;
  const canSubmit = isGabonPhoneValid(phone) && code.length >= 6 && code === confirmation && !busy;

  const submit = async () => {
    if (!canSubmit) return;
    const ok = await registerBuyer({
      phone,
      fullName: fullName.trim(),
      code,
      type,
      organizationName: type !== 'PARTICULIER' ? organizationName.trim() || undefined : undefined,
      city: city.trim() || undefined,
    });
    if (!ok) return;
    const back = safeReturnPath(from);
    // dismissTo pops back to the screen they came from, instead of stacking a second copy of it.
    if (back) router.dismissTo(back as Href);
    else router.replace('/accueil' as Href);
  };

  const onPadSubmit = () => {
    if (phase === 'code') {
      if (code.length < 6) return;
      setConfirmation('');
      setPhase('confirm');
      return;
    }
    void submit();
  };

  return (
    <View style={styles.root}>
      <StatusBar style="light" />
      <ScrollView
        contentContainerStyle={{ flexGrow: 1, paddingBottom: keyboardInset + 24 }}
        keyboardShouldPersistTaps="handled"
        keyboardDismissMode="on-drag"
        automaticallyAdjustKeyboardInsets={false}
        showsVerticalScrollIndicator={false}>
        <AuthHero compact subtitle="Commandez directement auprès des fermes." />
        <View style={styles.sheet}>
          <AppText size="label" color="brand">ÉTAPE {step} SUR 2</AppText>
          {step === 1 ? (
            <>
              <AppText size="h2" weight="bold">Créer un compte acheteur</AppText>
              <AppText size="caption" color="muted">Pour commander et précommander auprès des fermes.</AppText>
              <Labeled label="Nom complet">
                <TextField value={fullName} onChangeText={setFullName} autoCapitalize="words" accessibilityLabel="Nom complet" />
              </Labeled>
              <Labeled label="Je suis">
                <PillRow<CustomerType>
                  value={type}
                  onChange={setType}
                  options={[...BUYER_TYPES].reverse().map((key) => ({ key, label: customerTypeLabel(key) }))}
                />
              </Labeled>
              {type !== 'PARTICULIER' ? (
                <Labeled label="Nom de l’établissement">
                  <TextField value={organizationName} onChangeText={setOrganizationName} maxLength={120} accessibilityLabel="Nom de l’établissement" />
                </Labeled>
              ) : null}
              <Labeled label="Ville">
                <TextField value={city} onChangeText={setCity} maxLength={80} accessibilityLabel="Ville" />
              </Labeled>
              <Button label="Continuer" icon={ArrowRight} disabled={fullName.trim().length < 3} onPress={() => setStep(2)} />
              <Pressable onPress={() => router.replace('/register')} style={styles.link} accessibilityRole="link">
                <AppText size="small" color="muted" align="center">
                  Vous êtes éleveur ?{' '}
                  <AppText size="small" weight="semibold" color="brand">Créer un compte ferme</AppText>
                </AppText>
              </Pressable>
            </>
          ) : (
            <>
              <AppText size="h2" weight="bold">Votre accès</AppText>
              <Pressable onPress={() => setStep(1)} style={styles.back} accessibilityRole="link">
                <ArrowLeft size={15} color={palette.ink[400]} />
                <AppText size="small" color="muted">Revenir au nom</AppText>
              </Pressable>
              <PhoneInput compact value={phone} onChangeText={setPhone} />
              <AppText size="small" weight="semibold" color="brand">
                {phase === 'code' ? 'Choisissez un code secret (6 chiffres ou plus)' : 'Confirmez le code secret'}
              </AppText>
              <SecretCodePad
                value={phase === 'code' ? code : confirmation}
                onChange={phase === 'code' ? setCode : setConfirmation}
                onSubmit={onPadSubmit}
                submitEnabled={phase === 'code' ? code.length >= 6 : canSubmit}
                disabled={busy}
              />
              {mismatch ? <AppText size="small" color="danger">Les deux codes ne correspondent pas.</AppText> : null}
              {error ? <AppText size="small" color="danger">{error}</AppText> : null}
            </>
          )}
          <Pressable onPress={() => router.back()} style={styles.link} accessibilityRole="link">
            <AppText size="small" color="muted" align="center">Retour</AppText>
          </Pressable>
        </View>
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: semantic.bg },
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
  back: { flexDirection: 'row', alignItems: 'center', gap: 6, alignSelf: 'flex-start', paddingVertical: 4 },
  link: { paddingVertical: 8, alignItems: 'center' },
});
