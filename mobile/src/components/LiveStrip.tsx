import { IconArrowRight } from '@tabler/icons-react-native';
import { router } from 'expo-router';
import { Pressable, StyleSheet } from 'react-native';

import { useBroadcast } from '../broadcast/BroadcastContext';
import { formatClock, useNow } from '../broadcast/hooks';
import { colors } from '../lib/theme';
import { Dot, T } from './ui';

/**
 * The coral bar above the stations list and the station page while a show
 * is running from this phone: the uptime, and one tap back to the studio.
 */
export function LiveStrip() {
  const broadcast = useBroadcast();
  const now = useNow(1000);
  const onAir = broadcast.state === 'live' || broadcast.state === 'reconnecting';
  if (!onAir || !broadcast.stationSlug) return null;

  const reconnecting = broadcast.state === 'reconnecting';
  const ink = reconnecting ? colors.proInk : colors.liveInk;
  const uptime = broadcast.liveSince ? (now - broadcast.liveSince) / 1000 : 0;

  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={`${reconnecting ? 'Reconnecting' : 'Live'} on ${broadcast.stationName}. Back to studio`}
      onPress={() => router.navigate({ pathname: '/studio/[slug]', params: { slug: broadcast.stationSlug! } })}
      style={({ pressed }) => [
        styles.strip,
        { backgroundColor: reconnecting ? colors.pro : colors.live },
        pressed && { opacity: 0.9 },
      ]}
    >
      <Dot color={ink} />
      <T mono weight={700} size={12} tracking={0.08} style={{ color: ink }}>
        {reconnecting ? 'RECONNECTING' : 'LIVE'}
      </T>
      <T mono weight={600} size={13} style={{ flex: 1, color: ink }}>
        {formatClock(uptime)}
      </T>
      <T weight={700} size={13} style={{ color: ink }}>
        Back to studio
      </T>
      <IconArrowRight size={15} color={ink} strokeWidth={2.5} />
    </Pressable>
  );
}

const styles = StyleSheet.create({
  strip: {
    marginHorizontal: 14,
    marginBottom: 6,
    height: 40,
    borderRadius: 14,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    paddingHorizontal: 14,
  },
});
