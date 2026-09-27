import { useFocusEffect } from 'expo-router';
import { createContext, useCallback, useContext, useEffect, useRef, useState } from 'react';
import { AppState } from 'react-native';

import { api } from './api';

// ── API shapes: the web's client/interfaces/*, from the Laravel resources ──

export interface NowPlaying {
  title: string | null;
  artist: string | null;
}

export interface StationSchedule {
  id: string;
  label: string | null;
  /** 0 = Sunday. */
  days: number[];
  /** "HH:mm" in the station's timezone. */
  start_time: string;
  next_occurrence: string | null;
}

export interface AutodjSlot {
  id: string;
  playlist_id: string;
  label: string | null;
  days: number[];
  start_time: string;
  /** At or before start_time means the slot runs past midnight. */
  end_time: string;
  position: number;
}

export interface Station {
  id: string;
  name: string;
  slug: string;
  description: string | null;
  genre: string | null;
  timezone: string | null;
  artwork_url: string | null;
  is_live: boolean;
  is_on_air: boolean;
  desired_state: 'stopped' | 'running';
  started_at: string | null;
  /** Coarse, from intent. The pill comes from StationStatus instead. */
  state: 'offline' | 'on_air' | 'live';
  now_playing: NowPlaying | null;
  created_at: string;
  schedules?: StationSchedule[];
  autodj_slots?: AutodjSlot[];
  programme?: {
    playlist: { id: string; name: string } | null;
    slot_id: string | null;
    until: string | null;
    next: {
      slot_id: string;
      label: string | null;
      playlist: { id: string | null; name: string | null };
      starts_at: string;
    } | null;
  };
  stats?: {
    sessions: number;
    total_airtime_seconds: number;
    peak_listeners: number;
    has_listeners: boolean;
  };
}

export type StationState = 'offline' | 'starting' | 'on_air' | 'live' | 'degraded';

export interface StationStatus {
  slug: string;
  state: StationState;
  desired_state: 'stopped' | 'running';
  reachable: boolean;
  ready: boolean;
  source: 'live' | 'autodj' | 'silence' | null;
  /** Is somebody on air. Null from an old container that can't say. */
  broadcaster: boolean | null;
  live_source: { type: 'browser' | 'electron' | 'external'; client: string | null } | null;
  now_playing: NowPlaying | null;
  elapsed: number | null;
  remaining: number | null;
  playlist_length: number;
  up_next: { id: string | null; title: string; artist: string | null }[];
}

export interface StreamSession {
  id: string;
  started_at: string;
  ended_at: string | null;
  peak_listeners: number;
  source_type: 'browser' | 'electron' | 'external';
  client?: string | null;
}

export interface Track {
  id: string;
  kind: 'music' | 'jingle';
  title: string;
  artist: string | null;
  duration_seconds: number;
  file_size_bytes: number;
  position: number;
  playlist_ids?: string[];
  original_filename: string;
  created_at: string;
}

export interface Playlist {
  id: string;
  name: string;
  is_default: boolean;
  order: 'sequential' | 'shuffle';
  position: number;
  track_count?: number;
  duration_seconds?: number;
}

export interface AudienceLocked {
  locked: true;
  plan_days: 0;
  range_days: 0;
  live: number;
  peak_all_time: number;
}

export interface Breakdown {
  rows: { label: string; sessions: number }[];
  total: number;
}

export interface AudienceReport {
  locked: false;
  plan_days: number;
  range_days: number;
  live: number;
  peak_all_time: number;
  totals: {
    listener_minutes: number;
    peak: number;
    sessions: number;
    listeners: number;
    avg_listen_seconds: number;
    finished_listens: number;
    qualified_listens: number;
  };
  daily: { day: string; listener_minutes: number; peak: number; sessions: number; listeners: number }[];
  countries: { rows: { country: string; sessions: number; listener_seconds: number }[]; total: number };
  devices: Breakdown;
  browsers: Breakdown;
  referrers: Breakdown;
}

export type Audience = AudienceLocked | AudienceReport;

// ── The station page's shared data ──

export interface StationContextValue {
  slug: string;
  station: Station | null;
  error: string | null;
  reload: () => Promise<void>;
}

export const StationContext = createContext<StationContextValue | null>(null);

export function useStation(): StationContextValue {
  const value = useContext(StationContext);
  if (!value) throw new Error('useStation outside the station layout');
  return value;
}

export function errorText(err: unknown): string {
  return err instanceof Error ? err.message : String(err);
}

/**
 * GET `path` while the screen is focused and the app is in front. `pollMs`
 * refetches on an interval; `reload` refetches now.
 */
export function useApiData<T>(path: string | null, pollMs?: number) {
  const [data, setData] = useState<T | null>(null);
  const [error, setError] = useState<string | null>(null);

  const reload = useCallback(async () => {
    if (!path) return;
    try {
      setData(await api<T>(path));
      setError(null);
    } catch (err) {
      setError(errorText(err));
    }
  }, [path]);

  useFocusEffect(
    useCallback(() => {
      reload();
      if (!pollMs) return;
      const id = setInterval(() => {
        if (AppState.currentState === 'active') reload();
      }, pollMs);
      return () => clearInterval(id);
    }, [reload, pollMs]),
  );

  return { data, error, reload };
}

