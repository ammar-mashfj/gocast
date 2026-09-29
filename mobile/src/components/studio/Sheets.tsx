import { IconPlayerPlayFilled, IconX } from '@tabler/icons-react-native';
import * as DocumentPicker from 'expo-document-picker';
import { useEffect, useRef, useState } from 'react';
import { ActivityIndicator, Pressable, StyleSheet, View } from 'react-native';
import Animated, { useAnimatedRef } from 'react-native-reanimated';
import Sortable from 'react-native-sortables';

import { QUEUE_BYTE_LIMIT, type AudioEngine, type QueueTrack } from '../../audio/engine';
import { INPUT_GAIN_MAX_DB, INPUT_GAIN_MIN_DB, type DuckLevel } from '../../audio/micPrefs';
import type { EngineSnapshot } from '../../broadcast/hooks';
import { api } from '../../lib/api';
import { formatBytes } from '../../lib/station';
import { colors } from '../../lib/theme';
import { Overlay } from '../Overlay';
import { Button, Segmented, Switch, T } from '../ui';
import { mmss } from './model';

// ── Running order ──

const UNDO_MS = 6000;

/**
 * The running order: tap a track to play it now, hold and drag to reorder,
 * × to remove (with Undo), add files from the phone. It is saved on the
 * phone and comes back for the next show.
 */
