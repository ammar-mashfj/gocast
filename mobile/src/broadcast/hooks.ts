import { useEffect, useState, useSyncExternalStore } from 'react';

import type { AudioEngine } from '../audio/engine';
import { api } from '../lib/api';
import { useBroadcast } from './BroadcastContext';
import type { TransportStats } from './broadcastManager';

const noopSubscribe = () => () => {};
const zero = () => 0;

/** Re-render on every engine state change (queue, transport, mic). */
export function useEngineVersion(engine: AudioEngine | null): number {
  return useSyncExternalStore(engine?.subscribe ?? noopSubscribe, engine?.getVersion ?? zero);
}

/**
 * Read one piece of engine state so it stays current. Use this instead of
 * calling `engine.isX()` in render: the React Compiler caches such a call
 * against `engine`, which never changes, so the value freezes at the first
 * render however often `useEngineVersion` re-renders. `read` must return a
 * primitive or an object the engine replaces on change (e.g. getMicPrefs).
 */
export function useEngineValue<T>(engine: AudioEngine, read: (engine: AudioEngine) => T): T;
export function useEngineValue<T>(engine: AudioEngine | null, read: (engine: AudioEngine) => T, fallback: T): T;
export function useEngineValue<T>(engine: AudioEngine | null, read: (engine: AudioEngine) => T, fallback?: T): T {
  return useSyncExternalStore(engine?.subscribe ?? noopSubscribe, () => (engine ? read(engine) : (fallback as T)));
}

// ── Transport health: the web's signal.ts, same constants ──

const HEALTH_POLL_MS = 2000;
const RECENT_DROP_MS = 5000;

export interface TransportHealth {
  stats: TransportStats | null;
  droppingNow: boolean;
}

export function useTransportHealth(enabled: boolean): TransportHealth {
  const { getTransportStats } = useBroadcast();
  const [health, setHealth] = useState<TransportHealth>({ stats: null, droppingNow: false });

  useEffect(() => {
    if (!enabled) return;
    const tick = () => {
      const sample = getTransportStats();
      setHealth({
        stats: sample,
        droppingNow: !!sample && sample.lastDropAt > 0 && Date.now() - sample.lastDropAt < RECENT_DROP_MS,
      });
    };
    tick();
    const timer = setInterval(tick, HEALTH_POLL_MS);
    return () => clearInterval(timer);
  }, [enabled, getTransportStats]);

  return health;
}

// ── The studio lamp: one answer to "is it working?" ──

export type SignalCode = 'live' | 'mic' | 'reconnecting' | 'not-sending' | 'silence' | 'dropping';

export interface StudioSignal {
  code: SignalCode;
  tone: 'live' | 'mic' | 'fault';
  label: string;
  detail: string;
}

const SILENCE_GRACE_MS = 4000;

/**
 * Port of the web's useStudioSignal. The wording is the touch variant, with
 * one change the whole app exists for: locking the phone no longer ends the
 * broadcast, so the live line says so instead of warning against it.
 */
export function useStudioSignal(transport: TransportHealth | null): StudioSignal | null {
  const { state, engine, micDisabled } = useBroadcast();
  const engineState = {
    micActive: useEngineValue(engine, (e) => e.isMicActive(), false),
    micLatched: useEngineValue(engine, (e) => e.isMicLatched(), false),
    playing: useEngineValue(engine, (e) => e.isPlaying(), false),
  };
  const raw = computeSignal(state, engineState, micDisabled, transport);
  const silent = raw?.code === 'silence';
  const [silenceConfirmed, setSilenceConfirmed] = useState(false);

  useEffect(() => {
    if (!silent) {
      // eslint-disable-next-line react-hooks/set-state-in-effect -- resets the grace timer, as on the web
      setSilenceConfirmed(false);
      return;
    }
    const t = setTimeout(() => setSilenceConfirmed(true), SILENCE_GRACE_MS);
    return () => clearTimeout(t);
  }, [silent]);

  if (silent && !silenceConfirmed) return LIVE_SIGNAL;
  return raw;
}

