import { router } from 'expo-router';
import { useRef, useState } from 'react';
import { KeyboardAvoidingView, Platform, Pressable, ScrollView, StyleSheet, View, type TextInput } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { GoogleLogo } from '../components/Brand';
import { BackButton, Button, T, TextField } from '../components/ui';
import { useAuth } from '../lib/auth';
import { colors } from '../lib/theme';
import { openWeb } from '../lib/web';

/**
 * Email and password sign-in, one step in from the welcome screen. Google
 * stays here for anyone who tapped email by habit. Password reset is on the
 * web, one tap away.
 */
export default function Login() {
  const { signIn, signInWithGoogle } = useAuth();
  const insets = useSafeAreaInsets();
  const passwordRef = useRef<TextInput>(null);
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [busy, setBusy] = useState(false);
  const [googleBusy, setGoogleBusy] = useState(false);
  // Which field the error is about, so its box gets the coral edge.
  const [error, setError] = useState<{ message: string; field: 'email' | 'password' | null } | null>(null);

  const filled = email.trim().length > 0 && password.length > 0;

  const google = async () => {
    setGoogleBusy(true);
    setError(null);
    try {
      await signInWithGoogle();
    } catch (err) {
      setError({ message: err instanceof Error ? err.message : 'Google sign-in failed.', field: null });
    } finally {
      setGoogleBusy(false);
    }
  };

  const submit = async () => {
    if (busy || googleBusy) return;
    if (!email.includes('@')) return setError({ message: 'Enter the email you signed up with.', field: 'email' });
    if (!password) return setError({ message: 'Enter your password.', field: 'password' });
    setBusy(true);
    setError(null);
    try {
      // The session change opens the station (_layout.tsx → home).
      await signIn(email.trim(), password);
    } catch (err) {
      setError({ message: err instanceof Error ? err.message : String(err), field: 'password' });
    } finally {
      setBusy(false);
    }
  };

  return (
    <KeyboardAvoidingView style={styles.screen} behavior={Platform.OS === 'ios' ? 'padding' : 'height'}>
      <ScrollView
        keyboardShouldPersistTaps="handled"
        contentContainerStyle={[styles.content, { paddingTop: insets.top + 6, paddingBottom: insets.bottom + 22 }]}
      >
        <View style={{ marginLeft: -12 }}>
          <BackButton onPress={() => (router.canGoBack() ? router.back() : router.replace('/welcome'))} />
        </View>

        <View style={{ gap: 8 }}>
          <T weight={800} size={38} tracking={-0.04} style={{ lineHeight: 40 }}>
            Welcome back.
          </T>
          <T weight={400} size={16} tone="muted" lineHeight={1.45}>
            Use your GoCast email and password.
          </T>
        </View>

        <View style={{ gap: 10 }}>
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
            invalid={error?.field === 'email'}
            value={email}
            onChangeText={(v) => {
              setEmail(v);
              setError(null);
            }}
            onSubmitEditing={() => passwordRef.current?.focus()}
          />
          <TextField
            ref={passwordRef}
            label="Password"
            placeholder="Your password"
            secret
            autoCapitalize="none"
            autoComplete="current-password"
            textContentType="password"
            returnKeyType="go"
            invalid={error?.field === 'password'}
            value={password}
            onChangeText={(v) => {
              setPassword(v);
              setError(null);
            }}
            onSubmitEditing={submit}
          />
          <View style={styles.below}>
            <T weight={600} size={13} tone="liveText" accessibilityRole="alert" style={{ flex: 1 }}>
              {error?.message ?? ''}
            </T>
            <Pressable accessibilityRole="link" hitSlop={10} onPress={() => openWeb('/auth/forgot')}>
              <T weight={600} size={13} tone="autodjText">
                Forgot password?
              </T>
            </Pressable>
          </View>
        </View>

        <Button
          label="Sign in"
          variant={filled ? 'light' : 'dark'}
          busy={busy}
          disabled={googleBusy}
          onPress={submit}
          style={!filled && styles.idle}
        />

        <View style={styles.or}>
          <View style={styles.rule} />
          <T weight={500} size={13} tone="faint">
            or
          </T>
          <View style={styles.rule} />
        </View>

        <Button
          label={googleBusy ? 'Signing in…' : 'Continue with Google'}
          variant="outline"
          icon={<GoogleLogo />}
          disabled={busy || googleBusy}
          onPress={google}
        />
      </ScrollView>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.bg },
  content: { flexGrow: 1, paddingHorizontal: 26, gap: 26 },
  below: { flexDirection: 'row', alignItems: 'center', gap: 12, minHeight: 20 },
  // The comp's "not ready yet" button: dark, with faint ink.
  idle: { opacity: 0.7 },
  or: { flexDirection: 'row', alignItems: 'center', gap: 12 },
  rule: { flex: 1, height: 1, backgroundColor: colors.line },
});