export function QueueSheet({
  visible,
  onClose,
  engine,
  snap,
}: {
  visible: boolean;
  onClose: () => void;
  engine: AudioEngine;
  snap: EngineSnapshot;
}) {
  const scrollRef = useAnimatedRef<Animated.ScrollView>();
  const [adding, setAdding] = useState(false);
  const [notice, setNotice] = useState<string | null>(null);
  const [undo, setUndo] = useState<{ message: string; tracks: QueueTrack[]; order: string[] } | null>(null);
  const undoTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(
    () => () => {
      if (undoTimer.current) clearTimeout(undoTimer.current);
    },
    [],
  );

  const { queue, currentIndex, playing } = snap;
  const minutes = Math.round(queue.reduce((s, t) => s + t.duration, 0) / 60);

  const add = async () => {
    const picked = await DocumentPicker.getDocumentAsync({ type: 'audio/*', multiple: true, copyToCacheDirectory: true });
    if (picked.canceled) return;
    setAdding(true);
    setNotice(null);
    try {
      const outcome = await engine.addFiles(
        picked.assets.map((a) => ({ uri: a.uri, name: a.name, size: a.size ?? 0, mimeType: a.mimeType })),
      );
      if (outcome.overLimit) setNotice(`The running order is full, so ${outcome.skipped.length} files were skipped.`);
      else if (outcome.skipped.length) setNotice(`${outcome.skipped.length} files couldn’t be read and were skipped.`);
    } finally {
      setAdding(false);
    }
  };

  const remove = (track: QueueTrack) => {
    const order = snap.queue.map((t) => t.id);
    engine.removeTrack(track.id);
    if (undoTimer.current) clearTimeout(undoTimer.current);
    setUndo({ message: `Removed ${track.title}`, tracks: [track], order });
    undoTimer.current = setTimeout(() => setUndo(null), UNDO_MS);
  };

  return (
    <Overlay visible={visible} onClose={onClose} placement="bottom">
      <View style={styles.queueHead}>
        <View style={{ flex: 1, gap: 3 }}>
          <T weight={800} size={24} tracking={-0.03}>
            Running order
          </T>
          <T mono weight={500} size={12} tone={snap.queueBytes > QUEUE_BYTE_LIMIT * 0.9 ? 'liveText' : 'faint'}>
            {queue.length} {queue.length === 1 ? 'track' : 'tracks'} · {minutes} min · {formatBytes(snap.queueBytes)} of 2 GB
          </T>
        </View>
        <Pressable
          accessibilityRole="button"
          disabled={adding}
          onPress={add}
          style={({ pressed }) => [styles.add, pressed && { opacity: 0.8 }]}
        >
          {adding ? (
            <ActivityIndicator color={colors.bg} size="small" />
          ) : (
            <T weight={700} size={14} tone="ink">
              + Add
            </T>
          )}
        </Pressable>
      </View>

      {!!notice && (
        <T weight={500} size={13} tone="liveText">
          {notice}
        </T>
      )}

      {queue.length === 0 ? (
        <Pressable onPress={add} style={styles.empty}>
          <T weight={500} size={15} tone="muted" lineHeight={1.45} style={{ textAlign: 'center' }}>
            Add music from your phone to start playing. It stays here for your next show.
          </T>
        </Pressable>
      ) : (
        <Animated.ScrollView ref={scrollRef} style={{ flexGrow: 0 }} showsVerticalScrollIndicator={false}>
          <Sortable.Grid
            data={queue}
            columns={1}
            rowGap={6}
            scrollableRef={scrollRef}
            keyExtractor={(t) => t.id}
            onDragEnd={({ fromIndex, toIndex }) => engine.moveTrack(fromIndex, toIndex)}
            renderItem={({ item, index }) => {
              const current = index === currentIndex;
              return (
                <Pressable
                  accessibilityRole="button"
                  accessibilityLabel={`Play ${item.title} now`}
                  onPress={() => engine.playAt(index)}
                  style={[
                    styles.row,
                    { backgroundColor: current ? colors.track : colors.sheet, opacity: index < currentIndex ? 0.45 : 1 },
                  ]}
                >
                  <View style={{ width: 22 }}>
                    {current && playing ? (
                      <IconPlayerPlayFilled size={13} color={colors.live} />
                    ) : (
                      <T mono weight={600} size={12} style={{ color: current ? colors.live : colors.faint }}>
                        {index + 1}
                      </T>
                    )}
                  </View>
                  <View style={{ flex: 1, minWidth: 0, gap: 2 }}>
                    <T weight={600} size={15} numberOfLines={1}>
                      {item.title}
                    </T>
                    <T weight={500} size={12} tone="muted" numberOfLines={1}>
                      {item.artist || 'Unknown artist'}
                    </T>
                  </View>
                  <T mono weight={500} size={12} tone="muted">
                    {mmss(item.duration)}
                  </T>
                  <Pressable
                    accessibilityRole="button"
                    accessibilityLabel={`Remove ${item.title}`}
                    hitSlop={6}
                    onPress={() => remove(item)}
                    style={styles.remove}
                  >
                    <IconX size={17} color={colors.faint} />
                  </Pressable>
                </Pressable>
              );
            }}
          />
        </Animated.ScrollView>
      )}

      {undo && (
        <View style={styles.undo}>
          <T weight={500} size={13} numberOfLines={1} style={{ flex: 1 }}>
            {undo.message}
          </T>
          <Pressable
            accessibilityRole="button"
            onPress={() => {
              engine.restoreTracks(undo.tracks, undo.order);
              setUndo(null);
            }}
            style={{ paddingHorizontal: 12, paddingVertical: 8 }}
          >
            <T weight={700} size={13} tone="autodjText">
              Undo
            </T>
          </Pressable>
        </View>
      )}

      {queue.length > 0 && (
        <Segmented
          value={snap.repeatMode}
          onChange={(m) => engine.setRepeatMode(m)}
          options={[
            { value: 'all', label: 'Repeat the list' },
            { value: 'one', label: 'Hold this track' },
          ]}
        />
      )}
      <T weight={400} size={12} tone="faint" style={{ textAlign: 'center' }}>
        Tap a track to play it now. Hold and drag to reorder. The order stays for your next show.
      </T>
    </Overlay>
  );
}

// ── Mic settings ──

const DUCKS: { value: DuckLevel; label: string }[] = [
  { value: 'under', label: 'Light' },
  { value: 'low', label: 'Medium' },
  { value: 'silence', label: 'Deep' },
];

