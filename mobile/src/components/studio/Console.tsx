import {
  IconAdjustmentsHorizontal,
  IconArrowsMaximize,
  IconPlayerPauseFilled,
  IconPlayerPlayFilled,
  IconPlayerSkipForwardFilled,
} from '@tabler/icons-react-native';
import { useEffect, useState } from 'react';
import { Animated, Pressable, StyleSheet, View } from 'react-native';
import { GestureDetector } from 'react-native-gesture-handler';

import type { AudioEngine } from '../../audio/engine';
import type { EngineSnapshot } from '../../broadcast/hooks';
import { colors } from '../../lib/theme';
import { Progress, Switch, T } from '../ui';
import { FLOOR_DB, mmss, upcomingCount, upNextOf, useHoldToTalk, useMicLevel, useTrackClock } from './model';

// ── Now playing ──

/** Under this many seconds the time left turns amber: time to talk it up. */
const ENDING_SOON_S = 15;

export function NowPlaying({
  engine,
  snap,
  onQueue,
}: {
  engine: AudioEngine;
  snap: EngineSnapshot;
  onQueue: () => void;
}) {
  const track = snap.current;
  const duration = track?.duration ?? 0;
  const { elapsed, cue } = useTrackClock(engine, duration);
  const left = Math.max(0, duration - elapsed);
  const soon = !!track && snap.playing && left < ENDING_SOON_S;
  const pulse = usePulse(cue);
  const next = upNextOf(snap);

  return (
    <View style={styles.card}>
      <View style={styles.trackRow}>
        <View style={{ flex: 1, minWidth: 0, gap: 3 }}>
          <T weight={700} size={18} tracking={-0.01} numberOfLines={1}>
            {track?.title ?? 'Nothing queued'}
          </T>
          <T weight={500} size={13} tone="muted" numberOfLines={1}>
            {track ? track.artist || 'Unknown artist' : 'Add music from the running order'}
          </T>
        </View>
        <Animated.View style={[styles.left, { transform: [{ scale: pulse }] }]}>
          <T
            mono
            weight={600}
            size={26}
            tracking={-0.03}
            style={{ color: soon ? colors.pro : colors.text, lineHeight: 28 }}
          >
            {track ? mmss(left) : '–:––'}
          </T>
          <T mono weight={500} size={10} tone="faint" tracking={0.08}>
            LEFT
          </T>
        </Animated.View>
      </View>

      <Progress fraction={duration > 0 ? elapsed / duration : 0} color={colors.text} track={colors.line} height={5} />

      <View style={styles.transport}>
        <Pressable
          accessibilityRole="button"
          accessibilityLabel={`Up next: ${next.text}. Open the running order`}
          onPress={onQueue}
          style={({ pressed }) => [styles.next, pressed && { opacity: 0.75 }]}
        >
          <T mono weight={600} size={10} tone="faint" tracking={0.06}>
            NEXT
          </T>
          <T weight={600} size={14} numberOfLines={1} style={{ flex: 1, minWidth: 0 }}>
            {next.text}
          </T>
          <View style={styles.count}>
            <T mono weight={600} size={11} tone="ink">
              {upcomingCount(snap)}
            </T>
          </View>
        </Pressable>
        <Pressable
          accessibilityRole="button"
          accessibilityLabel="Skip to the next track"
          disabled={snap.queue.length < 2}
          onPress={() => engine.next()}
          style={({ pressed }) => [
            styles.skip,
            pressed && { opacity: 0.75 },
            snap.queue.length < 2 && { opacity: 0.4 },
          ]}
        >
          <IconPlayerSkipForwardFilled size={20} color={colors.text} />
        </Pressable>
        <Pressable
          accessibilityRole="button"
          accessibilityLabel={snap.playing ? 'Pause' : 'Play'}
          onPress={() => (snap.queue.length ? engine.togglePlay() : onQueue())}
          style={({ pressed }) => [styles.play, pressed && { transform: [{ scale: 0.96 }] }]}
        >
          {snap.playing ? (
            <IconPlayerPauseFilled size={22} color={colors.bg} />
          ) : (
            <IconPlayerPlayFilled size={22} color={colors.bg} />
          )}
        </Pressable>
      </View>
    </View>
  );
}

/** A small bump each time `key` changes (the talk-up cues). */
function usePulse(key: number) {
  const [scale] = useState(() => new Animated.Value(1));
  useEffect(() => {
    if (!key) return;
    Animated.sequence([
      Animated.timing(scale, {
        toValue: 1.12,
        duration: 160,
        useNativeDriver: true,
      }),
      Animated.timing(scale, {
        toValue: 1,
        duration: 360,
        useNativeDriver: true,
      }),
    ]).start();
  }, [key, scale]);
  return scale;
}

// ── The talk pad ──

