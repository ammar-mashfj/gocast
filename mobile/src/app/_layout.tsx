import { BricolageGrotesque_600SemiBold, BricolageGrotesque_700Bold } from '@expo-google-fonts/bricolage-grotesque';
import { JetBrainsMono_400Regular, JetBrainsMono_500Medium } from '@expo-google-fonts/jetbrains-mono';
import {
  Onest_400Regular,
  Onest_500Medium,
  Onest_600SemiBold,
  Onest_700Bold,
  useFonts,
} from '@expo-google-fonts/onest';
import { Stack } from 'expo-router';
import * as SplashScreen from 'expo-splash-screen';
import { StatusBar } from 'expo-status-bar';
import { useState } from 'react';
import { GestureHandlerRootView } from 'react-native-gesture-handler';

import { BroadcastProvider } from '../broadcast/BroadcastContext';
import { AnimatedSplash } from '../components/AnimatedSplash';
import { AppHeader } from '../components/AppHeader';
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

export default function RootLayout() {
  const [fontsLoaded] = useFonts({
    BricolageGrotesque_600SemiBold,
    BricolageGrotesque_700Bold,
    Onest_400Regular,
    Onest_500Medium,
    Onest_600SemiBold,
    Onest_700Bold,
    JetBrainsMono_400Regular,
    JetBrainsMono_500Medium,
  });

  return (
    <GestureHandlerRootView style={{ flex: 1, backgroundColor: colors.bg }}>
      <AuthProvider>
        {fontsLoaded && (
          <BroadcastProvider>
            <OverlayHost>
              <StatusBar style="light" />
              <Stack
                screenOptions={{
                  header: (props) => <AppHeader {...props} />,
                  contentStyle: { backgroundColor: colors.bg },
                }}
              >
                <Stack.Screen name="index" options={{ headerShown: false }} />
                <Stack.Screen name="login" options={{ headerShown: false }} />
                <Stack.Screen name="stations" options={{ headerShown: false }} />
                <Stack.Screen name="account" options={{ title: 'Account' }} />
                <Stack.Screen name="station/[slug]" options={{ title: 'Station' }} />
                <Stack.Screen name="live/[slug]" options={{ title: 'Go live' }} />
                <Stack.Screen name="studio/[slug]" options={{ title: 'Studio' }} />
              </Stack>
            </OverlayHost>
          </BroadcastProvider>
        )}
        <SplashLayer fontsLoaded={fontsLoaded} />
      </AuthProvider>
    </GestureHandlerRootView>
  );
}
