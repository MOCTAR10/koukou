import React, { useState } from 'react';
import { Pressable, ScrollView, StyleSheet, useWindowDimensions, View } from 'react-native';
import { router, useLocalSearchParams, type Href } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import { Image } from 'expo-image';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { ArrowRight, LogOut, ShieldCheck } from 'lucide-react-native';

import { AppText } from '@/components/ui/AppText';
import { Button } from '@/components/ui/Button';
import { PhoneInput } from '@/components/ui/PhoneInput';
import { BuyerAuthSwitch } from '@/components/auth/BuyerAuthSwitch';
import { LoginBackdrop, ProgrammeBand } from '@/components/auth/LoginChrome';
import { BUTTON_HEIGHT, LOCKUP_MAX, loginLayout } from '@/components/auth/loginLayout';
import { SecretCodePad } from '@/components/ui/SecretCodePad';
import { useAuth } from '@/auth/AuthContext';
import { homeRouteFor, roleLabel, safeReturnPath } from '@/api/roles';
import { loadSession } from '@/api/token';
import { palette, radii, semantic, shadow } from '@/constants/theme';
import { useKeyboardInset } from '@/hooks/useKeyboardInset';
import { OTP_LENGTH } from '@/auth/session-rules';
import { MAX_FONT_SCALE } from '@/constants/textScale';
import { boundedScale } from '@/theme/responsive';

// Dark-on-white lockup (wordmark + tagline), same file as the splash.
const LOCKUP = require('@/assets/images/fermia-lockup.png');
const LOCKUP_RATIO = 1117 / 458;

function Lockup({ height }: { height: number }) {
  if (height <= 0) return null;
  return (
    <Image
      source={LOCKUP}
      style={{ width: height * LOCKUP_RATIO, height, alignSelf: 'center', marginBottom: 8 }}
      contentFit="contain"
      accessibilityLabel="Fermia, gérez votre ferme"
    />
  );
}

