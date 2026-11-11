import React, { useState } from 'react';
import { Pressable, ScrollView, StyleSheet, View } from 'react-native';
import { router, useLocalSearchParams, type Href } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import { ArrowLeft, ArrowRight } from 'lucide-react-native';

import { safeReturnPath } from '@/api/roles';
import type { CustomerType } from '@/api/types';
import { useAuth } from '@/auth/AuthContext';
import { AuthHero } from '@/components/auth/AuthHero';
import { BuyerAuthSwitch } from '@/components/auth/BuyerAuthSwitch';
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

  const canSubmit = isGabonPhoneValid(phone) && code.length >= 6 && !busy;

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
          <BuyerAuthSwitch active="register" from={from} />
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
              <AppText size="small" color="faint" align="center">
                Vous êtes exploitant du programme ? Votre accès vous est remis par le programme : connectez-vous avec le code reçu.
              </AppText>
            </>
          ) : (
            <>
              <AppText size="h2" weight="bold">Votre accès</AppText>
              <Pressable onPress={() => setStep(1)} style={styles.back} accessibilityRole="link">
                <ArrowLeft size={15} color={palette.ink[400]} />
                <AppText size="small" color="muted">Revenir au nom</AppText>
              </Pressable>
              <PhoneInput value={phone} onChangeText={setPhone} />
              <SecretCodePad
                value={code}
                onChange={setCode}
                onSubmit={() => void submit()}
                submitEnabled={canSubmit}
                disabled={busy}
                label="Choisissez un code secret"
                caption="6 chiffres minimum. Touchez « Afficher » pour le relire."
                size="sm"
                revealable
              />
              {error ? <AppText size="small" color="danger">{error}</AppText> : null}
              <Button label="Créer mon compte" tone="accent" size="lg" icon={ArrowRight} loading={busy} disabled={!canSubmit} onPress={() => void submit()} />
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