const SEGMENTS = 30;
/** Where the meter turns amber (loud) and coral (about to clip). */
const WARM_DB = -12;
const HOT_DB = -6;
/** Scale marks, each placed under the segment it names. */
const SCALE_DB = [-48, -24, -12, 0];

/**
 * Hold anywhere on the pad to talk; with the mic latched, a tap closes it.
 * The mic opens only after a short hold (HOLD_MS), so a brush never puts
 * anyone on air; the pad lights from the finger, not the engine's round trip. The meter shows the mic even while closed, as a
 * private mic check.
 */
export function TalkPad({
  engine,
  snap,
  micDisabled,
  onFocus,
}: {
  engine: AudioEngine;
  snap: EngineSnapshot;
  micDisabled: boolean;
  onFocus: () => void;
}) {
  const hold = useHoldToTalk(engine, snap.micLatched, micDisabled);
  const open = !micDisabled && (hold.holding || snap.micActive);
  const level = useMicLevel(engine, !micDisabled);

  const look = micDisabled
    ? {
        bg: '#141210',
        ink: colors.faint,
        sub: colors.faint,
        iconBg: colors.chip,
        title: 'Music only',
        hint: 'You picked a music-only show. The mic stays closed.',
        note: 'Mic off',
      }
    : open
      ? {
          bg: colors.live,
          ink: colors.liveInk,
          sub: colors.liveSub,
          iconBg: 'rgba(26,8,6,0.14)',
          title: snap.micLatched ? 'Mic open' : 'You’re on',
          hint: snap.micLatched ? 'Tap the pad to close the mic' : 'Let go to close the mic',
          note: 'Going out live',
        }
      : {
          bg: colors.card,
          ink: colors.text,
          sub: colors.muted,
          iconBg: colors.raised,
          title: 'Hold to talk',
          hint:
            snap.prefs.duck === 'silence'
              ? 'Press and hold anywhere here. The music fades out while you talk.'
              : 'Press and hold anywhere here. The music dips while you talk.',
          note: 'Mic check · only you see this',
        };

  return (
    <GestureDetector gesture={hold.gesture}>
      <View
        accessible
        accessibilityRole="button"
        accessibilityLabel={
          micDisabled ? 'Music only, mic off' : snap.micLatched ? 'Mic open. Tap to close' : 'Hold to talk'
        }
        accessibilityState={{ disabled: micDisabled }}
        style={[styles.pad, { backgroundColor: hold.arming ? colors.raised : look.bg }]}
      >
        <View style={styles.padTop}>
          <View style={{ flex: 1, gap: 6 }}>
            <T weight={800} size={34} tracking={-0.035} style={{ color: look.ink, lineHeight: 36 }}>
              {look.title}
            </T>
            <T weight={500} size={14} lineHeight={1.35} style={{ color: look.sub }}>
              {hold.arming ? 'Keep holding…' : look.hint}
            </T>
          </View>
          <Pressable
            accessibilityRole="button"
            accessibilityLabel="Focus mode"
            onPress={onFocus}
            style={({ pressed: p }) => [styles.focus, { backgroundColor: look.iconBg }, p && { opacity: 0.75 }]}
          >
            <IconArrowsMaximize size={16} color={look.ink} strokeWidth={2.5} />
            <T weight={700} size={13} style={{ color: look.ink }}>
              Focus
            </T>
          </Pressable>
        </View>
        <View style={{ gap: 6 }}>
          <T mono weight={500} size={11} style={{ color: look.sub }}>
            {look.note}
          </T>
          <View style={styles.meter} accessibilityLabel={`Mic level ${Math.round(FLOOR_DB * (1 - level))} dB`}>
            {Array.from({ length: SEGMENTS }, (_, i) => {
              // The loudest level this segment stands for.
              const top = FLOOR_DB + ((i + 1) / SEGMENTS) * -FLOOR_DB;
              const on = !micDisabled && i / SEGMENTS < level;
              const hot = top > HOT_DB;
              const warm = top > WARM_DB;
              const bg = open
                ? on
                  ? hot
                    ? colors.liveHot
                    : colors.liveInk
                  : 'rgba(26,8,6,0.22)'
                : on
                  ? hot
                    ? colors.live
                    : warm
                      ? colors.pro
                      : colors.ok
                  : colors.track;
              return <View key={i} style={[styles.seg, { backgroundColor: bg }]} />;
            })}
          </View>
          <View style={styles.scale}>
            {SCALE_DB.map((db) => (
              <T
                key={db}
                mono
                weight={500}
                size={11}
                style={[
                  styles.tick,
                  { color: look.sub },
                  db === 0
                    ? { right: 0 }
                    : {
                        left: `${((db - FLOOR_DB) / -FLOOR_DB) * 100}%`,
                        transform: [{ translateX: -12 }],
                      },
                ]}
              >
                {db === 0 ? '0 dB' : `−${-db}`}
              </T>
            ))}
          </View>
        </View>
      </View>
    </GestureDetector>
  );
}

