import { IconArrowsMinimize, IconHeadphones, IconMicrophone } from '@tabler/icons-react-native';
import { Pressable, StyleSheet, View } from 'react-native';
import { GestureDetector } from 'react-native-gesture-handler';
import Svg, { Circle, Defs, Path, RadialGradient, Rect, Stop } from 'react-native-svg';

import type { AudioEngine } from '../../audio/engine';
import { formatClock, type EngineSnapshot } from '../../broadcast/hooks';
import { colors } from '../../lib/theme';
import { Dot, Switch, T } from '../ui';
import { mmss, upcomingCount, useHoldToTalk, useMicLevel, useTrackClock } from './model';

const RING = 300;
const RING_W = 9;
const BARS = [12, 24, 34, 20, 28, 14, 8];

/**
 * Focus: the whole screen is the talk button. For a long talk segment, when
 * the only things that matter are the mic, how many are listening, and how
 * long the track under you has left.
 */
export function Focus({
  engine,
  snap,
  micDisabled,
  uptime,
  listeners,
  onExit,
  onEnd,
  onQueue,
}: {
  engine: AudioEngine;
  snap: EngineSnapshot;
  micDisabled: boolean;
  uptime: number;
  listeners: number | null;
  onExit: () => void;
  onEnd: () => void;
  onQueue: () => void;
}) {
  const hold = useHoldToTalk(engine, snap.micLatched, micDisabled);
  const talking = !micDisabled && (hold.holding || snap.micActive);
  const track = snap.current;
  const duration = track?.duration ?? 0;
  const { elapsed } = useTrackClock(engine, duration);
  const level = useMicLevel(engine, talking);
  const count = listeners ?? 0;
  const next = snap.queue.length > 1 ? snap.queue[(snap.currentIndex + 1) % snap.queue.length] : null;
  const progress = duration > 0 ? Math.min(1, elapsed / duration) : 0;
  const size = talking ? 252 : 264;

  return (
    <View style={styles.screen}>
      {talking && (
        <Svg style={StyleSheet.absoluteFill} pointerEvents="none">
          <Defs>
            <RadialGradient id="glow" cx="50%" cy="52%" r="62%">
              <Stop offset="0" stopColor={colors.liveBand} />
              <Stop offset="1" stopColor={colors.bg} />
            </RadialGradient>
          </Defs>
          <Rect width="100%" height="100%" fill="url(#glow)" />
        </Svg>
      )}

      <View style={styles.top}>
        <Pressable
          accessibilityRole="button"
          accessibilityLabel="Back to the studio"
          onPress={onExit}
          style={styles.exit}
        >
          <IconArrowsMinimize size={16} color={colors.muted} strokeWidth={2.5} />
          <T weight={700} size={14} tone="muted">
            Studio
          </T>
        </Pressable>
        <View style={[styles.pill, { backgroundColor: talking ? colors.live : 'transparent' }]}>
          <Dot color={talking ? colors.liveInk : colors.live} />
          <T mono weight={700} size={12} tracking={0.1} style={{ color: talking ? colors.liveInk : colors.live }}>
            {talking ? 'MIC LIVE' : micDisabled ? 'MUSIC' : 'LIVE'} {formatClock(uptime)}
          </T>
        </View>
        <Pressable
          accessibilityRole="button"
          accessibilityLabel="End the broadcast"
          onPress={onEnd}
          style={({ pressed: p }) => [styles.end, p && { opacity: 0.7 }]}
        >
          <T weight={700} size={14}>
            End
          </T>
        </Pressable>
      </View>

      <T weight={800} size={34} tracking={-0.04} style={{ lineHeight: 36 }}>
        {talking
          ? count === 1
            ? '1 person hears'
            : `${count} people hear`
          : count === 1
            ? '1 person is'
            : `${count} people are`}
        {'\n'}
        <T weight={800} size={34} tracking={-0.04} style={{ color: talking ? colors.liveSoft : colors.muted }}>
          {talking ? 'you right now.' : 'listening.'}
        </T>
      </T>

      <View style={styles.center}>
        <View
          style={{
            width: RING,
            height: RING,
            alignItems: 'center',
            justifyContent: 'center',
          }}
        >
          <Svg width={RING} height={RING} style={StyleSheet.absoluteFill}>
            <Circle
              cx={RING / 2}
              cy={RING / 2}
              r={(RING - RING_W) / 2}
              stroke={talking ? '#2A1A17' : colors.raised}
              strokeWidth={RING_W}
              fill={colors.bg}
            />
            {progress > 0.002 && <Path d={arc(progress)} stroke={colors.text} strokeWidth={RING_W} fill="none" />}
          </Svg>
          <GestureDetector gesture={hold.gesture}>
            <View
              accessible
              accessibilityRole="button"
              accessibilityLabel={
                micDisabled ? 'Music only, mic off' : snap.micLatched ? 'Mic open. Tap to close' : 'Hold to talk'
              }
              style={[
                styles.button,
                {
                  width: size,
                  height: size,
                  borderRadius: size / 2,
                  backgroundColor: talking ? colors.live : hold.arming ? colors.track : colors.chip,
                  boxShadow: talking
                    ? '0 0 80px 10px rgba(255,90,78,0.25), inset 0 -12px 30px rgba(0,0,0,0.2)'
                    : 'inset 0 2px 0 rgba(244,241,236,0.06), 0 20px 50px -20px rgba(0,0,0,0.8)',
                },
              ]}
            >
              {talking ? (
                <View style={styles.bars}>
                  {BARS.map((h, i) => (
                    <View key={i} style={[styles.barLine, { height: Math.max(6, h * (0.3 + 0.7 * level)) }]} />
                  ))}
                </View>
              ) : (
                <IconMicrophone size={34} color={micDisabled ? colors.faint : colors.live} strokeWidth={2} />
              )}
              <T
                weight={800}
                size={34}
                tracking={-0.03}
                style={{
                  color: talking ? colors.liveInk : micDisabled ? colors.faint : colors.text,
                  textAlign: 'center',
                }}
              >
                {talking ? 'You’re on' : micDisabled ? 'Music only' : 'Hold to talk'}
              </T>
              <T
                weight={500}
                size={14}
                lineHeight={1.3}
                style={{
                  color: talking ? colors.liveSub : colors.muted,
                  textAlign: 'center',
                  maxWidth: 190,
                }}
              >
                {talking
                  ? snap.micLatched
                    ? 'tap to close the mic'
                    : 'let go to close the mic'
                  : micDisabled
                    ? 'mic is off for this show'
                    : hold.arming
                      ? 'keep holding…'
                      : 'music dips under you'}
              </T>
            </View>
          </GestureDetector>
        </View>
      </View>

      <View style={styles.pills}>
        <Pressable
          accessibilityRole="switch"
          accessibilityState={{
            checked: snap.micLatched,
            disabled: micDisabled,
          }}
          disabled={micDisabled}
          onPress={() => engine.setMicLatched(!snap.micLatched)}
          style={[
            styles.latch,
            snap.micLatched
              ? {
                  backgroundColor: 'rgba(255,90,78,0.14)',
                  borderColor: 'rgba(255,90,78,0.5)',
                }
              : { backgroundColor: colors.card, borderColor: 'transparent' },
          ]}
        >
          <Switch on={snap.micLatched} dim={micDisabled} />
          <T
            weight={700}
            size={14}
            style={{
              color: micDisabled ? colors.faint : snap.micLatched ? colors.livePale : colors.text,
            }}
          >
            {snap.micLatched ? 'Mic stays open' : 'Keep mic open'}
          </T>
        </Pressable>
        <Pressable
          accessibilityRole="switch"
          accessibilityState={{ checked: snap.monitorEnabled }}
          accessibilityLabel="Monitor"
          onPress={() => engine.setMonitorEnabled(!snap.monitorEnabled)}
          style={[
            styles.monitor,
            {
              backgroundColor: snap.monitorEnabled ? colors.text : colors.card,
            },
          ]}
        >
          <IconHeadphones size={18} color={snap.monitorEnabled ? colors.bg : colors.muted} strokeWidth={2.25} />
          <T weight={700} size={14} style={{ color: snap.monitorEnabled ? colors.bg : colors.muted }}>
            Monitor {snap.monitorEnabled ? 'ON' : 'OFF'}
          </T>
        </Pressable>
      </View>

      <View style={{ alignItems: 'center', gap: 4 }}>
        <View style={styles.nowRow}>
          <T weight={700} size={18} numberOfLines={1} style={{ flexShrink: 1 }}>
            {track ? [track.title, track.artist].filter(Boolean).join(' — ') : 'Nothing queued'}
          </T>
          {talking && !!track && (
            <View style={styles.dipped}>
              <T mono weight={600} size={11} tone="muted">
                DIPPED
              </T>
            </View>
          )}
        </View>
        <T mono weight={500} size={13} tone="faint" numberOfLines={1}>
          {track
            ? `${mmss(duration - elapsed)} left · next: ${next ? next.title : 'end of running order'}`
            : 'Add music from the running order'}
        </T>
      </View>

      <View style={styles.grid}>
        <Pressable accessibilityRole="button" onPress={onQueue} style={[styles.cell, { backgroundColor: colors.card }]}>
          <T weight={700} size={14}>
            Queue · {upcomingCount(snap)}
          </T>
        </Pressable>
        <Pressable
          accessibilityRole="button"
          onPress={() => (snap.queue.length ? engine.togglePlay() : onQueue())}
          style={[styles.cell, { backgroundColor: colors.text }]}
        >
          <T weight={700} size={14} tone="ink">
            {snap.playing ? 'Pause' : 'Play'}
          </T>
        </Pressable>
        <Pressable
          accessibilityRole="button"
          disabled={snap.queue.length < 2}
          onPress={() => engine.next()}
          style={[styles.cell, { backgroundColor: colors.card }, snap.queue.length < 2 && { opacity: 0.4 }]}
        >
          <T weight={700} size={14}>
            Skip
          </T>
        </Pressable>
      </View>
    </View>
  );
}