export function MicSheet({
  visible,
  onClose,
  engine,
  snap,
  micDisabled,
}: {
  visible: boolean;
  onClose: () => void;
  engine: AudioEngine;
  snap: EngineSnapshot;
  micDisabled: boolean;
}) {
  const { prefs } = snap;
  const volume = Math.round(snap.monitorVolume * 100);
  return (
    <Overlay visible={visible} onClose={onClose} placement="bottom">
      <T weight={800} size={24} tracking={-0.03}>
        Mic settings
      </T>

      {!micDisabled && (
        <>
          <Stepper
            title="Mic level"
            sub="Phones need a boost"
            value={`+${prefs.inputGainDb} dB`}
            canDown={prefs.inputGainDb > INPUT_GAIN_MIN_DB}
            canUp={prefs.inputGainDb < INPUT_GAIN_MAX_DB}
            onDown={() => engine.setMicPrefs({ inputGainDb: prefs.inputGainDb - 3 })}
            onUp={() => engine.setMicPrefs({ inputGainDb: prefs.inputGainDb + 3 })}
          />

          <View style={{ gap: 8 }}>
            <T weight={600} size={13} tone="muted">
              How far the music dips when you talk
            </T>
            <Segmented value={prefs.duck} onChange={(duck) => engine.setMicPrefs({ duck })} options={DUCKS} />
          </View>

          <View style={{ gap: 8 }}>
            <T weight={600} size={13} tone="muted">
              How fast it dips and comes back
            </T>
            <Segmented
              value={prefs.fade}
              onChange={(fade) => engine.setMicPrefs({ fade })}
              options={[
                { value: 'instant', label: 'Instant' },
                { value: 'smooth', label: 'Smooth' },
                { value: 'slow', label: 'Slow' },
              ]}
            />
          </View>

          <Pressable
            accessibilityRole="switch"
            accessibilityState={{ checked: prefs.broadcastVoice }}
            onPress={() => engine.setMicPrefs({ broadcastVoice: !prefs.broadcastVoice })}
            style={styles.well}
          >
            <View style={{ flex: 1, gap: 2 }}>
              <T weight={600} size={15}>
                Broadcast voice
              </T>
              <T weight={500} size={12} tone="faint">
                Cuts rumble, lifts clarity, evens out your level
              </T>
            </View>
            <Switch on={prefs.broadcastVoice} />
          </Pressable>
        </>
      )}

      <Stepper
        title="Monitor volume"
        sub={snap.monitorEnabled ? 'The music in your ears, never the mic' : 'Turn Monitor on to hear the music'}
        value={`${volume}%`}
        canDown={snap.monitorEnabled && volume > 0}
        canUp={snap.monitorEnabled && volume < 100}
        onDown={() => engine.setMonitorVolume((volume - 10) / 100)}
        onUp={() => engine.setMonitorVolume((volume + 10) / 100)}
      />

      <Button label="Done" height={54} onPress={onClose} />
    </Overlay>
  );
}

function Stepper({
  title,
  sub,
  value,
  canDown,
  canUp,
  onDown,
  onUp,
}: {
  title: string;
  sub: string;
  value: string;
  canDown: boolean;
  canUp: boolean;
  onDown: () => void;
  onUp: () => void;
}) {
  return (
    <View style={styles.well}>
      <View style={{ flex: 1, gap: 2 }}>
        <T weight={600} size={15}>
          {title}
        </T>
        <T weight={500} size={12} tone="faint">
          {sub}
        </T>
      </View>
      <View style={styles.stepper}>
        <StepButton label="−" a11y={`Lower ${title.toLowerCase()}`} disabled={!canDown} onPress={onDown} />
        <T mono weight={600} size={15} style={{ width: 66, textAlign: 'center' }}>
          {value}
        </T>
        <StepButton label="+" a11y={`Raise ${title.toLowerCase()}`} disabled={!canUp} onPress={onUp} />
      </View>
    </View>
  );
}

