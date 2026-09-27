import { IconShare } from '@tabler/icons-react-native';
import { router, Stack, useLocalSearchParams } from 'expo-router';
import { useEffect } from 'react';
import { Share, StyleSheet, View } from 'react-native';
import Animated, { useAnimatedRef } from 'react-native-reanimated';

import { useBroadcast } from '../../broadcast/BroadcastContext';
import { useListeners, useNow, useStudioSignal, useTransportHealth } from '../../broadcast/hooks';
import { Deck } from '../../components/studio/Deck';
import { EndBroadcast } from '../../components/studio/EndBroadcast';
import { Lamp } from '../../components/studio/Lamp';
import { MicDesk } from '../../components/studio/MicDesk';
import { MonitorBar } from '../../components/studio/MonitorBar';
import { RunningOrder } from '../../components/studio/RunningOrder';
import { Button, T } from '../../components/ui';
import { useAutoDjLocked } from '../../lib/auth';
import { colors } from '../../lib/theme';

/**
 * The studio, laid out like the web studio's phone layout: the lamp across
 * the top, Share and End, the deck, the mic, then the running order. The
 * broadcast lives above this screen, so leaving it does not end the show.
 */

const BITRATE_KBPS = 128;
const APP_URL = process.env.EXPO_PUBLIC_APP_URL ?? '';

export default function Studio() {
  const { slug } = useLocalSearchParams<{ slug: string }>();
  const broadcast = useBroadcast();
  const autoDjLocked = useAutoDjLocked();
  const onAir = broadcast.stationSlug === slug && (broadcast.state === 'live' || broadcast.state === 'reconnecting');
  const transport = useTransportHealth(onAir);
  const signal = useStudioSignal(transport);
  const listeners = useListeners(onAir ? slug : null);
  const now = useNow(1000);
  const scrollRef = useAnimatedRef<Animated.ScrollView>();
  const engine = broadcast.stationSlug === slug ? broadcast.engine : null;

  // Nothing to show once the show is over (or it died): back to Go Live.
  useEffect(() => {
    if (broadcast.stationSlug === slug && broadcast.state !== 'idle' && broadcast.state !== 'error') return;
    router.replace({ pathname: '/live/[slug]', params: { slug } });
  }, [broadcast.stationSlug, broadcast.state, slug]);

  if (!onAir || !engine || !signal) return <View style={{ flex: 1, backgroundColor: colors.bg }} />;

  const uptime = broadcast.liveSince ? (now - broadcast.liveSince) / 1000 : 0;
  const playerUrl = `${APP_URL}/station/${slug}`;

  return (
    <View style={{ flex: 1, backgroundColor: colors.bg }}>
      <Stack.Screen options={{ title: broadcast.stationName ?? 'Studio' }} />
      <Animated.ScrollView ref={scrollRef} stickyHeaderIndices={[0]} contentContainerStyle={{ paddingBottom: 48 }}>
        <Lamp signal={signal} transport={transport} uptime={uptime} listeners={listeners} bitrateKbps={BITRATE_KBPS} />
        <View style={styles.body}>
          <View style={styles.row}>
            <Button
              label="Share"
              icon={<IconShare size={18} color={colors.text} />}
              onPress={() => Share.share({ message: playerUrl, url: playerUrl })}
              style={{ flex: 1 }}
            />
            <EndBroadcast
              slug={slug}
              autoDjLocked={autoDjLocked}
              onEnd={async () => {
                await broadcast.stop({ releaseStation: autoDjLocked });
                router.replace('/stations');
              }}
            />
          </View>

          <Deck engine={engine} micDisabled={broadcast.micDisabled} />

          {broadcast.micDisabled ? (
            <View style={styles.musicOnly}>
              <T tone="muted" size={13}>
                Music only — no mic in this broadcast
              </T>
            </View>
          ) : (
            <MicDesk engine={engine} />
          )}

          <MonitorBar engine={engine} />

          <RunningOrder engine={engine} scrollRef={scrollRef} />
        </View>
      </Animated.ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  body: { padding: 16, gap: 16 },
  row: { flexDirection: 'row', gap: 10 },
  musicOnly: {
    borderWidth: 1,
    borderColor: colors.hairline,
    borderRadius: 14,
    padding: 16,
    alignItems: 'center',
  },
});
