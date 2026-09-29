import * as DocumentPicker from 'expo-document-picker';
import { Directory, Paths } from 'expo-file-system';
import { useState } from 'react';
import { StyleSheet, View } from 'react-native';

import { Overlay } from '../../../components/Overlay';
import { GroupCard, type Group } from '../../../components/station/library';
import { EmptyNote, ErrorNote, ListSkeleton, StationScreen } from '../../../components/station/parts';
import { Button, Card, Heading, PillButton, Progress, T } from '../../../components/ui';
import { api, apiUpload } from '../../../lib/api';
import { useAutoDjLocked } from '../../../lib/auth';
import {
  errorText,
  formatBytes,
  formatDuration,
  useApiData,
  useStation,
  type Playlist,
  type Track,
  trackCount,
} from '../../../lib/station';
import { colors, SWATCHES } from '../../../lib/theme';
import { uploadable } from '../../../lib/upload';

interface TracksResponse {
  data: Track[];
  meta: { storage_used_bytes: number; storage_cap_bytes: number };
}

/**
 * AutoDJ's music: storage, and each playlist (tap to see what's in it).
 * Pro can add music straight from the phone; it lands in the default
 * playlist, as an upload on the web does.
 */
export default function LibraryTab() {
  const { slug } = useStation();
  const autoDjLocked = useAutoDjLocked();
  const tracks = useApiData<TracksResponse>(`/stations/${slug}/tracks`);
  const playlists = useApiData<{ data: Playlist[] }>(`/stations/${slug}/playlists`);
  // Bumped on every refresh, so an open playlist refetches what's in it.
  const [version, setVersion] = useState(0);
  const reload = () => {
    setVersion((v) => v + 1);
    return Promise.all([tracks.reload(), playlists.reload()]);
  };
  const [upload, setUpload] = useState<{ done: number; total: number } | null>(null);
  const [notice, setNotice] = useState<{ text: string; bad: boolean } | null>(null);
  // Select mode: long-press a track to start, tick more in any playlist,
  // then delete them from the library. Unticking the last one ends it.
  const [selected, setSelected] = useState<Set<string> | null>(null);
  const [confirming, setConfirming] = useState(false);
  const [deleting, setDeleting] = useState(false);

  const toggle = (id: string) =>
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next.size ? next : null;
    });

  const deleteSelected = async () => {
    if (!selected?.size) return;
    const count = selected.size;
    setDeleting(true);
    try {
      await api(`/stations/${slug}/tracks`, { method: 'DELETE', body: { track_ids: [...selected] } });
      setNotice({ text: `Deleted ${count} ${count === 1 ? 'track' : 'tracks'}.`, bad: false });
      setSelected(null);
    } catch (err) {
      setNotice({ text: errorText(err), bad: true });
    } finally {
      setDeleting(false);
      setConfirming(false);
      await reload();
    }
  };

  const addFromPhone = async () => {
    const picked = await DocumentPicker.getDocumentAsync({
      type: 'audio/*',
      multiple: true,
      copyToCacheDirectory: true,
    });
    if (picked.canceled || picked.assets.length === 0) return;
    const files = picked.assets;
    const staging = new Directory(Paths.cache, `upload-${Date.now()}`);
    staging.create({ intermediates: true });
    setNotice(null);
    let added = 0;
    try {
      // One file per request: the progress is honest, and a quota error
      // stops the batch at the file that tripped it.
      for (const [i, file] of files.entries()) {
        setUpload({ done: i, total: files.length });
        const form = new FormData();
        const part = uploadable(file.uri, file.name, new Directory(staging, String(i)));
        form.append('files[]', part as unknown as Blob);
        // Expo's fetch percent-encodes the part's filename ("My%20Song.mp3"),
        // and uploadable() swapped out characters the file system refuses,
        // so the picked name goes alongside it; see StoreTrackRequest.
        form.append('names[]', file.name);
        const { body } = await apiUpload<{ data: Track[]; errors: { message: string }[] }>(
          `/stations/${slug}/tracks`,
          form,
        );
        added += body.data.length;
        if (body.errors.length) throw new Error(body.errors[0]!.message);
      }
      setNotice({ text: `Added ${added} ${added === 1 ? 'track' : 'tracks'} to your default playlist.`, bad: false });
    } catch (err) {
      setNotice({
        text: added ? `Added ${added}, then stopped: ${errorText(err)}` : errorText(err),
        bad: true,
      });
    } finally {
      setUpload(null);
      staging.delete();
      await reload();
    }
  };

  if (!tracks.data || !playlists.data) {
    const err = tracks.error ?? playlists.error;
    return err ? (
      <StationScreen onRefresh={reload}>
        <ErrorNote message={err} onRetry={reload} />
      </StationScreen>
    ) : (
      <ListSkeleton />
    );
  }

  const { data: all, meta } = tracks.data;
  const jingles = all.filter((t) => t.kind === 'jingle');
  const lists = [...playlists.data.data].sort(
    (a, b) => Number(b.is_default) - Number(a.is_default) || a.position - b.position,
  );
  const groups: Group[] = [
    ...lists.map((p, i) => ({
      kind: 'playlist' as const,
      key: p.id,
      name: p.name,
      playlist: p,
      color: SWATCHES[i % SWATCHES.length]!,
      meta: `${trackCount(p.track_count ?? 0)}${p.duration_seconds ? ` · ${formatDuration(p.duration_seconds)}` : ''}`,
    })),
    ...(jingles.length
      ? [
          {
            kind: 'jingles' as const,
            key: 'jingles',
            name: 'Jingles & IDs',
            tracks: jingles,
            color: SWATCHES[lists.length % SWATCHES.length]!,
            meta: `${jingles.length} clips · ${formatDuration(jingles.reduce((s, t) => s + t.duration_seconds, 0))}`,
          },
        ]
      : []),
  ];
  const ratio = meta.storage_cap_bytes > 0 ? meta.storage_used_bytes / meta.storage_cap_bytes : 0;

  return (
    <View style={{ flex: 1 }}>
      <StationScreen onRefresh={reload}>
        <Heading
          action={
            selected ? (
              <PillButton label="Done" variant="card" onPress={() => setSelected(null)} />
            ) : autoDjLocked ? undefined : (
              <PillButton
                label={upload ? `Uploading ${upload.done + 1} of ${upload.total}…` : '+ Add from phone'}
                disabled={!!upload}
                onPress={addFromPhone}
              />
            )
          }
        >
          Library
        </Heading>

        {autoDjLocked && (
          <Card radius={20} style={{ gap: 8 }}>
            <T mono weight={600} size={11} tone="pro" tracking={0.1}>
              PRO
            </T>
            <T weight={400} size={15} tone="muted" lineHeight={1.45}>
              AutoDJ plays this library between your shows, and adding music is part of it. You can still see
              what&apos;s here.
            </T>
          </Card>
        )}

        {!!notice && (
          <T weight={600} size={13} tone={notice.bad ? 'liveText' : 'ok'} lineHeight={1.4}>
            {notice.text}
          </T>
        )}

        <Card radius={20} style={{ gap: 10 }}>
          <View style={styles.storageHead}>
            <T weight={600} size={14}>
              {all.length} {all.length === 1 ? 'track' : 'tracks'}
            </T>
            <T mono weight={500} size={13} tone={ratio >= 0.95 ? 'liveText' : 'muted'}>
              {formatBytes(meta.storage_used_bytes)} of {formatBytes(meta.storage_cap_bytes)}
            </T>
          </View>
          <Progress
            fraction={meta.storage_used_bytes > 0 ? Math.max(0.01, ratio) : 0}
            color={ratio >= 0.95 ? colors.live : colors.autodj}
            track={colors.bg}
            height={8}
          />
        </Card>

        {all.length === 0 ? (
          <EmptyNote body="No music yet. Add MP3, M4A, FLAC, OGG or WAV files and AutoDJ plays them between shows." />
        ) : (
          groups.map((g, i) => (
            <GroupCard
              key={g.key}
              group={g}
              startOpen={i === 0}
              version={version}
              selected={selected}
              onToggle={toggle}
            />
          ))
        )}
        {/* Room for the delete bar, so the last track isn't hidden under it. */}
        {selected && <View style={{ height: 76 }} />}
      </StationScreen>

      {selected && (
        <View style={styles.deleteBar}>
          <Button
            label={
              selected.size === 0
                ? 'Tick tracks to delete'
                : `Delete ${selected.size} ${selected.size === 1 ? 'track' : 'tracks'}`
            }
            variant="live"
            height={54}
            disabled={selected.size === 0}
            onPress={() => setConfirming(true)}
          />
        </View>
      )}

      <Overlay visible={confirming} onClose={() => setConfirming(false)} placement="bottom" dismissable={!deleting}>
        <T weight={800} size={28} tracking={-0.03} style={{ lineHeight: 30 }}>
          Delete {selected?.size ?? 0} {selected?.size === 1 ? 'track' : 'tracks'}?
        </T>
        <T weight={400} size={15} tone="muted" lineHeight={1.45}>
          They&apos;re removed from your library and from every playlist they&apos;re in, and AutoDJ stops playing them.
          This can&apos;t be undone.
        </T>
        <View style={{ gap: 8 }}>
          <Button label="Delete" variant="live" busy={deleting} onPress={deleteSelected} />
          <Button
            label="Keep them"
            variant="subtle"
            height={54}
            disabled={deleting}
            onPress={() => setConfirming(false)}
          />
        </View>
      </Overlay>
    </View>
  );
}

const styles = StyleSheet.create({
  storageHead: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  deleteBar: { position: 'absolute', left: 16, right: 16, bottom: 12 },
});
