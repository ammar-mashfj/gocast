import { router, useLocalSearchParams } from 'expo-router';
import { useEffect, useRef } from 'react';
import { StyleSheet, View } from 'react-native';

import { useBroadcast } from '../../broadcast/BroadcastContext';
import { useStudioSignal, useTransportHealth } from '../../broadcast/hooks';
import { OnAir } from '../../components/studio/OnAir';
import { colors } from '../../lib/theme';

/**
 * The studio. The broadcast lives above this screen, so leaving it does not
 * end the show; the live strip on the other screens leads back here.
 */
export default function Studio() {
  const { slug } = useLocalSearchParams<{ slug: string }>();
  const broadcast = useBroadcast();
  const onAir = broadcast.stationSlug === slug && (broadcast.state === 'live' || broadcast.state === 'reconnecting');
  const transport = useTransportHealth(onAir);
  const signal = useStudioSignal(transport);
  const engine = broadcast.stationSlug === slug ? broadcast.engine : null;
  // Set while End runs, so the effect below doesn't also navigate when the
  // show stops underneath it.
  const endingRef = useRef(false);

  // Nothing to show once the show is over (or it died): back to Go live.
  useEffect(() => {
    if (endingRef.current) return;
    if (broadcast.stationSlug === slug && broadcast.state !== 'idle' && broadcast.state !== 'error') return;
    router.replace({ pathname: '/live/[slug]', params: { slug } });
  }, [broadcast.stationSlug, broadcast.state, slug]);

  if (!onAir || !engine || !signal) return <View style={styles.screen} />;
  return <OnAir slug={slug} engine={engine} signal={signal} endingRef={endingRef} lostMs={transport.stats?.droppedMs ?? 0} />;
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.bg },
});