function StepButton({ label, a11y, disabled, onPress }: { label: string; a11y: string; disabled: boolean; onPress: () => void }) {
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={a11y}
      disabled={disabled}
      onPress={onPress}
      style={({ pressed }) => [styles.step, pressed && { opacity: 0.7 }, disabled && { opacity: 0.35 }]}
    >
      <T weight={600} size={20}>
        {label}
      </T>
    </Pressable>
  );
}

// ── End ──

export type AfterEnd = 'autodj' | 'silence' | 'off_air';

/**
 * What ending does depends on the plan and the rotation: without AutoDJ the
 * station goes off air; with AutoDJ but nothing to play it goes silent and
 * switches off; otherwise AutoDJ takes over.
 */
export function EndSheet({
  visible,
  onClose,
  slug,
  autoDjLocked,
  onEnd,
}: {
  visible: boolean;
  onClose: () => void;
  slug: string;
  autoDjLocked: boolean;
  onEnd: (after: AfterEnd) => Promise<void>;
}) {
  const [ending, setEnding] = useState(false);
  const [rotationEmpty, setRotationEmpty] = useState(false);

  useEffect(() => {
    if (!visible || autoDjLocked) return;
    let active = true;
    api<{ data: { playlist_length?: number | null } }>(`/stations/${slug}/status`)
      .then(({ data }) => active && setRotationEmpty(data.playlist_length === 0))
      .catch(() => {});
    return () => {
      active = false;
    };
  }, [visible, autoDjLocked, slug]);

  const after: AfterEnd = autoDjLocked ? 'off_air' : rotationEmpty ? 'silence' : 'autodj';

  return (
    <Overlay visible={visible} onClose={onClose} placement="bottom" dismissable={!ending}>
      <T weight={800} size={28} tracking={-0.03} style={{ lineHeight: 30 }}>
        End the broadcast?
      </T>
      <T weight={400} size={15} tone="muted" lineHeight={1.45}>
        {after === 'off_air'
          ? 'Your station goes off air. Listeners will hear silence until you’re back.'
          : after === 'silence'
            ? 'AutoDJ takes over, but your library is empty, so the station goes quiet and switches off in a few minutes.'
            : 'AutoDJ takes over straight away, so listeners keep hearing music.'}
      </T>
      <View style={{ gap: 8 }}>
        <Button
          label={ending ? 'Ending…' : 'End broadcast'}
          variant="live"
          busy={ending}
          onPress={async () => {
            setEnding(true);
            try {
              await onEnd(after);
            } finally {
              setEnding(false);
            }
          }}
        />
        <Button label="Keep going" variant="subtle" height={54} disabled={ending} onPress={onClose} />
      </View>
    </Overlay>
  );
}

const styles = StyleSheet.create({
  queueHead: { flexDirection: 'row', alignItems: 'center', gap: 12 },
  add: { backgroundColor: colors.text, borderRadius: 12, paddingVertical: 10, paddingHorizontal: 14, minWidth: 70, alignItems: 'center' },
  empty: {
    borderWidth: 1.5,
    borderStyle: 'dashed',
    borderColor: colors.dashed,
    borderRadius: 20,
    paddingVertical: 28,
    paddingHorizontal: 20,
  },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    paddingVertical: 10,
    paddingHorizontal: 12,
    borderRadius: 16,
  },
  remove: { width: 30, height: 30, borderRadius: 9, alignItems: 'center', justifyContent: 'center' },
  undo: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    backgroundColor: colors.raised,
    borderRadius: 14,
    paddingLeft: 14,
  },
  well: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    backgroundColor: colors.bg,
    borderRadius: 18,
    paddingVertical: 12,
    paddingHorizontal: 14,
  },
  stepper: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  step: {
    width: 40,
    height: 40,
    borderRadius: 12,
    backgroundColor: colors.raised,
    alignItems: 'center',
    justifyContent: 'center',
  },
});
