import Constants from 'expo-constants';
import { Image } from 'expo-image';
import { router } from 'expo-router';
import { useState } from 'react';
import { ScrollView, StyleSheet, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { useBroadcast } from '../broadcast/BroadcastContext';
import { Fact, formatDate, LinkRow } from '../components/account/parts';
import { Overlay } from '../components/Overlay';
import { initialsOf } from '../components/StationArt';
import { BackButton, Button, Card, T } from '../components/ui';
import { mediaUrl } from '../lib/api';
import { useAuth } from '../lib/auth';
import { colors } from '../lib/theme';
import { openWeb } from '../lib/web';

/** Who is signed in, what their plan allows, and the way out. */
export default function Account() {
  const { state, signOut } = useAuth();
  const broadcast = useBroadcast();
  const insets = useSafeAreaInsets();
  const [confirming, setConfirming] = useState(false);
  const [busy, setBusy] = useState(false);

  if (state.status !== 'signedIn') return null;
  const { user } = state;
  const plan = user.plan;
  const pro = !!plan && plan.slug !== 'free';
  const onAir = broadcast.state === 'live' || broadcast.state === 'reconnecting';

  const doSignOut = async () => {
    setBusy(true);
    try {
      if (onAir) await broadcast.stop();
      // Signing out closes every signed-in screen and clears them from
      // history (_layout.tsx), so back can't return here.
      await signOut();
    } finally {
      setBusy(false);
    }
  };

  return (
    <View style={[styles.screen, { paddingTop: insets.top }]}>
      <View style={styles.top}>
        <BackButton onPress={() => (router.canGoBack() ? router.back() : router.replace('/'))} />
        <T weight={700} size={19} tracking={-0.02}>
          Account
        </T>
      </View>
      <ScrollView contentContainerStyle={[styles.body, { paddingBottom: insets.bottom + 22 }]}>
        <View style={styles.identity}>
          <View style={styles.avatar}>
            {user.avatar_url ? (
              <Image source={mediaUrl(user.avatar_url)} style={StyleSheet.absoluteFill} contentFit="cover" />
            ) : (
              <T weight={800} size={24} tone="pro">
                {initialsOf(user.name).slice(0, 1)}
              </T>
            )}
          </View>
          <View style={{ flex: 1, gap: 2 }}>
            <T weight={700} size={20} numberOfLines={1}>
              {user.name}
            </T>
            <T weight={500} size={14} tone="muted" numberOfLines={1}>
              {user.email}
            </T>
          </View>
        </View>

        {plan && (
          <Card radius={24} padding={18} style={{ gap: 14 }}>
            <View style={styles.planHead}>
              <T weight={700} size={16}>
                Your plan
              </T>
              <View style={[styles.plan, { borderColor: pro ? colors.pro : colors.muted }]}>
                <T mono weight={600} size={11} tracking={0.1} style={{ color: pro ? colors.pro : colors.muted }}>
                  {plan.name.toUpperCase()}
                </T>
              </View>
            </View>
            <Fact label="Listeners at once" value={plan.max_listeners > 0 ? `Up to ${plan.max_listeners.toLocaleString()}` : '–'} />
            <Fact label="AutoDJ" value={plan.autodj_enabled ? 'Plays your library between shows' : 'Not on this plan'} />
            {plan.expires_at && <Fact label="Ends" value={formatDate(plan.expires_at)} />}
            {!pro && (
              <Button label="Request Pro" variant="pro" height={50} radius={16} size={15} onPress={() => openWeb('/dashboard')} />
            )}
          </Card>
        )}

        <Card radius={22} padding={0} style={{ overflow: 'hidden' }}>
          <LinkRow first label="Open the web dashboard" onPress={() => openWeb('/dashboard')} />
          <LinkRow label="Help" onPress={() => openWeb('/help')} />
          <LinkRow label="Privacy Policy" onPress={() => openWeb('/privacy')} />
        </Card>

        <Button label="Sign out" variant="outline" busy={busy} onPress={() => (onAir ? setConfirming(true) : doSignOut())} />

        <T mono weight={500} size={11} tone="faint" style={{ textAlign: 'center' }}>
          GoCast {Constants.expoConfig?.version ?? ''}
        </T>
      </ScrollView>

      <Overlay visible={confirming} onClose={() => setConfirming(false)} placement="bottom" dismissable={!busy}>
        <T weight={800} size={28} tracking={-0.03} style={{ lineHeight: 30 }}>
          End the show and sign out?
        </T>
        <T weight={400} size={15} tone="muted" lineHeight={1.45}>
          You&apos;re live on {broadcast.stationName}. Signing out ends the show for your listeners.
        </T>
        <View style={{ gap: 8 }}>
          <Button label="End and sign out" variant="live" busy={busy} onPress={doSignOut} />
          <Button label="Stay live" variant="subtle" height={54} onPress={() => setConfirming(false)} />
        </View>
      </Overlay>
    </View>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.bg },
  top: { height: 52, flexDirection: 'row', alignItems: 'center', gap: 4, paddingLeft: 8 },
  body: { paddingHorizontal: 18, paddingTop: 8, gap: 16 },
  identity: { flexDirection: 'row', alignItems: 'center', gap: 14, paddingVertical: 6 },
  avatar: {
    width: 64,
    height: 64,
    borderRadius: 32,
    overflow: 'hidden',
    backgroundColor: colors.avatar,
    alignItems: 'center',
    justifyContent: 'center',
  },
  planHead: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  plan: { borderWidth: 1, borderRadius: 7, paddingVertical: 4, paddingHorizontal: 8 },
});
