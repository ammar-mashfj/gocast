import { createContext, useContext, useEffect, useSyncExternalStore, type ReactNode } from 'react';

import type { AudioEngine } from '../audio/engine';
import { api, ApiError } from '../lib/api';
import { useAuth, useAutoDjLocked } from '../lib/auth';
import {
  BroadcastManager,
  type BroadcastStartOptions,
  type BroadcastState,
  type BroadcastStepInfo,
  type TransportStats,
} from './broadcastManager';

/**
 * App-wide owner of the broadcast, ported from the web's BroadcastContext
 * (client/contexts/BroadcastContext.tsx). It sits above the navigator, so
 * leaving the studio screen does not end the show.
 */

/** See releaseStation in the web context: waits out harbor's disconnect callback. */
const RELEASE_RETRY_DELAYS_MS = [0, 400, 800, 1500, 2500];

async function releaseStation(slug: string): Promise<void> {
  for (const delay of RELEASE_RETRY_DELAYS_MS) {
    if (delay > 0) await new Promise((resolve) => setTimeout(resolve, delay));
    try {
      await api(`/stations/${slug}/stop`, { method: 'POST' });
      return;
    } catch (err) {
      if (!(err instanceof ApiError) || err.status !== 409) return;
    }
  }
}

interface BroadcastContextValue {
  state: BroadcastState;
  stationSlug: string | null;
  stationName: string | null;
  steps: BroadcastStepInfo[];
  error: string | null;
  micDisabled: boolean;
  engine: AudioEngine | null;
  liveSince: number | null;
  /** This show so far: listeners now (null until known), the most at once, tracks started. */
  session: SessionStats;
  getTransportStats: () => TransportStats | null;
  start: (slug: string, name: string, options?: BroadcastStartOptions) => Promise<void>;
  stop: (options?: { releaseStation?: boolean }) => Promise<void>;
}

export interface SessionStats {
  listeners: number | null;
  peakListeners: number;
  tracksPlayed: number;
}

const EMPTY_SESSION: SessionStats = { listeners: null, peakListeners: 0, tracksPlayed: 0 };
const LISTENERS_POLL_MS = 10_000;

const BroadcastContext = createContext<BroadcastContextValue | null>(null);

/**
 * The show lives here, at module scope, not in the provider. Swiping the app
 * out of recents destroys the activity and unmounts the whole React tree, but
 * the foreground service keeps the process and its JS runtime alive, so the
 * broadcast carries on. When the app is opened again a fresh provider mounts
 * in that same runtime; held in React state, the running show would be
 * orphaned (still on air, with nothing on screen able to stop it), so the
 * provider reads it from here instead.
 */
interface BroadcastSnapshot {
  state: BroadcastState;
  steps: BroadcastStepInfo[];
  error: string | null;
  engine: AudioEngine | null;
  micDisabled: boolean;
  stationSlug: string | null;
  stationName: string | null;
  liveSince: number | null;
  session: SessionStats;
}

const IDLE: BroadcastSnapshot = {
  state: 'idle',
  steps: [],
  error: null,
  engine: null,
  micDisabled: false,
  stationSlug: null,
  stationName: null,
  liveSince: null,
  session: EMPTY_SESSION,
};

let snapshot = IDLE;
const subscribers = new Set<() => void>();
let manager: BroadcastManager | null = null;
// A second start racing the first would open two sockets, and harbor
// refuses the second with Mount_taken — see the web context. The start in
// flight, so a second call can wait for it instead of dropping out.
let starting: Promise<void> | null = null;
/** The track last counted for the wrap-up, kept here so a remount does not count it again. */
let lastCountedTrackId: string | null = null;
/**
 * Whether ending the show also turns the station off, as the studio's End
 * does: only without AutoDJ; with it, AutoDJ takes back over. Mirrored from
 * the provider so the notification's End show works with no screen mounted
 * (after a swipe out of recents it keeps the last known plan).
 */
let autoDjLocked = false;

function patch(update: Partial<BroadcastSnapshot> | ((s: BroadcastSnapshot) => Partial<BroadcastSnapshot>)) {
  snapshot = { ...snapshot, ...(typeof update === 'function' ? update(snapshot) : update) };
  subscribers.forEach((fn) => fn());
}

function subscribe(fn: () => void) {
  subscribers.add(fn);
  return () => {
    subscribers.delete(fn);
  };
}

const getSnapshot = () => snapshot;

