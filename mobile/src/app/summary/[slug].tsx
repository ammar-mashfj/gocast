import { router, useLocalSearchParams } from 'expo-router';
import { useEffect } from 'react';
import { BackHandler, ScrollView, StyleSheet, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { formatClock } from '../../broadcast/hooks';
import { Stat } from '../../components/summary/parts';
import { Button, T } from '../../components/ui';
import { colors } from '../../lib/theme';

const AFTER: Record<string, string> = {
  autodj: 'AutoDJ picked up where you left off, so the station is still on air. Your running order is saved for next time.',
  silence:
    'AutoDJ took over, but your library is empty, so the station goes quiet and switches off shortly. Your running order is saved for next time.',
  off_air: 'Your station is off air now. Your running order is saved for next time.',
};

/** "That's a wrap": the show's numbers, straight after End. */
export default function Summary() {
  const params = useLocalSearchParams<{
    slug: string;
    name?: string;
    seconds?: string;
    peak?: string;
    tracks?: string;
    lost?: string;
    after?: string;
  }>();
  const insets = useSafeAreaInsets();
  const lost = Number(params.lost ?? 0);

  const back = () => router.dismissTo({ pathname: '/station/[slug]', params: { slug: params.slug } });

  // Back goes to the station too, not into the studio that just closed.
  useEffect(() => {
    const sub = BackHandler.addEventListener('hardwareBackPress', () => {
      back();
      return true;
    });
    return () => sub.remove();
  });

  return (
    <View style={[styles.screen, { paddingTop: insets.top + 24, paddingBottom: insets.bottom + 22 }]}>
      <ScrollView contentContainerStyle={styles.body} showsVerticalScrollIndicator={false}>
        <T mono weight={600} size={12} tracking={0.14} tone="muted" numberOfLines={1}>
          SHOW ENDED{params.name ? ` · ${params.name.toUpperCase()}` : ''}
        </T>
        <T weight={800} size={60} tracking={-0.05} style={{ lineHeight: 56, paddingTop: 4 }}>
          That&apos;s{'\n'}a wrap.
        </T>
        <View style={styles.grid}>
          <Stat label="ON AIR FOR" value={formatClock(Number(params.seconds ?? 0))} />
          <Stat label="PEAK LISTENERS" value={params.peak ?? '0'} />
          <Stat label="TRACKS PLAYED" value={params.tracks ?? '0'} />
          <Stat label="AUDIO LOST" value={`${lost} s`} color={lost > 0 ? colors.pro : colors.ok} />
        </View>
        <T weight={400} size={15} tone="muted" lineHeight={1.45}>
          {AFTER[params.after ?? ''] ?? AFTER.off_air}
        </T>
      </ScrollView>
      <Button label="Back to station" onPress={back} />
    </View>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.bg, paddingHorizontal: 22, gap: 24 },
  body: { flexGrow: 1, justifyContent: 'center', gap: 28 },
  grid: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
});
