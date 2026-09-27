import { IconGripVertical, IconMusic, IconPlus, IconX } from '@tabler/icons-react-native';
import * as DocumentPicker from 'expo-document-picker';
import { useEffect, useRef, useState } from 'react';
import { ActivityIndicator, Pressable, StyleSheet, View } from 'react-native';
import Sortable from 'react-native-sortables';
import type { AnimatedRef } from 'react-native-reanimated';

import { QUEUE_BYTE_LIMIT, type AudioEngine, type QueueTrack } from '../../audio/engine';
import { formatTrackTime, useEngineVersion, useNow } from '../../broadcast/hooks';
import { alpha, colors, panelShadow, radius } from '../../lib/theme';
import { Button, Pill, Segmented, T } from '../ui';

/**
 * The web's FileQueue: the numbered running order with projected on-air
 * times, drag to reorder, remove and clear with a 6s Undo, the repeat choice,
 * and adding files. Files come from the phone's picker instead of drag-drop.
 */

const UNDO_MS = 6000;

interface UndoState {
  message: string;
  tracks: QueueTrack[];
  order: string[];
}

function formatBytes(bytes: number): string {
  if (bytes >= 1024 ** 3) return `${(bytes / 1024 ** 3).toFixed(1)} GB`;
  return `${Math.round(bytes / 1024 ** 2)} MB`;
}

function formatTotal(seconds: number): string {
  const m = Math.round(seconds / 60);
  if (m < 60) return `${m} min`;
  return `${Math.floor(m / 60)} h ${m % 60} min`;
}

function clockTime(at: number): string {
  const d = new Date(at);
  return `${d.getHours()}:${String(d.getMinutes()).padStart(2, '0')}`;
}

export function RunningOrder({ engine, scrollRef }: { engine: AudioEngine; scrollRef: AnimatedRef<any> }) {
  useEngineVersion(engine);
  const now = useNow(15_000);
  const queue = engine.getQueue();
  const currentIndex = engine.getCurrentIndex();
  const playing = engine.isPlaying();
  const repeatMode = engine.getRepeatMode();
  const [adding, setAdding] = useState(false);
  const [notice, setNotice] = useState<string | null>(null);
  const [undo, setUndo] = useState<UndoState | null>(null);
  const undoTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(
    () => () => {
      if (undoTimer.current) clearTimeout(undoTimer.current);
    },
    [],
  );

  const offerUndo = (next: UndoState) => {
    if (undoTimer.current) clearTimeout(undoTimer.current);
    setUndo(next);
    undoTimer.current = setTimeout(() => setUndo(null), UNDO_MS);
  };

  const remove = (track: QueueTrack) => {
    const order = queue.map((t) => t.id);
    engine.removeTrack(track.id);
    offerUndo({ message: `Removed ${track.title}`, tracks: [track], order });
  };

  const clearUpcoming = () => {
    const order = queue.map((t) => t.id);
    const removed = engine.clearUpcoming();
    if (removed.length) offerUndo({ message: `Cleared ${removed.length} upcoming`, tracks: removed, order });
  };

  const addMusic = async () => {
    const result = await DocumentPicker.getDocumentAsync({
      type: 'audio/*',
      multiple: true,
      copyToCacheDirectory: true,
    });
    if (result.canceled) return;
    setAdding(true);
    setNotice(null);
    try {
      const outcome = await engine.addFiles(
        result.assets.map((a) => ({ uri: a.uri, name: a.name, size: a.size ?? 0, mimeType: a.mimeType })),
      );
      if (outcome.overLimit) setNotice(`Queue is full — ${outcome.skipped.length} files skipped`);
      else if (outcome.skipped.length) setNotice(`${outcome.skipped.length} files could not be added`);
    } finally {
      setAdding(false);
    }
  };

  // Projected on-air times, from now, for the tracks after the current one.
  // Null while paused or holding one track, as on the web.
  const airTimes: (number | null)[] = [];
  if (playing && repeatMode === 'all' && currentIndex >= 0) {
    const current = queue[currentIndex];
    let t = now + Math.max(0, (current?.duration ?? 0) - engine.getElapsed()) * 1000;
    for (let step = 1; step < queue.length; step++) {
      const i = (currentIndex + step) % queue.length;
      airTimes[i] = t;
      t += queue[i].duration * 1000;
    }
  }

  const bytes = engine.getQueueBytes();
  const total = queue.reduce((s, t) => s + t.duration, 0);

  return (
    <View style={styles.panel}>
      <View style={styles.header}>
        <View style={{ flex: 1 }}>
          <T size={16} weight="semibold">
            Running order
          </T>
          <T size={12} tone={bytes > QUEUE_BYTE_LIMIT * 0.9 ? 'fault' : 'muted'}>
            {queue.length} {queue.length === 1 ? 'track' : 'tracks'} · {formatTotal(total)} · {formatBytes(bytes)} of
            2.0 GB
          </T>
        </View>
        <Button
          label="Add"
          icon={adding ? <ActivityIndicator color={colors.text} /> : <IconPlus size={18} color={colors.text} />}
          disabled={adding}
          onPress={addMusic}
        />
      </View>

      {queue.length > 0 && (
        <Segmented
          value={repeatMode}
          onChange={(m) => engine.setRepeatMode(m)}
          options={[
            { value: 'all', label: 'Repeat list' },
            { value: 'one', label: 'Repeat track' },
          ]}
        />
      )}

      {notice && (
        <T size={12} tone="fault">
          {notice}
        </T>
      )}

      {queue.length === 0 ? (
        <Pressable onPress={addMusic} style={styles.empty}>
          <IconMusic size={24} color={colors.muted} />
          <T tone="muted" size={14} style={{ textAlign: 'center' }}>
            Add music from your phone to start playing. It stays here for your next show.
          </T>
        </Pressable>
      ) : (
        <Sortable.Grid
          data={queue}
          columns={1}
          rowGap={2}
          customHandle
          scrollableRef={scrollRef}
          keyExtractor={(t) => t.id}
          onDragEnd={({ fromIndex, toIndex }) => engine.moveTrack(fromIndex, toIndex)}
          renderItem={({ item, index }) => (
            <Row
              track={item}
              index={index}
              current={index === currentIndex}
              airTime={airTimes[index] ?? null}
              onRemove={() => remove(item)}
            />
          )}
        />
      )}

      {queue.length > 1 && (
        <Button label="Clear upcoming" variant="ghost" onPress={clearUpcoming} style={{ alignSelf: 'flex-start' }} />
      )}

      {undo && (
        <View style={styles.toast}>
          <T size={13} style={{ flex: 1 }} numberOfLines={1}>
            {undo.message}
          </T>
          <Pressable
            onPress={() => {
              engine.restoreTracks(undo.tracks, undo.order);
              setUndo(null);
            }}
            style={styles.undo}
          >
            <T size={13} tone="violet" weight="semibold">
              Undo
            </T>
          </Pressable>
        </View>
      )}
    </View>
  );
}

