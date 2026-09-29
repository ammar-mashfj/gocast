import {
  BricolageGrotesque_400Regular,
  BricolageGrotesque_500Medium,
  BricolageGrotesque_600SemiBold,
  BricolageGrotesque_700Bold,
  BricolageGrotesque_800ExtraBold,
  useFonts,
} from '@expo-google-fonts/bricolage-grotesque';
import {
  IBMPlexMono_400Regular,
  IBMPlexMono_500Medium,
  IBMPlexMono_600SemiBold,
  IBMPlexMono_700Bold,
} from '@expo-google-fonts/ibm-plex-mono';
import { Stack } from 'expo-router';
import * as SplashScreen from 'expo-splash-screen';
import { StatusBar } from 'expo-status-bar';
import { useState } from 'react';
import { GestureHandlerRootView } from 'react-native-gesture-handler';

import { BroadcastProvider } from '../broadcast/BroadcastContext';
import { AnimatedSplash } from '../components/AnimatedSplash';
import { OverlayHost } from '../components/Overlay';
import { AuthProvider, useAuth } from '../lib/auth';
import { colors } from '../lib/theme';

// The native splash (app.json) is only the ground colour. It stays up until
// the animated splash has drawn its first frame, which then covers the app
// until the fonts are in and the saved session has been checked.
SplashScreen.preventAutoHideAsync();
SplashScreen.setOptions({ duration: 0, fade: false });

function SplashLayer({ fontsLoaded }: { fontsLoaded: boolean }) {
  const { state } = useAuth();
  const [gone, setGone] = useState(false);
  if (gone) return null;
  return <AnimatedSplash ready={fontsLoaded && state.status !== 'loading'} onDone={() => setGone(true)} />;
}

/**
 * Signed-in and signed-out screens are guarded groups. When the session
 * changes, Expo Router drops the now-forbidden group from history and sends
 * the person to `index`, which redirects to the right home. So sign-in and
 * sign-out never navigate by hand, and the system back button can't return
 * to the station after signing out or to login after signing in.
 * Null while the saved session is checked: both groups closed, `index` waits.
 */
function RootStack() {
  const { state } = useAuth();
  const signedIn = state.status === 'loading' ? null : state.status === 'signedIn';

  return (
    <Stack
      // Every screen draws its own top bar, as in the design.
      screenOptions={{ headerShown: false, contentStyle: { backgroundColor: colors.bg } }}
    >
      <Stack.Screen name="index" />
      <Stack.Protected guard={signedIn === false}>
        <Stack.Screen name="welcome" />
        <Stack.Screen name="login" />
      </Stack.Protected>
      <Stack.Protected guard={signedIn === true}>
        <Stack.Screen name="home" />
        <Stack.Screen name="account" />
        <Stack.Screen name="station/[slug]" />
        <Stack.Screen name="show-times/[slug]" />
        <Stack.Screen name="live/[slug]" />
        <Stack.Screen name="studio/[slug]" />
        <Stack.Screen name="summary/[slug]" options={{ gestureEnabled: false }} />
      </Stack.Protected>
    </Stack>
  );
}

export default function RootLayout() {
  const [fontsLoaded] = useFonts({
    BricolageGrotesque_400Regular,
    BricolageGrotesque_500Medium,
    BricolageGrotesque_600SemiBold,
    BricolageGrotesque_700Bold,
    BricolageGrotesque_800ExtraBold,
    IBMPlexMono_400Regular,
    IBMPlexMono_500Medium,
    IBMPlexMono_600SemiBold,
    IBMPlexMono_700Bold,
  });

  return (
    <GestureHandlerRootView style={{ flex: 1, backgroundColor: colors.bg }}>
      <AuthProvider>
        {fontsLoaded && (
          <BroadcastProvider>
            <OverlayHost>
              <StatusBar style="light" />
              <RootStack />
            </OverlayHost>
          </BroadcastProvider>
        )}
        <SplashLayer fontsLoaded={fontsLoaded} />
      </AuthProvider>
    </GestureHandlerRootView>
  );
}
