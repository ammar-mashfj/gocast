import { IconArrowsShuffle, IconChevronDown, IconChevronRight, IconListNumbers } from '@tabler/icons-react-native';
import { useState } from 'react';
import { Pressable, StyleSheet, View } from 'react-native';

import {
  EditOnWeb,
  ErrorNote,
  LibrarySkeleton,
  RowsSkeleton,
  ProTag,
  Section,
  StationScreen,
} from '../../../components/station/parts';
import { Panel, T } from '../../../components/ui';
import { api } from '../../../lib/api';
import { useAutoDjLocked } from '../../../lib/auth';
import {
  errorText,
  formatBytes,
  formatDuration,
  useApiData,
  useStation,
  type Playlist,
  type Track,
} from '../../../lib/station';
import { alpha, colors, radius } from '../../../lib/theme';

interface TracksResponse {
  data: Track[];
  meta: { storage_used_bytes: number; storage_cap_bytes: number };
}

/**
 * AutoDJ's music, read-only: storage, playlists (tap to see what's in one),
 * and every track. Uploading and arranging stay on the web for now.
 */
export default function LibraryTab() {
  const { slug } = useStation();
  const autoDjLocked = useAutoDjLocked();
  const tracks = useApiData<TracksResponse>(`/stations/${slug}/tracks`);
  const playlists = useApiData<{ data: Playlist[] }>(`/stations/${slug}/playlists`);
  const reload = () => Promise.all([tracks.reload(), playlists.reload()]);

  if (!tracks.data || !playlists.data) {
    const err = tracks.error ?? playlists.error;
    return err ? (
      <StationScreen onRefresh={reload}>
        <ErrorNote message={err} onRetry={reload} />
      </StationScreen>
    ) : (
      <LibrarySkeleton />
    );
  }

  const { data: all, meta } = tracks.data;
  const lists = [...playlists.data.data].sort((a, b) => Number(b.is_default) - Number(a.is_default) || a.position - b.position);
  const totalSeconds = all.reduce((s, t) => s + t.duration_seconds, 0);

  return (
    <StationScreen onRefresh={reload}>
      {autoDjLocked && (
        <Panel style={styles.note}>
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
            <T size={15} weight="semibold">
              AutoDJ
            </T>
            <ProTag />
          </View>
          <T tone="muted" size={14} style={{ lineHeight: 21 }}>
            Your library plays only on Pro, when nobody is live. You can still see what&apos;s here.
          </T>
        </Panel>
      )}

      <Storage used={meta.storage_used_bytes} cap={meta.storage_cap_bytes} tracks={all.length} seconds={totalSeconds} />

      <Section title="Playlists">
        {lists.map((p, i) => (
          <PlaylistRow key={p.id} playlist={p} divider={i > 0} />
        ))}
      </Section>

      <Section title={`All tracks · ${all.length}`}>
        {all.length === 0 ? (
          <T tone="muted" size={14} style={{ lineHeight: 20 }}>
            No music yet. Upload MP3, M4A, FLAC, OGG or WAV files from the web library.
          </T>
        ) : (
          <TrackList tracks={all} />
        )}
      </Section>

      <EditOnWeb label="Upload and arrange on the web" path={`/dashboard/stations/${slug}/library`} />
    </StationScreen>
  );
}

function Storage({ used, cap, tracks, seconds }: { used: number; cap: number; tracks: number; seconds: number }) {
  const ratio = cap > 0 ? Math.min(1, used / cap) : 0;
  const full = ratio >= 0.95;
  return (
    <Panel style={styles.note}>
      <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'baseline' }}>
        <T size={15} weight="semibold">
          Storage
        </T>
        <T mono size={12} tone={full ? 'fault' : 'muted'}>
          {formatBytes(used)} of {formatBytes(cap)}
        </T>
      </View>
      <View style={styles.meterTrack}>
        <View
          style={[
            styles.meterFill,
            { width: `${Math.max(used > 0 ? 1 : 0, ratio * 100)}%`, backgroundColor: full ? colors.fault : colors.violetText },
          ]}
        />
      </View>
      <T tone="faint" size={12}>
        {tracks} {tracks === 1 ? 'track' : 'tracks'} · {formatDuration(seconds)} of music
      </T>
    </Panel>
  );
}