// ── Status: the web's useStationStatus, simplified ──

/**
 * The container's own answer, polled at the web's cadence: every 2 s while
 * it is starting or a live handover is under way, 30 s while off, and
 * otherwise just after the current track ends (3–10 s).
 */
export function useStationStatus(slug: string) {
  const [snap, setSnap] = useState<{ status: StationStatus; at: number } | null>(null);
  const [failed, setFailed] = useState(false);
  // The running loop's "poll now", so a power action can ask for a fresh read.
  const pollNow = useRef<() => Promise<void>>(async () => {});

  useFocusEffect(
    useCallback(() => {
      let active = true;
      let timer: ReturnType<typeof setTimeout> | null = null;
      let failures = 0;

      const poll = async () => {
        if (timer) clearTimeout(timer);
        let next = 10_000;
        try {
          const { data } = await api<{ data: StationStatus }>(`/stations/${slug}/status`);
          if (!active) return;
          failures = 0;
          setSnap({ status: data, at: Date.now() });
          setFailed(false);
          const handover =
            (data.source === 'live' && data.broadcaster === false) ||
            (data.broadcaster === true && data.source !== 'live');
          if (data.state === 'starting' || handover) next = 2000;
          else if (data.state === 'offline') next = 30_000;
          else if (data.remaining != null) next = Math.min(10_000, Math.max(3000, data.remaining * 1000 + 750));
        } catch {
          if (!active) return;
          failures += 1;
          setFailed(true);
          next = Math.min(30_000, 2000 * 2 ** (failures - 1));
        }
        if (active) timer = setTimeout(poll, next);
      };

      pollNow.current = poll;
      poll();
      const sub = AppState.addEventListener('change', (s) => {
        if (s === 'active') poll();
      });
      return () => {
        active = false;
        sub.remove();
        if (timer) clearTimeout(timer);
      };
    }, [slug]),
  );

  const refresh = useCallback(() => pollNow.current(), []);
  /** `receivedAt` lets a progress bar run on between polls. */
  return { status: snap?.status ?? null, receivedAt: snap?.at ?? 0, failed, refresh };
}

/** The current time, refreshed every `ms` while mounted. */
export function useTicker(ms: number): number {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    const id = setInterval(() => setNow(Date.now()), ms);
    return () => clearInterval(id);
  }, [ms]);
  return now;
}

// ── Formatting ──

export const DAY_SHORT = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];

/** "Mon–Fri", "Sat, Sun", "Every day". */
export function formatDays(days: number[]): string {
  const set = [...new Set(days)].sort((a, b) => a - b);
  if (set.length === 7) return 'Every day';
  if (set.join() === '1,2,3,4,5') return 'Weekdays';
  if (set.join() === '0,6') return 'Weekends';
  return set.map((d) => DAY_SHORT[d]).join(', ');
}

/** "1h 23m", "4m", "38s". */
export function formatDuration(seconds: number): string {
  const s = Math.max(0, Math.round(seconds));
  const h = Math.floor(s / 3600);
  const m = Math.floor((s % 3600) / 60);
  if (h > 0) return m ? `${h}h ${m}m` : `${h}h`;
  if (m > 0) return `${m}m`;
  return `${s}s`;
}

/** "just now", "5 min ago", "3 h ago", "2 days ago", then a date. */
export function formatAgo(iso: string, now = Date.now()): string {
  const t = new Date(iso).getTime();
  if (Number.isNaN(t)) return '';
  const s = Math.round((now - t) / 1000);
  if (s < 60) return 'just now';
  if (s < 3600) return `${Math.floor(s / 60)} min ago`;
  if (s < 86_400) return `${Math.floor(s / 3600)} h ago`;
  if (s < 7 * 86_400) {
    const d = Math.floor(s / 86_400);
    return d === 1 ? 'yesterday' : `${d} days ago`;
  }
  return new Date(t).toLocaleDateString(undefined, { day: 'numeric', month: 'short' });
}

/** "Mon 27 Sep, 21:04". */
export function formatWhen(iso: string): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return '';
  return d.toLocaleString(undefined, { weekday: 'short', day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' });
}

export function formatBytes(bytes: number): string {
  if (bytes >= 1024 ** 3) return `${(bytes / 1024 ** 3).toFixed(1)} GB`;
  if (bytes >= 1024 ** 2) return `${Math.round(bytes / 1024 ** 2)} MB`;
  return `${Math.max(1, Math.round(bytes / 1024))} KB`;
}

export const SOURCE_LABEL: Record<StreamSession['source_type'], string> = {
  browser: 'Studio',
  electron: 'Desktop',
  external: 'Encoder',
};
