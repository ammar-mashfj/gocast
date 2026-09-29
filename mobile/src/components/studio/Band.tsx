import { IconArrowLeft } from '@tabler/icons-react-native';
import { useEffect, useState } from 'react';
import { AccessibilityInfo, Animated, Pressable, StyleSheet, View } from 'react-native';

import { formatClock } from '../../broadcast/hooks';
import { colors } from '../../lib/theme';
import { Dot, T } from '../ui';
import type { Lamp } from './model';

/**
 * The studio's top band: back, the lamp, the show clock and End, then one
 * line on what listeners are getting and how many there are.
 */
export function Band({
  lamp,
  code,
  uptime,
  listeners,
  onBack,
  onEnd,
}: {
  lamp: Lamp;
  /** Changes with the state, so each change is announced and pulsed once. */
  code: string;
  uptime: number;
  listeners: number | null;
  onBack: () => void;
  onEnd: () => void;
}) {
  const [pulse] = useState(() => new Animated.Value(1));

  useEffect(() => {
    AccessibilityInfo.announceForAccessibility(`${lamp.label}. ${lamp.msg}`);
    if (!lamp.fault) return;
    pulse.setValue(1);
    Animated.loop(
      Animated.sequence([
        Animated.timing(pulse, { toValue: 0.45, duration: 350, useNativeDriver: true }),
        Animated.timing(pulse, { toValue: 1, duration: 350, useNativeDriver: true }),
      ]),
      { iterations: 3 },
    ).start();
  }, [code]); // eslint-disable-line react-hooks/exhaustive-deps

  return (
    <View style={[styles.band, { backgroundColor: lamp.band }]}>
      <View style={styles.row}>
        <Pressable
          accessibilityRole="button"
          accessibilityLabel="Back to the station"
          hitSlop={6}
          onPress={onBack}
          style={styles.back}
        >
          <IconArrowLeft size={22} color={colors.text} strokeWidth={2} />
        </Pressable>
        <Animated.View style={[styles.chip, { backgroundColor: lamp.color, opacity: pulse }]}>
          <Dot color={colors.liveInk} size={7} />
          <T mono weight={700} size={12} tracking={0.08} tone="liveInk">
            {lamp.label}
          </T>
        </Animated.View>
        <T mono weight={600} size={16} style={{ flex: 1 }} accessibilityLabel={`On air for ${formatClock(uptime)}`}>
          {formatClock(uptime)}
        </T>
        <Pressable
          accessibilityRole="button"
          accessibilityLabel="End the broadcast"
          onPress={onEnd}
          style={({ pressed }) => [styles.end, pressed && { opacity: 0.7 }]}
        >
          <T weight={700} size={13}>
            End
          </T>
        </Pressable>
      </View>
      <View style={styles.msgRow}>
        <T weight={500} size={13} lineHeight={1.35} style={{ flex: 1, color: lamp.ink }}>
          {lamp.msg}
        </T>
        <T mono weight={600} size={12}>
          {listeners === null ? '–' : listeners.toLocaleString()} listening
        </T>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  band: { marginHorizontal: 12, borderRadius: 24, paddingVertical: 12, paddingLeft: 14, paddingRight: 12, gap: 10 },
  row: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  back: { width: 34, height: 34, marginLeft: -6, alignItems: 'center', justifyContent: 'center' },
  chip: {
    height: 30,
    borderRadius: 10,
    paddingHorizontal: 12,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 7,
  },
  end: {
    height: 34,
    paddingHorizontal: 14,
    borderRadius: 11,
    backgroundColor: 'rgba(244,241,236,0.1)',
    justifyContent: 'center',
  },
  msgRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-start', gap: 10 },
});