// ── The control row under the pad ──

export function Controls({
  engine,
  snap,
  micDisabled,
  onMicSettings,
}: {
  engine: AudioEngine;
  snap: EngineSnapshot;
  micDisabled: boolean;
  onMicSettings: () => void;
}) {
  return (
    <View style={styles.controls}>
      <Pressable
        accessibilityRole="switch"
        accessibilityState={{ checked: snap.micLatched, disabled: micDisabled }}
        accessibilityLabel="Keep mic open"
        disabled={micDisabled}
        onPress={() => engine.setMicLatched(!snap.micLatched)}
        style={({ pressed }) => [styles.latch, pressed && { opacity: 0.8 }]}
      >
        <Switch on={snap.micLatched} dim={micDisabled} />
        <View style={{ flex: 1, gap: 1 }}>
          <T weight={700} size={14} numberOfLines={1} tone={micDisabled ? 'faint' : 'text'}>
            Keep mic open
          </T>
          <T weight={500} size={11} tone="faint" numberOfLines={1}>
            {micDisabled
              ? 'No mic in this show'
              : snap.micLatched
                ? 'On · mic stays open'
                : 'Off · hold the pad instead'}
          </T>
        </View>
      </Pressable>
      <Pressable
        accessibilityRole="switch"
        accessibilityState={{ checked: snap.monitorEnabled }}
        accessibilityLabel="Monitor the music through this phone"
        onPress={() => engine.setMonitorEnabled(!snap.monitorEnabled)}
        style={({ pressed }) => [
          styles.monitor,
          { backgroundColor: snap.monitorEnabled ? colors.text : colors.card },
          pressed && { opacity: 0.8 },
        ]}
      >
        <T weight={700} size={13} style={{ color: snap.monitorEnabled ? colors.bg : colors.muted }}>
          Monitor
        </T>
        <T mono weight={500} size={10} style={{ color: snap.monitorEnabled ? colors.bg : colors.muted }}>
          {snap.monitorEnabled ? 'ON' : 'OFF'}
        </T>
      </Pressable>
      <Pressable
        accessibilityRole="button"
        accessibilityLabel="Mic settings"
        onPress={onMicSettings}
        style={({ pressed }) => [styles.settings, pressed && { opacity: 0.8 }]}
      >
        <IconAdjustmentsHorizontal size={22} color={colors.text} strokeWidth={2} />
      </Pressable>
    </View>
  );
}

const styles = StyleSheet.create({
  card: {
    backgroundColor: colors.card,
    borderRadius: 26,
    padding: 14,
    gap: 12,
  },
  trackRow: { flexDirection: 'row', alignItems: 'center', gap: 12 },
  left: { alignItems: 'flex-end', gap: 2 },
  transport: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  next: {
    flex: 1,
    minWidth: 0,
    height: 48,
    borderRadius: 14,
    backgroundColor: colors.bg,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    paddingHorizontal: 12,
  },
  count: {
    backgroundColor: colors.muted,
    borderRadius: 6,
    paddingHorizontal: 6,
    paddingVertical: 2,
  },
  skip: {
    width: 48,
    height: 48,
    borderRadius: 14,
    backgroundColor: colors.bg,
    alignItems: 'center',
    justifyContent: 'center',
  },
  play: {
    width: 64,
    height: 48,
    borderRadius: 14,
    backgroundColor: colors.text,
    alignItems: 'center',
    justifyContent: 'center',
  },
  pad: {
    flex: 1,
    minHeight: 190,
    borderRadius: 30,
    padding: 20,
    justifyContent: 'space-between',
  },
  padTop: { flexDirection: 'row', alignItems: 'flex-start', gap: 12 },
  focus: {
    height: 44,
    paddingHorizontal: 14,
    borderRadius: 14,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  meter: { flexDirection: 'row', gap: 3, height: 26 },
  seg: { flex: 1, borderRadius: 2 },
  scale: { height: 14 },
  tick: { position: 'absolute', top: 0 },
  controls: { flexDirection: 'row', gap: 8 },
  latch: {
    flex: 1,
    height: 52,
    borderRadius: 16,
    backgroundColor: colors.card,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    paddingHorizontal: 14,
  },
  monitor: {
    height: 52,
    borderRadius: 16,
    paddingHorizontal: 14,
    alignItems: 'center',
    justifyContent: 'center',
    gap: 2,
  },
  settings: {
    width: 52,
    height: 52,
    borderRadius: 16,
    backgroundColor: colors.card,
    alignItems: 'center',
    justifyContent: 'center',
  },
});
