import { IconAlertTriangle, IconBrandGoogleFilled } from '@tabler/icons-react-native';
import { router } from 'expo-router';
import { useRef, useState } from 'react';
import { KeyboardAvoidingView, Platform, Pressable, ScrollView, StyleSheet, View, type TextInput } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { Wordmark } from '../components/Brand';
import { Button, T, TextField } from '../components/ui';
import { useAuth } from '../lib/auth';
import { alpha, colors, fonts, radius } from '../lib/theme';
import { openWeb } from '../lib/web';

/**
 * Email and password sign-in. Everything the app doesn't do yet (sign-up,
 * password reset, Google) is one tap away on the web, and says so.
 */
export default function Login() {
  const { signIn, signInWithGoogle } = useAuth();
  const insets = useSafeAreaInsets();
  const passwordRef = useRef<TextInput>(null);
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [busy, setBusy] = useState(false);
  const [googleBusy, setGoogleBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const canSubmit = email.trim().length > 0 && password.length > 0 && !busy && !googleBusy;

  const google = async () => {
    setGoogleBusy(true);
    setError(null);
    try {
      if (await signInWithGoogle()) router.replace('/stations');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Google sign-in failed. Please try again.');
    } finally {
      setGoogleBusy(false);
    }
  };

  const submit = async () => {
    if (!canSubmit) return;
    setBusy(true);
    setError(null);
    try {
      await signIn(email.trim(), password);
      router.replace('/stations');
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setBusy(false);
    }
  };

  return (
    <KeyboardAvoidingView style={styles.screen} behavior={Platform.OS === 'ios' ? 'padding' : 'height'}>
      <ScrollView
        keyboardShouldPersistTaps="handled"
        contentContainerStyle={[styles.content, { paddingTop: insets.top + 20, paddingBottom: insets.bottom + 24 }]}
      >
        <Wordmark width={124} />

        <View style={styles.hero}>
          <T style={styles.display}>Sign in.</T>
          <T style={[styles.display, { color: colors.violetPale }]}>Go live from your phone.</T>
          <T tone="muted" size={16} style={{ lineHeight: 24, marginTop: 12 }}>
            Use the email and password of your GoCast account. Your show keeps going with the screen locked.
          </T>
        </View>

        <View style={styles.form}>
          <TextField
            label="Email"
            placeholder="you@example.com"
            autoCapitalize="none"
            autoComplete="email"
            autoCorrect={false}
            keyboardType="email-address"
            textContentType="emailAddress"
            returnKeyType="next"
            submitBehavior="submit"
            value={email}
            onChangeText={setEmail}
            onSubmitEditing={() => passwordRef.current?.focus()}
          />
          <TextField
            ref={passwordRef}
            label="Password"
            secret
            autoCapitalize="none"
            autoComplete="current-password"
            textContentType="password"
            returnKeyType="go"
            value={password}
            onChangeText={setPassword}
            onSubmitEditing={submit}
            trailing={
              <Pressable hitSlop={10} onPress={() => openWeb('/auth/forgot')}>
                <T tone="violet" size={13} weight="medium">
                  Forgot password?
                </T>
              </Pressable>
            }
          />

          {error && (
            <View style={styles.error} accessibilityRole="alert">
              <IconAlertTriangle size={18} color={colors.faultText} />
              <T tone="fault" size={14} style={{ flex: 1, lineHeight: 20 }}>
                {error}
              </T>
            </View>
          )}

          <Button
            label="Sign in"
            variant="primary"
            height={52}
            busy={busy}
            disabled={!canSubmit}
            onPress={submit}
            style={styles.submit}
          />

          <View style={styles.or}>
            <View style={styles.rule} />
            <T tone="muted" size={13}>
              Or
            </T>
            <View style={styles.rule} />
          </View>

          <Button
            label={googleBusy ? 'Signing in…' : 'Continue with Google'}
            height={52}
            disabled={busy || googleBusy}
            icon={<IconBrandGoogleFilled size={18} color={colors.text} />}
            onPress={google}
            style={{ borderRadius: radius.lg }}
          />
        </View>

        <View style={styles.footer}>
          <View style={styles.footerRow}>
            <T tone="muted" size={14}>
              New to GoCast?
            </T>
            <Pressable hitSlop={10} onPress={() => openWeb('/auth/register')}>
              <T tone="violet" size={14} weight="semibold">
                Create a free station
              </T>
            </Pressable>
          </View>
          <T tone="faint" size={12} style={{ textAlign: 'center', lineHeight: 18 }}>
            By signing in with Google, you agree to our{' '}
            <T tone="faint" size={12} style={styles.underline} onPress={() => openWeb('/terms')}>
              Terms of Service
            </T>{' '}
            and{' '}
            <T tone="faint" size={12} style={styles.underline} onPress={() => openWeb('/privacy')}>
              Privacy Policy
            </T>
            .
          </T>
        </View>
      </ScrollView>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.bg },
  content: { flexGrow: 1, paddingHorizontal: 24 },
  hero: { marginTop: 56, marginBottom: 36 },
  display: { fontFamily: fonts.displayBold, fontSize: 38, lineHeight: 38, letterSpacing: -1.5, color: colors.text },
  form: { gap: 18 },
  error: {
    flexDirection: 'row',
    gap: 10,
    alignItems: 'flex-start',
    padding: 12,
    borderRadius: radius.lg,
    borderWidth: 1,
    backgroundColor: alpha(colors.fault, 0.1),
    borderColor: alpha(colors.fault, 0.35),
  },
  submit: { marginTop: 6, borderRadius: radius.lg },
  or: { flexDirection: 'row', alignItems: 'center', gap: 12 },
  rule: { flex: 1, height: 1, backgroundColor: colors.hairline },
  underline: { textDecorationLine: 'underline' },
  footer: { marginTop: 'auto', paddingTop: 40, gap: 10, alignItems: 'center' },
  footerRow: { flexDirection: 'row', gap: 6, flexWrap: 'wrap', justifyContent: 'center' },
});
