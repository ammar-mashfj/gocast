import {
  IconPlayerPauseFilled,
  IconPlayerPlayFilled,
  IconPlayerSkipBackFilled,
  IconPlayerSkipForwardFilled,
} from '@tabler/icons-react-native';
import { useEffect, useMemo, useRef, useState } from 'react';
import { AccessibilityInfo, Animated, Pressable, StyleSheet, View } from 'react-native';
import Svg, { Circle, Path } from 'react-native-svg';

import type { AudioEngine } from '../../audio/engine';
import { formatTrackTime, useEngineVersion } from '../../broadcast/hooks';
import { alpha, colors, fonts, panelShadow, radius } from '../../lib/theme';
import { Panel, T } from '../ui';

/**
 * The on-air deck, from the web's OnAirDeck and TrackDial: a ring that drains
 * around the time left on the track, the title, a progress row, one status
 * line, and the transport. Talk-up cues pulse the dial at 20s and 10s left.
 */

const ENDING_SOON_S = 20;
const CUES_S = [20, 10];
/** Deck refresh while playing. The dial moves a few pixels a second at most. */
const FRAME_MS = 250;
const DIAL = 116;

function formatRemaining(seconds: number): string {
  const total = Math.max(0, Math.round(seconds));
  const h = Math.floor(total / 3600);
  const m = Math.round((total % 3600) / 60);
  if (h > 0) return m > 0 ? `${h}h ${m}m` : `${h}h`;
  if (m > 0) return `${m}m`;
  return 'under a minute';
}

function arcPath(size: number, width: number, frac: number): string {
  const c = size / 2;
  const r = c - width / 2 - 1;
  const angle = frac * Math.PI * 2;
  const x = c + r * Math.sin(angle);
  const y = c - r * Math.cos(angle);
  const large = frac > 0.5 ? 1 : 0;
  return `M ${c} ${c - r} A ${r} ${r} 0 ${large} 1 ${x} ${y}`;
}

export function Deck({ engine, micDisabled }: { engine: AudioEngine; micDisabled: boolean }) {
  const version = useEngineVersion(engine);
  const track = engine.getCurrentTrack();
  const playing = engine.isPlaying();
  const micActive = !micDisabled && engine.isMicActive();
  const queue = engine.getQueue();
  const currentIndex = engine.getCurrentIndex();
  const repeatMode = engine.getRepeatMode();

  const [elapsed, setElapsed] = useState(0);
  const [pulse] = useState(() => new Animated.Value(1));
  const prevLeft = useRef<number | null>(null);

  const nextTrack =
    repeatMode === 'all' && queue.length > 1 && currentIndex >= 0 ? queue[(currentIndex + 1) % queue.length] : null;
  const restSeconds = useMemo(
    () => (currentIndex < 0 ? 0 : queue.slice(currentIndex + 1).reduce((sum, t) => sum + t.duration, 0)),
    // eslint-disable-next-line react-hooks/exhaustive-deps -- the queue is mutated in place; version marks changes
    [queue, currentIndex, version],
  );

  useEffect(() => {
    const tick = () => {
      const e = engine.getElapsed();
      setElapsed(e);
      const duration = engine.getCurrentTrack()?.duration ?? 0;
      const left = Math.max(0, duration - e);
      const before = prevLeft.current;
      prevLeft.current = duration > 0 ? left : null;
      if (before === null || duration <= 0) return;
      const cue = CUES_S.find((t) => before > t && left <= t && before - left < 1);
      if (cue === undefined) return;
      AccessibilityInfo.announceForAccessibility(`${cue} seconds left on this track`);
      Animated.sequence([
        Animated.timing(pulse, { toValue: 1.06, duration: 160, useNativeDriver: true }),
        Animated.timing(pulse, { toValue: 1, duration: 360, useNativeDriver: true }),
      ]).start();
    };
    tick();
    const id = setInterval(tick, FRAME_MS);
    return () => clearInterval(id);
  }, [engine, pulse]);

  const duration = track?.duration ?? 0;
  const left = Math.max(0, duration - elapsed);
  const soon = duration > 0 && left <= ENDING_SOON_S;
  const frac = duration > 0 ? left / duration : 0;
  const w = 6;

  return (
    <Panel style={styles.deck}>
      <View style={styles.row}>
        <Animated.View style={{ transform: [{ scale: pulse }] }}>
          <View style={{ width: DIAL, height: DIAL }}>
            <Svg width={DIAL} height={DIAL}>
              <Circle
                cx={DIAL / 2}
                cy={DIAL / 2}
                r={DIAL / 2 - w / 2 - 1}
                stroke={alpha('#ffffff', 0.07)}
                strokeWidth={w}
                fill="none"
              />
              {frac > 0.002 && (
                <Path
                  d={frac >= 0.999 ? arcPath(DIAL, w, 0.9999) : arcPath(DIAL, w, frac)}
                  stroke={soon ? '#ffffff' : alpha('#ffffff', 0.8)}
                  strokeWidth={w}
                  strokeLinecap="round"
                  fill="none"
                />
              )}
            </Svg>
            <View style={styles.dialCenter}>
              <T style={styles.clock}>{duration > 0 ? `−${formatTrackTime(left)}` : '−:––'}</T>
              <T size={11} tone={soon ? 'text' : 'muted'} weight={soon ? 'semibold' : 'regular'}>
                {soon ? 'get ready' : 'left'}
              </T>
            </View>
          </View>
        </Animated.View>

        <View style={styles.info}>
          <T size={18} weight="semibold" numberOfLines={2} style={{ letterSpacing: -0.3, lineHeight: 22 }}>
            {track?.title ?? 'Nothing queued'}
          </T>
          <T tone="muted" size={13} numberOfLines={1} style={{ minHeight: 18 }}>
            {track ? track.artist : 'Add music below to start playing'}
          </T>
        </View>
      </View>

      {track && (
        <View style={styles.progress}>
          <T mono tone="muted" size={12} style={styles.time}>
            {formatTrackTime(elapsed)}
          </T>
          <View style={styles.bar}>
            <View
              style={[
                styles.barFill,
                {
                  width: `${duration > 0 ? Math.min(100, (elapsed / duration) * 100) : 0}%`,
                  opacity: micActive ? 0.35 : 1,
                },
              ]}
            />
          </View>
          <T mono tone="muted" size={12} style={[styles.time, { textAlign: 'right' }]}>
            {formatTrackTime(duration)}
          </T>
        </View>
      )}

      <T size={12} tone={micActive ? 'mic' : 'muted'}>
        {micActive ? (
          'Music dipped while you talk'
        ) : queue.length === 0 ? (
          'Nothing queued'
        ) : currentIndex < 0 ? (
          'Queue loaded — nothing playing yet'
        ) : (
          <>
            {repeatMode === 'one' ? (
              'Holding this track'
            ) : nextTrack ? (
              <>
                Then <T size={12}>{nextTrack.title}</T>
              </>
            ) : (
              'Looping this track'
            )}
            {' · '}
            <T size={12}>{formatRemaining(repeatMode === 'one' ? left : restSeconds + left)}</T>{' '}
            {nextTrack ? 'until the queue loops' : 'until it restarts'}
          </>
        )}
      </T>

      <View style={styles.transport}>
        <TransportButton label="Previous track" disabled={queue.length === 0} onPress={() => engine.prev()}>
          <IconPlayerSkipBackFilled size={20} color={colors.text} />
        </TransportButton>
        <Pressable
          accessibilityLabel={playing ? 'Pause' : 'Play'}
          disabled={queue.length === 0}
          onPress={() => engine.togglePlay()}
          style={({ pressed }) => [
            styles.play,
            queue.length === 0 && { opacity: 0.45 },
            pressed && { opacity: 0.8, transform: [{ translateY: 1 }] },
          ]}
        >
          {playing ? <IconPlayerPauseFilled size={24} color="#fff" /> : <IconPlayerPlayFilled size={24} color="#fff" />}
        </Pressable>
        <TransportButton label="Next track" disabled={queue.length === 0} onPress={() => engine.next()}>
          <IconPlayerSkipForwardFilled size={20} color={colors.text} />
        </TransportButton>
      </View>
    </Panel>
  );
}

