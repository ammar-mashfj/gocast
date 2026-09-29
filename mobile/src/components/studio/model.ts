import { useEffect, useRef, useState } from 'react';
import { AccessibilityInfo } from 'react-native';
import { Gesture } from 'react-native-gesture-handler';

import type { AudioEngine } from '../../audio/engine';
import type { EngineSnapshot, StudioSignal } from '../../broadcast/hooks';
import { colors } from '../../lib/theme';

/** How far behind listeners hear the studio, end to end (harbor + HLS). */
export const DELAY_NOTE = 'Listeners hear you ~15–20 s late. Safe to lock the phone.';

export interface Lamp {
  label: string;
  /** The chip's fill. */
  color: string;
  /** The band behind the chip. */
  band: string;
  /** The band's message colour. */
  ink: string;
  msg: string;
  /** Faults pulse and announce; healthy states sit still. */
  fault: boolean;
}

/**
 * The studio lamp in the comp's three looks: coral while live, a deeper
 * coral band while the mic is open, amber whenever nothing (or not all of
 * it) is reaching listeners.
 */
export function lampFor(signal: StudioSignal, snap: EngineSnapshot, micDisabled: boolean): Lamp {
  const warn = (label: string, msg: string): Lamp => ({
    label,
    color: colors.pro,
    band: colors.proBand,
    ink: colors.proText,
    msg,
    fault: true,
  });
  switch (signal.code) {
    case 'mic':
      return {
        label: 'LIVE · MIC',
        color: colors.live,
        band: colors.liveBand,
        ink: colors.livePale,
        msg: snap.micLatched
          ? 'Mic stays open. Switch off “Keep mic open” to close.'
          : 'You’re talking. Music dips under you. Let go to close.',
        fault: false,
      };
    case 'live':
      return {
        label: 'LIVE',
        color: colors.live,
        band: colors.liveDim,
        ink: colors.muted,
        msg: DELAY_NOTE,
        fault: false,
      };
    case 'silence':
      return warn(
        'SILENCE',
        micDisabled
          ? snap.queue.length
            ? 'Nothing is going out. Press play.'
            : 'Nothing is going out. Add music to play.'
          : snap.queue.length
            ? 'Nothing is going out. Press play or hold to talk.'
            : 'Nothing is going out. Add music or hold to talk.',
      );
    case 'reconnecting':
      return warn('RECONNECTING', signal.detail);
    case 'not-sending':
      return warn('NOT SENDING', signal.detail);
    case 'dropping':
      return warn('DROPPING AUDIO', signal.detail);
  }
}

/** What plays after the current track, in the running order's own words. */
export function upNextOf(snap: EngineSnapshot): {
  text: string;
  title: string | null;
} {
  const { queue, currentIndex, repeatMode } = snap;
  if (queue.length === 0) return { text: 'Add music', title: null };
  if (repeatMode === 'one') return { text: 'Holding this track', title: null };
  if (queue.length === 1) return { text: 'Looping this track', title: null };
  const next = queue[(currentIndex + 1) % queue.length]!;
  const label = [next.title, next.artist].filter(Boolean).join(' — ');
  return {
    text: currentIndex + 1 >= queue.length ? `${label} (from the top)` : label,
    title: next.title,
  };
}

/** Tracks still to come after the current one. */
export function upcomingCount(snap: EngineSnapshot): number {
  return Math.max(0, snap.queue.length - Math.max(0, snap.currentIndex) - 1);
}

// ── Track clock ──

const CLOCK_MS = 250;
const CUES_S = [20, 10];

/**
 * Seconds into the current track, refreshed four times a second, and the
 * talk-up cues: `cue` changes when 20 s and 10 s remain, so the time can
 * pulse and a screen reader hears it.
 */
