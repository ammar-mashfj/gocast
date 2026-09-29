import { IconCheck, IconChevronDown, IconChevronUp } from '@tabler/icons-react-native';
import { useEffect, useState } from 'react';
import { Pressable, StyleSheet, View } from 'react-native';

import { formatTrackTime } from '../../broadcast/hooks';
import { api } from '../../lib/api';
import { errorText, type Playlist, type Track } from '../../lib/station';
import { colors } from '../../lib/theme';
import { Card, Divided, T } from '../ui';
import { RowsSkeleton } from './parts';

/** A playlist (or the jingles) as the Library tab lists it (app/station/[slug]/library.tsx). */
export type Group = { key: string; name: string; meta: string; color: string } & (
  { kind: 'playlist'; playlist: Playlist } | { kind: 'jingles'; tracks: Track[] }
);

export function GroupCard({
  group,
  startOpen,
  version,
  selected,
  onToggle,
}: {
  group: Group;
  startOpen: boolean;
  version: number;
  selected: Set<string> | null;
  onToggle: (id: string) => void;
}) {
  const [open, setOpen] = useState(startOpen);
  const [fetched, setFetched] = useState<Track[] | null>(null);
  const [error, setError] = useState<string | null>(null);

  // An open playlist loads its tracks, and again on every refresh or change
  // in its count (an upload lands in it). The old list stays up meanwhile.
  const playlistId = group.kind === 'playlist' ? group.playlist.id : null;
  useEffect(() => {
    if (!open || !playlistId) return;
    let active = true;
    api<{ data: Track[] }>(`/playlists/${playlistId}/tracks`).then(
      ({ data }) => {
        if (!active) return;
        setFetched(data);
        setError(null);
      },
      (err) => active && setError(errorText(err)),
    );
    return () => {
      active = false;
    };
  }, [open, playlistId, version, group.meta]);
  const loaded = group.kind === 'jingles' ? group.tracks : fetched;

  return (
    <Card radius={20} padding={0} style={{ overflow: 'hidden' }}>
      <Pressable
        accessibilityRole="button"
        accessibilityState={{ expanded: open }}
        onPress={() => setOpen((o) => !o)}
        style={({ pressed }) => [styles.groupHead, pressed && { opacity: 0.75 }]}
      >
        <View style={[styles.swatch, { backgroundColor: group.color }]} />
        <View style={{ flex: 1, gap: 3 }}>
          <T weight={700} size={16} numberOfLines={1}>
            {group.name}
          </T>
          <T mono weight={500} size={12} tone="faint">
            {group.meta}
          </T>
        </View>
        {open ? <IconChevronUp size={20} color={colors.faint} /> : <IconChevronDown size={20} color={colors.faint} />}
      </Pressable>
      {open && (
        <View style={styles.groupBody}>
          {error ? (
            <T weight={500} size={13} tone="liveText" style={{ paddingVertical: 10 }}>
              {error}
            </T>
          ) : !loaded ? (
            <RowsSkeleton count={3} />
          ) : loaded.length === 0 ? (
            <Divided first={false} style={{ paddingVertical: 12 }}>
              <T weight={500} size={13} tone="faint">
                Empty playlist.
              </T>
            </Divided>
          ) : (
            <TrackRows tracks={loaded} selected={selected} onToggle={onToggle} />
          )}
        </View>
      )}
    </Card>
  );
}

/** Long playlists show the first 50, then a count to show more. */
const PAGE = 50;

function TrackRows({
  tracks,
  selected,
  onToggle,
}: {
  tracks: Track[];
  /** Non-null in select mode: rows become checkboxes. A long-press enters it. */
  selected: Set<string> | null;
  onToggle: (id: string) => void;
}) {
  const [shown, setShown] = useState(PAGE);
  return (
    <>
      {tracks.slice(0, shown).map((t, i) => (
        <Divided key={t.id} first={false}>
          <Pressable
            accessibilityRole={selected ? 'checkbox' : undefined}
            accessibilityState={selected ? { checked: selected.has(t.id) } : undefined}
            accessibilityHint={selected ? undefined : 'Long-press to select tracks to delete'}
            onLongPress={() => !selected && onToggle(t.id)}
            onPress={() => selected && onToggle(t.id)}
            style={({ pressed }) => [styles.track, pressed && { opacity: 0.7 }]}
          >
            {selected ? (
              <View style={[styles.check, selected.has(t.id) && styles.checked]}>
                {selected.has(t.id) && <IconCheck size={14} color={colors.bg} strokeWidth={3} />}
              </View>
            ) : (
              <T mono weight={500} size={12} tone="faint" style={{ width: 22 }}>
                {i + 1}
              </T>
            )}
            <View style={{ flex: 1, minWidth: 0, gap: 2 }}>
              <T weight={600} size={14} numberOfLines={1}>
                {t.title}
              </T>
              {!!t.artist && (
                <T weight={500} size={12} tone="faint" numberOfLines={1}>
                  {t.artist}
                </T>
              )}
            </View>
            <T mono weight={500} size={12} tone="muted">
              {formatTrackTime(t.duration_seconds)}
            </T>
          </Pressable>
        </Divided>
      ))}
      {tracks.length > shown && (
        <Pressable onPress={() => setShown((n) => n + PAGE)} style={styles.more}>
          <T weight={600} size={13} tone="autodjText">
            Show {Math.min(PAGE, tracks.length - shown)} more of {tracks.length - shown}
          </T>
        </Pressable>
      )}
    </>
  );
}

const styles = StyleSheet.create({
  groupHead: { flexDirection: 'row', alignItems: 'center', gap: 14, paddingVertical: 14, paddingHorizontal: 16 },
  swatch: { width: 46, height: 46, borderRadius: 12 },
  groupBody: { paddingHorizontal: 16, paddingBottom: 8 },
  track: { flexDirection: 'row', alignItems: 'center', gap: 12, paddingVertical: 10 },
  more: { paddingVertical: 12, alignItems: 'center' },
  check: {
    width: 22,
    height: 22,
    borderRadius: 11,
    borderWidth: 2,
    borderColor: colors.faint,
    alignItems: 'center',
    justifyContent: 'center',
  },
  checked: { backgroundColor: colors.text, borderColor: colors.text },
});
