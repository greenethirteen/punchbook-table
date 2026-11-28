import { router } from 'expo-router';
import { useEffect, useRef, useState } from 'react';
import { ActivityIndicator, KeyboardAvoidingView, Platform, Pressable, StyleSheet, Text, TextInput, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { CloseIcon, PhoneIcon, UserIcon } from '@/components/icons';
import { startSignIn, verifySignIn, type Customer } from '@/lib/api';
import { colors, serif } from '@/lib/theme';
import { useOrders } from '@/state/orders';

const LEN = 6;

/** Sign in with a name and mobile number. The SMS code fills in by itself (iOS keyboard / Android autofill). */
export default function SignIn() {
  const insets = useSafeAreaInsets();
  const { profile, saveProfile } = useOrders();
  const [name, setName] = useState(profile.name);
  const [phone, setPhone] = useState(profile.phone);
  const [step, setStep] = useState<'details' | 'code'>('details');
  const [code, setCode] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [resendIn, setResendIn] = useState(0);
  const codeRef = useRef<TextInput>(null);

  useEffect(() => {
    if (resendIn <= 0) return;
    const t = setTimeout(() => setResendIn(s => s - 1), 1000);
    return () => clearTimeout(t);
  }, [resendIn]);

  const done = (token: string, c: Customer) => {
    saveProfile({ name: c.name, phone: c.phone.replace(/^\+94/, '0'), token, verified: c.verified });
    router.back();
  };

  const send = async () => {
    setError('');
    if (!name.trim()) return setError('Enter your name.');
    if (phone.replace(/\D/g, '').length < 9) return setError('Enter your mobile number, like 077 123 4567.');
    setBusy(true);
    try {
      const r = await startSignIn(name.trim(), phone.trim());
      if (!r.otp) return done(r.token, r.customer);
      setStep('code');
      setCode('');
      setResendIn(r.resendIn ?? 30);
      setTimeout(() => codeRef.current?.focus(), 300);
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  };

  const check = async (value: string) => {
    setBusy(true);
    setError('');
    try {
      const r = await verifySignIn(phone.trim(), value);
      done(r.token, r.customer);
    } catch (e) {
      setError((e as Error).message);
      setCode('');
    } finally {
      setBusy(false);
    }
  };

  const onCode = (v: string) => {
    const digits = v.replace(/\D/g, '').slice(0, LEN);
    setCode(digits);
    if (digits.length === LEN) check(digits);
  };

  return (
    <KeyboardAvoidingView style={{ flex: 1, backgroundColor: colors.paper }} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
      <View style={[styles.wrap, { paddingTop: insets.top + 16, paddingBottom: insets.bottom + 20 }]}>
        <View style={styles.top}>
          {step === 'code' ? (
            <Pressable accessibilityRole="button" onPress={() => setStep('details')} hitSlop={10}>
              <Text style={styles.back}>← Change number</Text>
            </Pressable>
          ) : (
            <View />
          )}
          <Pressable accessibilityRole="button" accessibilityLabel="Close" onPress={() => router.back()} style={styles.close}>
            <CloseIcon size={18} />
          </Pressable>
        </View>

        {step === 'details' ? (
          <>
            <Text style={styles.title}>
              Your name and{'\n'}
              <Text style={styles.serif}>number.</Text>
            </Text>
            <Text style={styles.sub}>So the restaurant knows whose order it is. No password needed.</Text>
            <View style={styles.field}>
              <UserIcon size={20} color={colors.muted} />
              <TextInput
                value={name}
                onChangeText={setName}
                placeholder="Your name"
                placeholderTextColor="#9b9284"
                autoComplete="name"
                textContentType="name"
                autoFocus
                returnKeyType="next"
                style={styles.input}
              />
            </View>
            <View style={styles.field}>
              <PhoneIcon size={20} color={colors.muted} />
              <Text style={styles.prefix}>🇱🇰</Text>
              <TextInput
                value={phone}
                onChangeText={setPhone}
                placeholder="07X XXX XXXX"
                placeholderTextColor="#9b9284"
                keyboardType="phone-pad"
                autoComplete="tel"
                textContentType="telephoneNumber"
                returnKeyType="done"
                onSubmitEditing={send}
                style={styles.input}
              />
            </View>
          </>
        ) : (
          <>
            <Text style={styles.title}>
              Enter the{'\n'}
              <Text style={styles.serif}>code.</Text>
            </Text>
            <Text style={styles.sub}>We sent it by SMS to {phone}. It should fill in by itself.</Text>
            <Pressable onPress={() => codeRef.current?.focus()} style={styles.boxes} accessibilityLabel="Verification code">
              {Array.from({ length: LEN }, (_, i) => (
                <View key={i} style={[styles.box, code.length === i && styles.boxNow, !!code[i] && styles.boxFilled]}>
                  <Text style={styles.boxText}>{code[i] ?? ''}</Text>
                </View>
              ))}
            </Pressable>
            {/* One hidden field holds the code so iOS/Android can offer the SMS code in one tap. */}
            <TextInput
              ref={codeRef}
              value={code}
              onChangeText={onCode}
              keyboardType="number-pad"
              textContentType="oneTimeCode"
              autoComplete="sms-otp"
              maxLength={LEN}
              style={styles.hidden}
              accessibilityLabel="Verification code"
            />
            <Pressable disabled={resendIn > 0 || busy} onPress={send} style={{ alignSelf: 'flex-start', marginTop: 18 }}>
              <Text style={[styles.resend, resendIn > 0 && { color: colors.muted }]}>
                {resendIn > 0 ? `Send a new code in ${resendIn}s` : 'Send a new code'}
              </Text>
            </Pressable>
          </>
        )}

        {!!error && <Text style={styles.error}>{error}</Text>}
        <View style={{ flex: 1 }} />
        {step === 'details' && (
          <Pressable accessibilityRole="button" onPress={send} disabled={busy} style={({ pressed }) => [styles.cta, pressed && { opacity: 0.9 }]}>
            {busy ? <ActivityIndicator color="#fff" /> : <Text style={styles.ctaText}>Continue</Text>}
          </Pressable>
        )}
        {step === 'code' && busy && <ActivityIndicator color={colors.ink} style={{ marginBottom: 20 }} />}
      </View>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  wrap: { flex: 1, paddingHorizontal: 22 },
  top: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', minHeight: 44 },
  back: { fontSize: 15, fontWeight: '700', color: colors.muted },
  close: { width: 40, height: 40, borderRadius: 20, backgroundColor: colors.card, borderWidth: 1, borderColor: colors.line, alignItems: 'center', justifyContent: 'center' },
  title: { fontSize: 40, lineHeight: 42, fontWeight: '800', letterSpacing: -1.8, color: colors.ink, marginTop: 28 },
  serif: { fontFamily: serif, fontWeight: '400', fontSize: 46, color: colors.green },
  sub: { fontSize: 16, lineHeight: 22, color: colors.muted, marginTop: 12, marginBottom: 22 },
  field: { flexDirection: 'row', alignItems: 'center', gap: 12, backgroundColor: colors.card, borderRadius: 18, borderWidth: 1, borderColor: colors.line, paddingHorizontal: 16, minHeight: 58, marginBottom: 10 },
  prefix: { fontSize: 18 },
  input: { flex: 1, fontSize: 18, color: colors.ink, paddingVertical: 14 },
  boxes: { flexDirection: 'row', gap: 8, marginTop: 4 },
  box: { flex: 1, height: 62, borderRadius: 16, backgroundColor: colors.card, borderWidth: 1.5, borderColor: colors.line, alignItems: 'center', justifyContent: 'center' },
  boxNow: { borderColor: colors.ink },
  boxFilled: { borderColor: colors.green },
  boxText: { fontSize: 26, fontWeight: '800', color: colors.ink },
  hidden: { position: 'absolute', opacity: 0, height: 1, width: 1 },
  resend: { fontSize: 15, fontWeight: '800', color: colors.green },
  error: { marginTop: 14, fontSize: 14, fontWeight: '600', color: colors.error },
  cta: { height: 58, borderRadius: 18, backgroundColor: colors.night, alignItems: 'center', justifyContent: 'center' },
  ctaText: { color: '#fff', fontSize: 17, fontWeight: '800' },
});