/** A clockwise arc from twelve o'clock covering `frac` of the ring. */
function arc(frac: number): string {
  const c = RING / 2;
  const r = (RING - RING_W) / 2;
  const f = Math.min(frac, 0.9999);
  const angle = f * Math.PI * 2;
  const x = c + r * Math.sin(angle);
  const y = c - r * Math.cos(angle);
  return `M ${c} ${c - r} A ${r} ${r} 0 ${f > 0.5 ? 1 : 0} 1 ${x} ${y}`;
}

const styles = StyleSheet.create({
  screen: {
    flex: 1,
    paddingTop: 4,
    paddingHorizontal: 22,
    paddingBottom: 14,
    gap: 16,
  },
  top: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 10,
  },
  exit: {
    height: 36,
    marginLeft: -8,
    paddingLeft: 8,
    paddingRight: 12,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  pill: {
    height: 30,
    paddingHorizontal: 12,
    borderRadius: 10,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  end: {
    borderWidth: 1.5,
    borderColor: 'rgba(244,241,236,0.2)',
    borderRadius: 12,
    paddingVertical: 7,
    paddingHorizontal: 14,
  },
  center: {
    flex: 1,
    minHeight: 0,
    alignItems: 'center',
    justifyContent: 'center',
  },
  button: { alignItems: 'center', justifyContent: 'center', gap: 10 },
  bars: { flexDirection: 'row', gap: 4, alignItems: 'center', height: 34 },
  barLine: { width: 5, borderRadius: 3, backgroundColor: colors.liveInk },
  pills: { alignSelf: 'center', flexDirection: 'row', gap: 8 },
  latch: {
    height: 44,
    borderRadius: 22,
    borderWidth: 1.5,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    paddingLeft: 6,
    paddingRight: 16,
  },
  monitor: {
    height: 44,
    borderRadius: 22,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    paddingHorizontal: 16,
  },
  nowRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    maxWidth: '100%',
  },
  dipped: {
    borderWidth: 1,
    borderColor: 'rgba(244,241,236,0.2)',
    borderRadius: 6,
    paddingHorizontal: 6,
    paddingVertical: 2,
  },
  grid: { flexDirection: 'row', gap: 8 },
  cell: {
    flex: 1,
    height: 54,
    borderRadius: 16,
    alignItems: 'center',
    justifyContent: 'center',
  },
});
