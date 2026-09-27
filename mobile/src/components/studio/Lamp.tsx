import { useEffect, useState } from 'react';
import { AccessibilityInfo, Animated, StyleSheet, View } from 'react-native';

import type { StudioSignal, TransportHealth } from '../../broadcast/hooks';
import { formatClock } from '../../broadcast/hooks';
import { alpha, colors, fonts, radius } from '../../lib/theme';
import { T } from '../ui';

/** The web's SIGNAL_TONE: the whole strip takes the state, not a dot. */
const TONE = {
  live: {
    strip: alpha(colors.live, 0.08),
    edge: alpha(colors.live, 0.25),
    chip: colors.live,
    ink: colors.liveInk,
    text: 'live',
  },
  mic: {
    strip: alpha(colors.mic, 0.1),
    edge: alpha(colors.mic, 0.3),
    chip: colors.mic,
    ink: colors.micInk,
    text: 'mic',
  },
  fault: {
    strip: alpha(colors.fault, 0.12),
    edge: alpha(colors.fault, 0.4),
    chip: colors.fault,
    ink: colors.faultInk,
    text: 'fault',
  },
} as const;

export function Lamp({
  signal,
  transport,
  uptime,
  listeners,
  bitrateKbps,
}: {
  signal: StudioSignal;
  transport: TransportHealth;
  uptime: number;
  listeners: number | null;
  bitrateKbps: number;
}) {
  const tone = TONE[signal.tone];
  const fault = signal.tone === 'fault';
  const lost = transport.stats ? transport.stats.droppedMs / 1000 : 0;
  const [pulse] = useState(() => new Animated.Value(1));

  // A fault pulses the chip three times when it arrives; healthy states sit still.
  useEffect(() => {
    AccessibilityInfo.announceForAccessibility(`${signal.label}. ${signal.detail}`);
    if (!fault) return;
    pulse.setValue(1);
    Animated.loop(
      Animated.sequence([
        Animated.timing(pulse, { toValue: 0.45, duration: 350, useNativeDriver: true }),
        Animated.timing(pulse, { toValue: 1, duration: 350, useNativeDriver: true }),
      ]),
      { iterations: 3 },
    ).start();
    // Keyed on the code so each change of state is announced and pulsed once.
  }, [signal.code]); // eslint-disable-line react-hooks/exhaustive-deps

  return (
    // Opaque base: the tint is 8–12%, and the studio scrolls under this strip.
    <View style={styles.base}>
      <View style={[styles.strip, { backgroundColor: tone.strip, borderColor: tone.edge }]}>
        <View style={styles.top}>
          <Animated.View style={[styles.chip, { backgroundColor: tone.chip, opacity: pulse }]}>
            <View style={[styles.dot, { backgroundColor: tone.ink }]} />
            <T style={[styles.chipText, { color: tone.ink }]}>{signal.label.toUpperCase()}</T>
          </Animated.View>
        </View>
        <T tone={tone.text} size={13} style={{ lineHeight: 18 }}>
          {signal.detail}
        </T>
        <View style={styles.stats}>
          <View style={styles.stat}>
            <T tone="muted" size={12}>
              Uptime
            </T>
            <T mono size={14}>
              {formatClock(uptime)}
            </T>
          </View>
          <View style={styles.stat}>
            <T size={14} weight="semibold">
              {listeners === null ? '—' : listeners.toLocaleString()}
            </T>
            <T tone="muted" size={12}>
              listening
            </T>
          </View>
          <T mono tone="muted" size={12}>
            {bitrateKbps} kbps
            {lost > 0 && (
              <T mono size={12} tone={transport.droppingNow ? 'fault' : 'text'}>
                {' '}
                · {lost.toFixed(1)}s lost
              </T>
            )}
          </T>
        </View>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  base: { backgroundColor: colors.bg, zIndex: 10 },
  strip: { borderBottomWidth: 1, borderTopWidth: 1, paddingHorizontal: 16, paddingVertical: 12, gap: 8 },
  top: { flexDirection: 'row', alignItems: 'center' },
  chip: {
    height: 32,
    borderRadius: radius.md,
    paddingHorizontal: 12,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  dot: { width: 8, height: 8, borderRadius: 4 },
  chipText: { fontFamily: fonts.bold, fontSize: 13, letterSpacing: 1 },
  stats: { flexDirection: 'row', alignItems: 'baseline', justifyContent: 'space-between', gap: 12 },
  stat: { flexDirection: 'row', alignItems: 'baseline', gap: 6 },
});