function Row({
  track,
  index,
  current,
  airTime,
  onRemove,
}: {
  track: QueueTrack;
  index: number;
  current: boolean;
  airTime: number | null;
  onRemove: () => void;
}) {
  return (
    <View style={[styles.row, current && { backgroundColor: alpha('#ffffff', 0.04) }]}>
      <Sortable.Handle>
        <View style={styles.handle} accessibilityLabel="Drag to reorder">
          <IconGripVertical size={18} color={colors.faint} />
        </View>
      </Sortable.Handle>
      <T size={13} tone="faint" style={{ width: 22 }}>
        {index + 1}
      </T>
      <View style={{ flex: 1, minWidth: 0 }}>
        <T size={14} weight={current ? 'semibold' : 'regular'} numberOfLines={1}>
          {track.title}
        </T>
        {!!track.artist && (
          <T size={12} tone="muted" numberOfLines={1}>
            {track.artist}
          </T>
        )}
      </View>
      {current ? (
        <Pill label="Playing" tone="neutral" />
      ) : airTime !== null ? (
        <T mono size={12} tone="muted">
          {clockTime(airTime)}
        </T>
      ) : null}
      <T mono size={12} tone="faint" style={{ width: 44, textAlign: 'right' }}>
        {formatTrackTime(track.duration)}
      </T>
      <Pressable accessibilityLabel={`Remove ${track.title}`} onPress={onRemove} style={styles.remove}>
        <IconX size={16} color={colors.faint} />
      </Pressable>
    </View>
  );
}

const styles = StyleSheet.create({
  panel: {
    backgroundColor: colors.panel,
    borderColor: colors.hairline,
    borderWidth: 1,
    borderRadius: radius.xxl,
    padding: 16,
    gap: 12,
    ...panelShadow,
  },
  header: { flexDirection: 'row', alignItems: 'center', gap: 12 },
  empty: {
    alignItems: 'center',
    gap: 10,
    paddingVertical: 28,
    paddingHorizontal: 16,
    borderRadius: radius.xl,
    borderWidth: 1,
    borderStyle: 'dashed',
    borderColor: alpha('#ffffff', 0.12),
  },
  row: { flexDirection: 'row', alignItems: 'center', gap: 6, minHeight: 52, borderRadius: radius.md, paddingRight: 2 },
  handle: { width: 32, height: 44, alignItems: 'center', justifyContent: 'center' },
  remove: { width: 36, height: 44, alignItems: 'center', justifyContent: 'center' },
  toast: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    backgroundColor: colors.popover,
    borderColor: colors.hairline,
    borderWidth: 1,
    borderRadius: radius.lg,
    paddingLeft: 14,
  },
  undo: { height: 44, paddingHorizontal: 14, justifyContent: 'center' },
});