function TransportButton({
  label,
  disabled,
  onPress,
  children,
}: {
  label: string;
  disabled: boolean;
  onPress: () => void;
  children: React.ReactNode;
}) {
  return (
    <Pressable
      accessibilityLabel={label}
      disabled={disabled}
      onPress={onPress}
      style={({ pressed }) => [styles.outlineIcon, disabled && { opacity: 0.45 }, pressed && { opacity: 0.8 }]}
    >
      {children}
    </Pressable>
  );
}

const styles = StyleSheet.create({
  deck: { padding: 16, gap: 14 },
  row: { flexDirection: 'row', alignItems: 'center', gap: 16 },
  dialCenter: { ...StyleSheet.absoluteFill, alignItems: 'center', justifyContent: 'center' },
  clock: {
    fontFamily: fonts.monoMedium,
    fontSize: 20,
    color: colors.text,
    letterSpacing: -0.5,
    fontVariant: ['tabular-nums'],
  },
  info: { flex: 1, minWidth: 0, gap: 4 },
  progress: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  time: { width: 44 },
  bar: { flex: 1, height: 6, borderRadius: 3, backgroundColor: alpha('#ffffff', 0.07), overflow: 'hidden' },
  barFill: { height: '100%', borderRadius: 3, backgroundColor: alpha('#ffffff', 0.8) },
  transport: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 16 },
  outlineIcon: {
    width: 44,
    height: 44,
    borderRadius: radius.md,
    borderWidth: 1,
    borderColor: colors.inputLine,
    backgroundColor: alpha('#ffffff', 0.04),
    alignItems: 'center',
    justifyContent: 'center',
  },
  play: {
    width: 56,
    height: 56,
    borderRadius: 28,
    backgroundColor: colors.violetFill,
    alignItems: 'center',
    justifyContent: 'center',
    ...panelShadow,
    shadowOpacity: 0.8,
    shadowRadius: 9,
    shadowOffset: { width: 0, height: 8 },
  },
});