export function useTrackClock(engine: AudioEngine, duration: number) {
  const [elapsed, setElapsed] = useState(0);
  const [cue, setCue] = useState(0);
  const prevLeft = useRef<number | null>(null);

  useEffect(() => {
    const tick = () => {
      const e = engine.getElapsed();
      setElapsed(e);
      const left = Math.max(0, duration - e);
      const before = prevLeft.current;
      prevLeft.current = duration > 0 ? left : null;
      if (before === null || duration <= 0) return;
      const hit = CUES_S.find((t) => before > t && left <= t && before - left < 1);
      if (hit === undefined) return;
      AccessibilityInfo.announceForAccessibility(`${hit} seconds left on this track`);
      setCue((c) => c + 1);
    };
    tick();
    const id = setInterval(tick, CLOCK_MS);
    return () => clearInterval(id);
  }, [engine, duration]);

  return { elapsed: Math.min(elapsed, duration || elapsed), cue };
}

// ── Mic level: the web's MicMeter ballistics ──

export const FLOOR_DB = -60;
const RELEASE_DB_S = 24;
const METER_MS = 50;

/** The mic's level as 0–1 over −60…0 dB: instant attack, steady release. */
export function useMicLevel(engine: AudioEngine, enabled: boolean): number {
  const [level, setLevel] = useState(0);
  const state = useRef({ db: FLOOR_DB, last: 0 });

  useEffect(() => {
    if (!enabled) {
      // eslint-disable-next-line react-hooks/set-state-in-effect -- the meter goes dark with the mic
      setLevel(0);
      return;
    }
    const s = state.current;
    s.last = Date.now();
    const id = setInterval(() => {
      const now = Date.now();
      const dt = (now - s.last) / 1000;
      s.last = now;
      const raw = engine.readMicPeakDb();
      const db = raw === null || !Number.isFinite(raw) ? FLOOR_DB : Math.max(FLOOR_DB, Math.min(0, raw));
      s.db = db >= s.db ? db : Math.max(db, s.db - RELEASE_DB_S * dt);
      setLevel((s.db - FLOOR_DB) / -FLOOR_DB);
    }, METER_MS);
    return () => clearInterval(id);
  }, [engine, enabled]);

  return level;
}

// ── Hold to talk ──

/** How long a finger must stay down before the mic opens. A brush or a tap never opens it. */
export const HOLD_MS = 300;
/**
 * How far the finger may wander during that wait, in points. Once the mic
 * is open, movement no longer matters; only lifting the finger closes it.
 */
const HOLD_SLOP = 48;

/**
 * Press-and-hold for the talk pad and the Focus button, on gesture
 * handler's LongPress (Pressable's long press gives up after ~10 pt of
 * movement and can't be told otherwise). `arming` is true while the finger
 * is down but the hold hasn't completed. With the mic latched open, a tap
 * closes it instead.
 */
export function useHoldToTalk(engine: AudioEngine, latched: boolean, disabled: boolean) {
  const [arming, setArming] = useState(false);
  const [holding, setHolding] = useState(false);

  // Leaving the screen mid-hold must not leave the mic open. pttUp is a
  // no-op unless a hold opened the mic (it ignores a latched mic too).
  useEffect(() => () => engine.pttUp(), [engine]);

  const hold = Gesture.LongPress()
    .enabled(!disabled && !latched)
    .minDuration(HOLD_MS)
    .maxDistance(HOLD_SLOP)
    .shouldCancelWhenOutside(false)
    .runOnJS(true)
    .onBegin(() => setArming(true))
    .onStart(() => {
      setArming(false);
      setHolding(true);
      engine.pttDown();
    })
    .onFinalize(() => {
      setArming(false);
      setHolding(false);
      engine.pttUp();
    });

  const tapToClose = Gesture.Tap()
    .enabled(!disabled && latched)
    .runOnJS(true)
    .onEnd((_event, success) => {
      if (success) engine.setMicLatched(false);
    });

  return { holding, arming, gesture: Gesture.Exclusive(hold, tapToClose) };
}

export function mmss(seconds: number): string {
  if (!Number.isFinite(seconds) || seconds <= 0) return '0:00';
  const s = Math.floor(seconds);
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`;
}