async function start(slug: string, name: string, options?: BroadcastStartOptions) {
  // Wait out a start still unwinding rather than returning at once: Cancel
  // during the countdown, then a quick Go live, arrives while the cancelled
  // start is still tearing down, and a start that silently did nothing left
  // the screen on CONNECTING with no show behind it. Once it has settled, a
  // show still running means this was a double tap, and there is nothing to
  // do; none (Cancel got in first) means this is a fresh start.
  if (starting) {
    while (starting) await starting.catch(() => {});
    if (manager) return;
  }
  const run = (async () => {
    if (manager) {
      try {
        await manager.stop();
      } catch {}
    }
    lastCountedTrackId = null;
    const next: BroadcastManager = new BroadcastManager(slug, name, {
      onStepChange: (steps) => {
        if (manager === next) patch({ steps });
      },
      onStateChange: (s) => {
        if (manager !== next) return;
        if (s === 'live') {
          patch((prev) => ({ state: s, liveSince: prev.liveSince ?? Date.now(), engine: next.getEngine() }));
        } else if (s === 'idle') {
          patch({ state: s, engine: null, liveSince: null });
        } else if (s === 'error') {
          patch({ state: s, engine: null });
        } else {
          patch({ state: s });
        }
      },
      onError: (message) => patch({ error: message || null }),
      onNotificationStop: () => {
        if (manager === next) void stop({ releaseStation: autoDjLocked });
      },
    });
    manager = next;
    patch({
      error: null,
      liveSince: null,
      session: EMPTY_SESSION,
      stationSlug: slug,
      stationName: name,
      micDisabled: !!options?.skipMic,
    });
    await next.start(options);
  })();
  starting = run;
  try {
    await run;
  } finally {
    starting = null;
  }
}

async function stop(options?: { releaseStation?: boolean }) {
  const slug = snapshot.stationSlug;
  const current = manager;
  manager = null;
  if (current) await current.stop();
  patch(IDLE);
  if (options?.releaseStation && slug) await releaseStation(slug);
}

const getTransportStats = () => manager?.getTransportStats() ?? null;

export function BroadcastProvider({ children }: { children: ReactNode }) {
  const { state, steps, error, engine, micDisabled, stationSlug, stationName, liveSince, session } =
    useSyncExternalStore(subscribe, getSnapshot);

  // Listeners for the show's lamp, toasts and wrap-up, polled here rather
  // than in the studio so the count and peak survive leaving the screen.
  const onAir = state === 'live' || state === 'reconnecting';
  useEffect(() => {
    if (!onAir || !stationSlug) return;
    let active = true;
    const tick = () =>
      api<{ data?: { count?: unknown } }>(`/public/stations/${stationSlug}/listeners`)
        .then((body) => {
          const count = body.data?.count;
          if (!active || typeof count !== 'number') return;
          patch((prev) => ({
            session: { ...prev.session, listeners: count, peakListeners: Math.max(prev.session.peakListeners, count) },
          }));
        })
        .catch(() => {});
    tick();
    const timer = setInterval(tick, LISTENERS_POLL_MS);
    return () => {
      active = false;
      clearInterval(timer);
    };
  }, [onAir, stationSlug]);

  // Count each track that starts playing, for the wrap-up screen.
  useEffect(() => {
    if (!engine) return;
    const check = () => {
      const track = engine.getCurrentTrack();
      if (!track || !engine.isPlaying() || track.id === lastCountedTrackId) return;
      lastCountedTrackId = track.id;
      patch((prev) => ({ session: { ...prev.session, tracksPlayed: prev.session.tracksPlayed + 1 } }));
    };
    check();
    return engine.subscribe(check);
  }, [engine]);

  // Signed out underneath a show (the API rejected the token): the studio
  // screens are gone, so end the broadcast rather than leave it on air with
  // nothing on screen to stop it. No release call, since the token is dead;
  // the station then behaves as when a studio closes (stations:sweep).
  const { state: auth } = useAuth();
  const locked = useAutoDjLocked();
  useEffect(() => {
    autoDjLocked = locked;
  }, [locked]);
  useEffect(() => {
    if (auth.status === 'signedOut' && manager) void stop();
  }, [auth.status]);

  return (
    <BroadcastContext.Provider
      value={{
        state,
        stationSlug,
        stationName,
        steps,
        error,
        micDisabled,
        engine,
        liveSince,
        session,
        getTransportStats,
        start,
        stop,
      }}
    >
      {children}
    </BroadcastContext.Provider>
  );
}

export function useBroadcast(): BroadcastContextValue {
  const ctx = useContext(BroadcastContext);
  if (!ctx) throw new Error('useBroadcast must be used within BroadcastProvider');
  return ctx;
}