function PlaylistRow({ playlist, divider }: { playlist: Playlist; divider: boolean }) {
  const [open, setOpen] = useState(false);
  const [tracks, setTracks] = useState<Track[] | null>(null);
  const [error, setError] = useState<string | null>(null);

  const toggle = async () => {
    const next = !open;
    setOpen(next);
    if (next && !tracks) {
      try {
        const { data } = await api<{ data: Track[] }>(`/playlists/${playlist.id}/tracks`);
        setTracks(data);
      } catch (err) {
        setError(errorText(err));
      }
    }
  };

  const Chevron = open ? IconChevronDown : IconChevronRight;
  const Order = playlist.order === 'shuffle' ? IconArrowsShuffle : IconListNumbers;

  return (
    <View style={divider && styles.divider}>
      <Pressable onPress={toggle} style={({ pressed }) => [styles.playlistRow, pressed && { opacity: 0.7 }]}>
        <Chevron size={16} color={colors.faint} />
        <View style={{ flex: 1, gap: 2 }}>
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
            <T size={14} weight="medium" numberOfLines={1} style={{ flexShrink: 1 }}>
              {playlist.name}
            </T>
            {playlist.is_default && (
              <View style={styles.defaultTag}>
                <T tone="muted" size={11}>
                  Default
                </T>
              </View>
            )}
          </View>
          <T tone="faint" size={12}>
            {playlist.track_count ?? 0} tracks
            {playlist.duration_seconds ? ` · ${formatDuration(playlist.duration_seconds)}` : ''}
          </T>
        </View>
        <Order size={16} color={colors.faint} />
      </Pressable>
      {open && (
        <View style={styles.playlistBody}>
          {error ? (
            <T tone="fault" size={13}>
              {error}
            </T>
          ) : !tracks ? (
            <RowsSkeleton count={Math.min(4, Math.max(1, playlist.track_count ?? 3))} />
          ) : tracks.length === 0 ? (
            <T tone="faint" size={13}>
              Empty playlist.
            </T>
          ) : (
            <TrackList tracks={tracks} numbered={playlist.order === 'sequential'} />
          )}
        </View>
      )}
    </View>
  );
}

/** Long libraries show the first 50, then a count; the rest are on the web. */
const PAGE = 50;

function TrackList({ tracks, numbered }: { tracks: Track[]; numbered?: boolean }) {
  const [shown, setShown] = useState(PAGE);
  return (
    <View>
      {tracks.slice(0, shown).map((t, i) => (
        <View key={t.id} style={[styles.track, i > 0 && styles.divider]}>
          {numbered && (
            <T mono size={12} tone="faint" style={{ width: 24 }}>
              {i + 1}
            </T>
          )}
          <View style={{ flex: 1, gap: 1 }}>
            <T size={14} numberOfLines={1}>
              {t.title}
            </T>
            {!!t.artist && (
              <T tone="faint" size={12} numberOfLines={1}>
                {t.artist}
              </T>
            )}
          </View>
          <T mono size={12} tone="muted">
            {mmss(t.duration_seconds)}
          </T>
        </View>
      ))}
      {tracks.length > shown && (
        <Pressable onPress={() => setShown((n) => n + PAGE)} style={styles.more}>
          <T tone="violet" size={13} weight="medium">
            Show {Math.min(PAGE, tracks.length - shown)} more of {tracks.length - shown}
          </T>
        </Pressable>
      )}
    </View>
  );
}

function mmss(seconds: number): string {
  const s = Math.max(0, Math.round(seconds));
  const h = Math.floor(s / 3600);
  const m = Math.floor((s % 3600) / 60);
  const pad = (n: number) => String(n).padStart(2, '0');
  return h ? `${h}:${pad(m)}:${pad(s % 60)}` : `${m}:${pad(s % 60)}`;
}

const styles = StyleSheet.create({
  note: { padding: 16, gap: 10 },
  meterTrack: { height: 6, borderRadius: 3, backgroundColor: alpha('#ffffff', 0.06), overflow: 'hidden' },
  meterFill: { height: '100%', borderRadius: 3 },
  divider: { borderTopWidth: 1, borderTopColor: colors.divider },
  playlistRow: { flexDirection: 'row', alignItems: 'center', gap: 10, paddingVertical: 12 },
  playlistBody: { paddingLeft: 26, paddingBottom: 8 },
  defaultTag: {
    borderWidth: 1,
    borderColor: alpha('#ffffff', 0.15),
    borderRadius: radius.full,
    paddingHorizontal: 7,
    paddingVertical: 1,
  },
  track: { flexDirection: 'row', alignItems: 'center', gap: 10, paddingVertical: 9 },
  more: { paddingTop: 12, alignItems: 'center' },
});