const LIVE_SIGNAL: StudioSignal = {
  code: 'live',
  tone: 'live',
  label: 'Live',
  detail: 'Listeners hear you about 15–20 seconds after you speak. You can lock the phone or switch apps.',
};

function computeSignal(
  state: ReturnType<typeof useBroadcast>['state'],
  engine: { micActive: boolean; micLatched: boolean; playing: boolean },
  micDisabled: boolean,
  transport: TransportHealth | null,
): StudioSignal | null {
  if (state !== 'live' && state !== 'reconnecting') return null;

  const lostSeconds = transport?.stats ? transport.stats.droppedMs / 1000 : 0;
  const micOpen = !micDisabled && engine.micActive;
  const playing = engine.playing;

  if (state === 'reconnecting') {
    return {
      code: 'reconnecting',
      tone: 'fault',
      label: 'Reconnecting',
      detail: 'Nothing is reaching listeners. It reconnects on its own.',
    };
  }
  if (transport?.stats && !transport.stats.connected) {
    return {
      code: 'not-sending',
      tone: 'fault',
      label: 'Not sending',
      detail: 'This phone has stopped sending audio. Listeners hear silence until it reconnects.',
    };
  }
  if (!micOpen && !playing) {
    return {
      code: 'silence',
      tone: 'fault',
      label: 'Silence',
      detail: micDisabled
        ? 'Nothing is playing. Listeners are connected and hearing nothing — tap play.'
        : 'Nothing is playing and your mic is closed. Tap play, or press and hold the talk button.',
    };
  }
  if (transport?.droppingNow) {
    return {
      code: 'dropping',
      tone: 'fault',
      label: 'Dropping audio',
      detail: `Your connection is losing audio — ${lostSeconds.toFixed(1)}s lost so far. Pause other uploads if you can.`,
    };
  }
  if (micOpen) {
    return {
      code: 'mic',
      tone: 'mic',
      label: 'Mic open',
      detail: engine.micLatched
        ? 'Your voice is going out live and the mic stays on. Tap Mic off to close it.'
        : 'Your voice is going out live. The music dips underneath you.',
    };
  }
  return LIVE_SIGNAL;
}

// ── Listeners ──

const LISTENERS_POLL_MS = 10_000;

/** Concurrent listeners from the public endpoint; null until known, never a guessed 0. */
export function useListeners(slug: string | null): number | null {
  const [count, setCount] = useState<number | null>(null);
  useEffect(() => {
    if (!slug) return;
    let active = true;
    const tick = () =>
      api<{ data?: { count?: unknown } }>(`/public/stations/${slug}/listeners`)
        .then((body) => {
          if (active && typeof body.data?.count === 'number') setCount(body.data.count);
        })
        .catch(() => {});
    tick();
    const timer = setInterval(tick, LISTENERS_POLL_MS);
    return () => {
      active = false;
      clearInterval(timer);
    };
  }, [slug]);
  return slug ? count : null;
}

// ── Clock ──

/** Re-renders every `ms` and returns the current time. */
export function useNow(ms = 1000): number {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    const id = setInterval(() => setNow(Date.now()), ms);
    return () => clearInterval(id);
  }, [ms]);
  return now;
}

export function formatClock(seconds: number): string {
  const s = Math.max(0, Math.floor(seconds));
  const h = Math.floor(s / 3600);
  const m = Math.floor((s % 3600) / 60);
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${pad(h)}:${pad(m)}:${pad(s % 60)}`;
}

export function formatTrackTime(seconds: number): string {
  if (!Number.isFinite(seconds) || seconds <= 0) return '0:00';
  const s = Math.floor(seconds);
  const h = Math.floor(s / 3600);
  const m = Math.floor((s % 3600) / 60);
  const ss = String(s % 60).padStart(2, '0');
  return h > 0 ? `${h}:${String(m).padStart(2, '0')}:${ss}` : `${m}:${ss}`;
}
