import { createContext, useCallback, useContext, useRef, useState, type ReactNode } from 'react';

import type { AudioEngine } from '../audio/engine';
import { api, ApiError } from '../lib/api';
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
  getTransportStats: () => TransportStats | null;
  start: (slug: string, name: string, options?: BroadcastStartOptions) => Promise<void>;
  stop: (options?: { releaseStation?: boolean }) => Promise<void>;
}

const BroadcastContext = createContext<BroadcastContextValue | null>(null);

export function BroadcastProvider({ children }: { children: ReactNode }) {
  const [state, setState] = useState<BroadcastState>('idle');
  const [steps, setSteps] = useState<BroadcastStepInfo[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [engine, setEngine] = useState<AudioEngine | null>(null);
  const [micDisabled, setMicDisabled] = useState(false);
  const [stationSlug, setStationSlug] = useState<string | null>(null);
  const [stationName, setStationName] = useState<string | null>(null);
  const [liveSince, setLiveSince] = useState<number | null>(null);
  const managerRef = useRef<BroadcastManager | null>(null);
  const slugRef = useRef<string | null>(null);
  // A second start racing the first would open two sockets, and harbor
  // refuses the second with Mount_taken — see the web context.
  const startingRef = useRef(false);

  const start = useCallback(async (slug: string, name: string, options?: BroadcastStartOptions) => {
    if (startingRef.current) return;
    startingRef.current = true;
    try {
      if (managerRef.current) {
        try {
          await managerRef.current.stop();
        } catch {}
      }
      setError(null);
      setLiveSince(null);
      const manager = new BroadcastManager(slug, name, {
        onStepChange: setSteps,
        onStateChange: (s) => {
          setState(s);
          if (s === 'live') {
            setLiveSince((prev) => prev ?? Date.now());
            setEngine(manager.getEngine());
          } else if (s === 'idle' || s === 'error') {
            setEngine(null);
            if (s === 'idle') setLiveSince(null);
          }
        },
        onError: (message) => setError(message || null),
      });
      managerRef.current = manager;
      slugRef.current = slug;
      setStationSlug(slug);
      setStationName(name);
      setMicDisabled(!!options?.skipMic);
      await manager.start(options);
    } finally {
      startingRef.current = false;
    }
  }, []);

  const getTransportStats = useCallback(() => managerRef.current?.getTransportStats() ?? null, []);

  const stop = useCallback(async (options?: { releaseStation?: boolean }) => {
    const slug = slugRef.current;
    if (managerRef.current) {
      await managerRef.current.stop();
      managerRef.current = null;
    }
    slugRef.current = null;
    setStationSlug(null);
    setStationName(null);
    setLiveSince(null);
    setMicDisabled(false);
    setEngine(null);
    setSteps([]);
    setError(null);
    setState('idle');
    if (options?.releaseStation && slug) await releaseStation(slug);
  }, []);

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
