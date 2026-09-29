import { router } from 'expo-router';
import { useState } from 'react';
import { Pressable, ScrollView, StyleSheet, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { GoogleLogo } from '../components/Brand';
import { Waveform } from '../components/Waveform';
import { Button, Chip, T, Wordmark } from '../components/ui';
import { useAuth } from '../lib/auth';
import { colors } from '../lib/theme';
import { openWeb } from '../lib/web';

/**
 * The first screen for anyone signed out. Google leads because it both signs
 * in and creates the account (GoogleAuthController::native), so it is the
 * whole path for someone who found the app in the store.
 */
export default function Welcome() {
  const { signInWithGoogle } = useAuth();
  const insets = useSafeAreaInsets();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const google = async () => {
    setBusy(true);
    setError(null);
    try {
      // Signing in opens the station (_layout.tsx → home).
      await signInWithGoogle();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Google sign-in failed. Please try again.');
    } finally {
      setBusy(false);
    }
  };

  return (
    <ScrollView
      style={styles.screen}
      contentContainerStyle={[styles.content, { paddingTop: insets.top + 14, paddingBottom: insets.bottom + 22 }]}
    >
      <Wordmark size={22} />

      <View style={styles.hero}>
        <Waveform />
        <View>
          <T weight={800} size={50} tracking={-0.045} style={styles.display}>
            Your station.
          </T>
          <T weight={800} size={50} tracking={-0.045} tone="autodj" style={styles.display}>
            Live from your pocket.
          </T>
        </View>
        <T weight={400} size={17} tone="muted" lineHeight={1.45} style={{ maxWidth: 310 }}>
          Talk over your music, lock the phone, and give listeners one link to tune in.
        </T>
        <View style={styles.chips}>
          <Chip>Mic ducks the music</Chip>
          <Chip>Screen off, still live</Chip>
          <Chip>
            AutoDJ{' '}
            <T mono weight={500} size={12} tone="pro">
              PRO
            </T>
          </Chip>
        </View>
      </View>

      <View style={styles.actions}>
        {!!error && (
          <T weight={600} size={13} tone="liveText" accessibilityRole="alert" style={{ textAlign: 'center' }}>
            {error}
          </T>
        )}
        <Button
          label={busy ? 'Signing in…' : 'Continue with Google'}
          busy={busy}
          icon={<GoogleLogo />}
          onPress={google}
        />
        <Button label="Sign in with email" variant="outline" disabled={busy} onPress={() => router.push('/login')} />
        <View style={styles.footer}>
          <T weight={500} size={14} tone="muted">
            New here?
          </T>
          <Pressable accessibilityRole="link" hitSlop={10} onPress={() => openWeb('/auth/register')}>
            <T weight={700} size={14} tone="autodjText">
              Create a free station
            </T>
          </Pressable>
        </View>
        <T weight={400} size={12} tone="faint" lineHeight={1.5} style={{ textAlign: 'center' }}>
          By continuing, you agree to our{' '}
          <T weight={400} size={12} tone="faint" style={styles.underline} onPress={() => openWeb('/terms')}>
            Terms
          </T>{' '}
          and{' '}
          <T weight={400} size={12} tone="faint" style={styles.underline} onPress={() => openWeb('/privacy')}>
            Privacy Policy
          </T>
          .
        </T>
      </View>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.bg },
  content: { flexGrow: 1, paddingHorizontal: 26 },
  hero: { flex: 1, justifyContent: 'center', gap: 22, paddingVertical: 28 },
  display: { lineHeight: 50 },
  chips: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  actions: { gap: 10 },
  footer: { flexDirection: 'row', justifyContent: 'center', gap: 5, paddingTop: 8 },
  underline: { textDecorationLine: 'underline' },
});
