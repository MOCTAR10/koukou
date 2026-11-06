import React, { useState } from 'react';
import { Pressable, ScrollView, StyleSheet, View } from 'react-native';
import { router, useLocalSearchParams, type Href } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import { ArrowRight, LogOut, ShieldCheck } from 'lucide-react-native';

import { AppText } from '@/components/ui/AppText';
import { Button } from '@/components/ui/Button';
import { PhoneInput } from '@/components/ui/PhoneInput';
import { AuthHero } from '@/components/auth/AuthHero';
import { SecretCodePad } from '@/components/ui/SecretCodePad';
import { useAuth } from '@/auth/AuthContext';
import { homeRouteFor, roleLabel, safeReturnPath } from '@/api/roles';
import { loadSession } from '@/api/token';
import { palette, radii, semantic, shadow } from '@/constants/theme';
import { useKeyboardInset } from '@/hooks/useKeyboardInset';
import { OTP_LENGTH } from '@/auth/session-rules';

export default function LoginScreen() {
  const { signedIn, user, farms, busy, error, signIn, signOut, otpChallenge, verifyOtp, cancelOtp } = useAuth();
  const [phone, setPhone] = useState('');
  const [code, setCode] = useState('');
  const [smsCode, setSmsCode] = useState('');
  const { from } = useLocalSearchParams<{ from?: string }>();
  const keyboardInset = useKeyboardInset();

  const canSubmit = phone.trim().length > 0 && code.length >= 6 && !busy;
  const canVerify = smsCode.length === OTP_LENGTH && !busy;

  const goHome = () => {
    const back = safeReturnPath(from);
    // dismissTo pops back to the screen they came from, instead of stacking a second copy of it.
    if (back) router.dismissTo(back as Href);
    else router.replace(homeRouteFor(loadSession()?.user.role) as Href);
  };

  const submit = async () => {
    if (!canSubmit) return;
    setSmsCode('');
    const result = await signIn(phone.trim(), code);
    if (result === 'signed-in') goHome();
  };

  const submitSmsCode = async () => {
    if (!canVerify) return;
    const ok = await verifyOtp(smsCode);
    if (ok) goHome();
    else setSmsCode('');
  };

  const changeNumber = () => {
    cancelOtp();
    setSmsCode('');
    setCode('');
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
            {signedIn ? 'Bon retour' : otpChallenge ? 'Code de vérification' : 'Connexion'}
          </AppText>
          <AppText size="caption" color="muted" style={styles.sheetSub}>
            {signedIn
              ? 'Votre session est active sur cet appareil.'
              : otpChallenge
                ? `Saisissez le code à ${OTP_LENGTH} chiffres envoyé par SMS${otpChallenge.sentTo ? ` au ${otpChallenge.sentTo}` : ''}. Il est valable quelques minutes.`
                : 'Votre numéro de téléphone et votre code secret.'}
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
                <Button label="Continuer" tone="primary" icon={ArrowRight} onPress={() => router.replace(homeRouteFor(user.role) as Href)} />
                <Button label="Se déconnecter" tone="ghost" icon={LogOut} onPress={() => signOut()} />
              </View>
            </View>
          ) : otpChallenge ? (
            <View style={{ gap: 14 }}>
              <SecretCodePad
                value={smsCode}
                onChange={setSmsCode}
                onSubmit={() => void submitSmsCode()}
                disabled={busy}
                minLength={OTP_LENGTH}
                maxLength={OTP_LENGTH}
                submitEnabled={smsCode.length === OTP_LENGTH}
                label="Code reçu par SMS"
                caption={`${OTP_LENGTH} chiffres`}
                size="sm"
              />

              {error ? (
                <AppText size="small" color="danger">
                  {error}
                </AppText>
              ) : null}

              <Button
                label="Valider le code"
                tone="primary"
                size="lg"
                labelSize="body"
                icon={ShieldCheck}
                loading={busy}
                disabled={!canVerify}
                onPress={submitSmsCode}
              />
              <Pressable
                onPress={() => void submit()}
                disabled={busy}
                style={styles.registerLink}
                accessibilityRole="button">
                <AppText size="bodyM" align="center" weight="semibold" color="brand">
                  Renvoyer un code
                </AppText>
              </Pressable>
              <Pressable onPress={changeNumber} disabled={busy} style={styles.registerLink} accessibilityRole="button">
                <AppText size="bodyM" align="center" color="muted">
                  Changer de numéro
                </AppText>
              </Pressable>
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

              <AppText size="small" align="center" color="faint">
                Exploitant du programme : votre code de connexion vous est remis par le programme.
              </AppText>
              <Pressable onPress={() => router.push('/inscription-acheteur' as Href)} style={styles.registerLink} accessibilityRole="link">
                <AppText size="bodyM" align="center" color="muted">
                  Vous achetez ?{' '}
                  <AppText size="bodyM" weight="semibold" color="brand">
                    Créer un compte client du Marché →
                  </AppText>
                </AppText>
              </Pressable>
              <Pressable onPress={() => router.push('/annonces' as Href)} style={styles.registerLink} accessibilityRole="link">
                <AppText size="bodyM" align="center" color="muted">
                  Vous voulez acheter ?{' '}
                  <AppText size="bodyM" weight="semibold" color="brand">
                    Voir le marché →
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
    borderColor: semantic.border,
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