export default function LoginScreen() {
  const { signedIn, user, farms, busy, error, signIn, signOut, otpChallenge, verifyOtp, cancelOtp } = useAuth();
  const [phone, setPhone] = useState('');
  const [code, setCode] = useState('');
  const [smsCode, setSmsCode] = useState('');
  const [box, setBox] = useState({ view: 0, content: 0 });
  const { from } = useLocalSearchParams<{ from?: string }>();
  const keyboardInset = useKeyboardInset();
  const insets = useSafeAreaInsets();
  const { width, height, fontScale } = useWindowDimensions();

  // Sent here by a Market screen: the visitor is buying, sign-up is one tap away.
  const buying = Boolean(safeReturnPath(from));
  const canSubmit = phone.trim().length > 0 && code.length >= 6 && !busy;
  const canVerify = smsCode.length === OTP_LENGTH && !busy;
  const switching = buying && !signedIn && !otpChallenge;

  // Usable height -> key size and lockup size, so nothing has to scroll.
  const layout = loginLayout({
    height: height - insets.top - insets.bottom,
    textScale: Math.min(fontScale, MAX_FONT_SCALE) * boundedScale(width),
    phoneField: !otpChallenge,
    buying: switching,
    hasError: Boolean(error),
  });
  // Scrolls only if it still overflows (tiny or landscape window) or the keyboard is up.
  const overflow = box.content > box.view + 1;

  const goHome = () => {
    const back = safeReturnPath(from);
    // dismissTo pops back to the screen they came from, instead of stacking a second copy of it.
    if (back) router.dismissTo(back as Href);
    else {
      const session = loadSession();
      router.replace(homeRouteFor(session?.user.role, session?.farms.length ?? 0) as Href);
    }
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

  const errorText = error ? (
    <AppText size="small" color="danger" numberOfLines={2} style={styles.error}>
      {error}
    </AppText>
  ) : null;

  return (
    <View style={styles.root}>
      <StatusBar style="light" />
      <LoginBackdrop />
      <View style={[styles.column, { paddingTop: insets.top + 8, marginBottom: 10 }]}>
        <ProgrammeBand />
      </View>
      <ScrollView
        style={{ flex: 1, paddingBottom: insets.bottom + 8 }}
        contentContainerStyle={[styles.scroll, keyboardInset > 0 && { paddingBottom: keyboardInset + 16 }]}
        scrollEnabled={overflow || keyboardInset > 0}
        bounces={false}
        alwaysBounceVertical={false}
        overScrollMode="never"
        keyboardShouldPersistTaps="handled"
        keyboardDismissMode="on-drag"
        automaticallyAdjustKeyboardInsets={false}
        showsVerticalScrollIndicator={false}
        onLayout={(e) => setBox((b) => ({ ...b, view: e.nativeEvent.layout.height }))}
        onContentSizeChange={(_, h) => setBox((b) => ({ ...b, content: h }))}
      >
        <View style={styles.column}>
          <View style={styles.sheet}>
            {signedIn ? (
              <View style={{ gap: 8 }}>
                <Lockup height={LOCKUP_MAX} />
                <AppText size="h3" weight="bold" color="text" numberOfLines={1}>
                  Bon retour
                </AppText>
                <View style={styles.connectedRow}>
                  <ShieldCheck size={18} color={palette.green[600]} />
                  <View style={{ flex: 1 }}>
                    <AppText size="bodyM" weight="semibold" color="text" numberOfLines={1} adjustsFontSizeToFit minimumFontScale={0.8}>
                      {user.fullName} · {roleLabel(user.role)}
                    </AppText>
                    <AppText size="caption" color="muted" numberOfLines={1} adjustsFontSizeToFit minimumFontScale={0.8}>
                      {user.phone} · connecté au serveur
                    </AppText>
                  </View>
                </View>
                {farms[0] ? (
                  <AppText size="caption" color="muted" numberOfLines={1} adjustsFontSizeToFit minimumFontScale={0.8}>
                    Ferme active : {farms[0].name}
                  </AppText>
                ) : null}
                <View style={{ gap: 8, marginTop: 4 }}>
                  <Button label="Continuer" tone="primary" icon={ArrowRight} onPress={() => router.replace(homeRouteFor(user.role, farms.length) as Href)} />
                  <Button label="Se déconnecter" tone="ghost" icon={LogOut} onPress={() => signOut()} />
                </View>
              </View>
            ) : otpChallenge ? (
              <View>
                <Lockup height={layout.lockupHeight} />
                <SecretCodePad
                  dense
                  keySize={layout.key}
                  value={smsCode}
                  onChange={setSmsCode}
                  onSubmit={() => void submitSmsCode()}
                  disabled={busy}
                  minLength={OTP_LENGTH}
                  maxLength={OTP_LENGTH}
                  submitEnabled={smsCode.length === OTP_LENGTH}
                  label="Code reçu par SMS"
                  caption={otpChallenge.sentTo ? `Envoyé au ${otpChallenge.sentTo}` : `${OTP_LENGTH} chiffres`}
                />
                {errorText}
                <Button
                  label="Valider le code"
                  tone="primary"
                  size="lg"
                  labelSize="body"
                  icon={ShieldCheck}
                  loading={busy}
                  disabled={!canVerify}
                  onPress={submitSmsCode}
                  style={styles.cta}
                />
                <View style={styles.links}>
                  <Pressable onPress={() => void submit()} disabled={busy} style={styles.link} accessibilityRole="button">
                    <AppText size="caption" weight="semibold" color="brand" numberOfLines={1}>
                      Renvoyer un code
                    </AppText>
                  </Pressable>
                  <AppText size="caption" color="faint">
                    ·
                  </AppText>
                  <Pressable onPress={changeNumber} disabled={busy} style={styles.link} accessibilityRole="button">
                    <AppText size="caption" color="muted" numberOfLines={1}>
                      Changer de numéro
                    </AppText>
                  </Pressable>
                </View>
              </View>
            ) : (
              <View>
                {switching ? (
                  <View style={styles.switch}>
                    <BuyerAuthSwitch active="login" from={from} />
                  </View>
                ) : (
                  <Lockup height={layout.lockupHeight} />
                )}
                <PhoneInput compact value={phone} onChangeText={setPhone} returnKeyType="next" onSubmitEditing={() => void submit()} />
                <View style={{ height: 8 }} />
                <SecretCodePad
                  dense
                  keySize={layout.key}
                  value={code}
                  onChange={setCode}
                  onSubmit={() => void submit()}
                  disabled={busy}
                  submitEnabled={phone.trim().length > 0}
                  caption="6 chiffres minimum"
                />
                {errorText}
                <Button
                  label="Se connecter"
                  tone="primary"
                  size="lg"
                  labelSize="body"
                  icon={ArrowRight}
                  loading={busy}
                  disabled={!canSubmit}
                  onPress={submit}
                  style={styles.cta}
                />
                <View style={styles.links}>
                  {buying ? null : (
                    <>
                      <Pressable
                        onPress={() => router.push('/inscription-acheteur' as Href)}
                        style={styles.link}
                        accessibilityRole="link"
                        accessibilityLabel="Créer un compte client du Marché">
                        <AppText size="caption" weight="semibold" color="brand" numberOfLines={1}>
                          Créer un compte
                        </AppText>
                      </Pressable>
                      <AppText size="caption" color="faint">
                        ·
                      </AppText>
                    </>
                  )}
                  <Pressable onPress={() => router.push('/annonces' as Href)} style={styles.link} accessibilityRole="link" accessibilityLabel="Voir le marché">
                    <AppText size="caption" weight="semibold" color="brand" numberOfLines={1}>
                      Voir le marché
                    </AppText>
                  </Pressable>
                </View>
              </View>
            )}
          </View>
        </View>
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  root: {
    flex: 1,
    backgroundColor: semantic.heroBg,
  },
  // Content is centred in the window; it only scrolls if it truly overflows.
  scroll: {
    flexGrow: 1,
    justifyContent: 'center',
  },
  column: {
    // 92 % of the width, capped and centred: tablets stay tidy.
    width: '92%',
    maxWidth: 440,
    alignSelf: 'center',
  },
  sheet: {
    padding: 14,
    backgroundColor: semantic.surface,
    borderRadius: radii.xxl,
    borderWidth: 1,
    borderColor: semantic.border,
    ...shadow.raised,
  },
  switch: {
    marginBottom: 8,
  },
  cta: {
    height: BUTTON_HEIGHT,
    marginTop: 8,
  },
  error: {
    marginTop: 6,
  },
  links: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 10,
    marginTop: 6,
  },
  link: {
    paddingVertical: 6,
    paddingHorizontal: 4,
  },
  connectedRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
  },
});
