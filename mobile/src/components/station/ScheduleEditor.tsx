import { DateTimePicker, Host } from '@expo/ui/jetpack-compose';
import { IconCheck } from '@tabler/icons-react-native';
import { useEffect, useState } from 'react';
import { Pressable, ScrollView, StyleSheet, View } from 'react-native';

import { trackCount, type Playlist } from '../../lib/station';
import { colors, SWATCHES } from '../../lib/theme';
import { Overlay } from '../Overlay';
import { Button, T, TextField } from '../ui';

/** One row of the week, as the editor handles it. `index` is its place in the saved list; null when new. */
export type Entry =
  | { kind: 'show'; index: number | null; label: string; days: number[]; start: string }
  | {
      kind: 'slot';
      index: number | null;
      label: string;
      days: number[];
      start: string;
      end: string;
      playlistId: string;
    };

/** Monday first, as the week strip; values are the API's (0 = Sunday). */
const DAYS = [
  { value: 1, short: 'M', name: 'Monday' },
  { value: 2, short: 'T', name: 'Tuesday' },
  { value: 3, short: 'W', name: 'Wednesday' },
  { value: 4, short: 'T', name: 'Thursday' },
  { value: 5, short: 'F', name: 'Friday' },
  { value: 6, short: 'S', name: 'Saturday' },
  { value: 0, short: 'S', name: 'Sunday' },
];

type Field = 'start' | 'end';

/**
 * Add or edit a show time (coral: when you say you're live, shown on the
 * player page) or an AutoDJ slot (violet: which playlist plays when). The
 * caller decides which — the Show times screen opens shows, the Schedule tab
 * opens slots — and there is deliberately no switch between them: a
 * "Live show | AutoDJ" picker made show times look like programming, and Pro
 * owners saved them expecting AutoDJ to follow (docs/features/schedule.md).
 * Times use Android's own clock dial, coloured to match. Saving is the
 * parent's job, since the API replaces the whole list in one write.
 */
export function ScheduleEditor({
  entry,
  playlists,
  onClose,
  onSave,
  onDelete,
}: {
  /** Null closes the sheet. */
  entry: Entry | null;
  playlists: Playlist[];
  onClose: () => void;
  onSave: (entry: Entry) => Promise<void>;
  onDelete: (entry: Entry) => Promise<void>;
}) {
  const [draft, setDraft] = useState<Entry | null>(entry);
  const [field, setField] = useState<Field | null>(null);
  // The dial's starting time, fixed when it opens: the native picker resets
  // itself whenever this changes, so it must not follow every turn.
  const [seed, setSeed] = useState<string | null>(null);
  const [busy, setBusy] = useState<'save' | 'delete' | null>(null);
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- a new entry resets the sheet
    setDraft(entry);
    setField(null);
    setConfirmDelete(false);
    setError(null);
  }, [entry]);

  if (!draft) return null;

  const isNew = draft.index === null;
  const accent = draft.kind === 'show' ? colors.live : colors.autodj;
  const noun = draft.kind === 'show' ? 'show time' : 'AutoDJ slot';

  const update = (patch: Partial<Entry>) => setDraft((d) => (d ? ({ ...d, ...patch } as Entry) : d));

  const openField = (f: Field) => {
    if (field === f) return setField(null);
    setSeed(f === 'start' ? draft.start : draft.kind === 'slot' ? draft.end : draft.start);
    setField(f);
  };

  const toggleDay = (day: number) =>
    update({ days: draft.days.includes(day) ? draft.days.filter((d) => d !== day) : [...draft.days, day] });

  const run = async (kind: 'save' | 'delete') => {
    if (kind === 'save' && draft.days.length === 0) return setError('Pick at least one day.');
    if (kind === 'save' && draft.kind === 'slot' && draft.start === draft.end)
      return setError('The slot needs to end at a different time than it starts.');
    setBusy(kind);
    setError(null);
    try {
      await (kind === 'save' ? onSave(draft) : onDelete(draft));
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
      setConfirmDelete(false);
    } finally {
      setBusy(null);
    }
  };

  const overnight = draft.kind === 'slot' && draft.end <= draft.start;

  return (
    <Overlay visible onClose={onClose} placement="bottom" dismissable={busy === null}>
      <ScrollView
        style={{ flexGrow: 0 }}
        contentContainerStyle={{ gap: 18 }}
        keyboardShouldPersistTaps="handled"
        showsVerticalScrollIndicator={false}
      >
        <T weight={800} size={24} tracking={-0.03}>
          {isNew ? `New ${noun}` : `Edit ${noun}`}
        </T>

        <T weight={400} size={14} tone="muted" lineHeight={1.45}>
          {draft.kind === 'show'
            ? 'Tells listeners when to tune in: it shows on your player page. Nothing starts on its own; you still press Go live.'
            : 'What AutoDJ plays while you’re not live. It switches at the next track break, so it can start a minute or two late. Going live always takes over.'}
        </T>

        <TextField
          label="Name"
          placeholder={draft.kind === 'show' ? 'Late Night Live' : 'Optional, the playlist name otherwise'}
          value={draft.label}
          maxLength={60}
          onChangeText={(label) => update({ label })}
        />

        <View style={{ gap: 10 }}>
          <T weight={600} size={13} tone="muted">
            Days
          </T>
          <View style={styles.days}>
            {DAYS.map((d) => {
              const on = draft.days.includes(d.value);
              return (
                <Pressable
                  key={d.value}
                  accessibilityRole="checkbox"
                  accessibilityState={{ checked: on }}
                  accessibilityLabel={d.name}
                  onPress={() => toggleDay(d.value)}
                  style={[styles.day, on ? { backgroundColor: accent } : { backgroundColor: colors.bg }]}
                >
                  <T weight={700} size={15} style={{ color: on ? colors.bg : colors.muted }}>
                    {d.short}
                  </T>
                </Pressable>
              );
            })}
          </View>
        </View>

        <View style={{ gap: 10 }}>
          <View style={styles.times}>
            <TimeWell
              label={draft.kind === 'show' ? 'Goes live at' : 'Starts'}
              value={draft.start}
              active={field === 'start'}
              accent={accent}
              onPress={() => openField('start')}
            />
            {draft.kind === 'slot' && (
              <TimeWell
                label={overnight ? 'Ends (next day)' : 'Ends'}
                value={draft.end}
                active={field === 'end'}
                accent={accent}
                onPress={() => openField('end')}
              />
            )}
          </View>
          {field && seed && (
            <View style={styles.dial}>
              <Host matchContents style={{ alignSelf: 'center' }}>
                <DateTimePicker
                  // Remounted per field, so each opens on its own time.
                  key={field}
                  displayedComponents="hourAndMinute"
                  variant="picker"
                  is24Hour
                  initialDate={seedDate(seed)}
                  onDateSelected={(date) => update(field === 'start' ? { start: hhmm(date) } : { end: hhmm(date) })}
                  elementColors={{
                    containerColor: colors.sheet,
                    clockDialColor: colors.bg,
                    selectorColor: accent,
                    clockDialSelectedContentColor: colors.bg,
                    clockDialUnselectedContentColor: colors.text,
                    timeSelectorSelectedContainerColor: accent,
                    timeSelectorSelectedContentColor: colors.bg,
                    timeSelectorUnselectedContainerColor: colors.card,
                    timeSelectorUnselectedContentColor: colors.text,
                  }}
                />
              </Host>
            </View>
          )}
        </View>

        {draft.kind === 'slot' && (
          <View style={{ gap: 10 }}>
            <T weight={600} size={13} tone="muted">
              Playlist
            </T>
            <View style={styles.playlists}>
              {playlists.map((p, i) => {
                const on = draft.playlistId === p.id;
                return (
                  <Pressable
                    key={p.id}
                    accessibilityRole="radio"
                    accessibilityState={{ checked: on }}
                    onPress={() => update({ playlistId: p.id })}
                    style={[styles.playlist, on && { borderColor: colors.autodj }]}
                  >
                    <View style={[styles.swatch, { backgroundColor: SWATCHES[i % SWATCHES.length] }]} />
                    <View style={{ flex: 1, gap: 2 }}>
                      <T weight={600} size={15} numberOfLines={1}>
                        {p.name}
                      </T>
                      <T mono weight={500} size={11} tone="faint">
                        {trackCount(p.track_count ?? 0)} · {p.order === 'shuffle' ? 'shuffle' : 'in order'}
                      </T>
                    </View>
                    {on && <IconCheck size={18} color={colors.autodj} strokeWidth={2.5} />}
                  </Pressable>
                );
              })}
            </View>
          </View>
        )}

        {!!error && (
          <T weight={600} size={13} tone="liveText" lineHeight={1.4} accessibilityRole="alert">
            {error}
          </T>
        )}

        {confirmDelete ? (
          <View style={{ gap: 8 }}>
            <T weight={700} size={16}>
              Delete this {noun}?
            </T>
            <Button label="Delete" variant="live" busy={busy === 'delete'} onPress={() => run('delete')} />
            <Button label="Keep it" variant="subtle" height={54} onPress={() => setConfirmDelete(false)} />
          </View>
        ) : (
          <View style={{ gap: 8 }}>
            <Button label={isNew ? `Add ${noun}` : 'Save'} busy={busy === 'save'} onPress={() => run('save')} />
            {!isNew && (
              <Pressable accessibilityRole="button" onPress={() => setConfirmDelete(true)} style={styles.delete}>
                <T weight={600} size={14} tone="liveText">
                  Delete {noun}
                </T>
              </Pressable>
            )}
          </View>
        )}
      </ScrollView>
    </Overlay>
  );
}

function TimeWell({
  label,
  value,
  active,
  accent,
  onPress,
}: {
  label: string;
  value: string;
  active: boolean;
  accent: string;
  onPress: () => void;
}) {
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={`${label} ${value}. Change`}
      accessibilityState={{ expanded: active }}
      onPress={onPress}
      style={[styles.well, { borderColor: active ? accent : 'transparent' }]}
    >
      <T weight={600} size={12} tone="muted">
        {label}
      </T>
      <T mono weight={600} size={26} tracking={-0.03} style={{ color: active ? accent : colors.text }}>
        {value}
      </T>
    </Pressable>
  );
}

/** "22:00" → today at 22:00 local, which is how the dial reads it. */
function seedDate(time: string): string {
  const [h, m] = time.split(':').map(Number);
  const d = new Date();
  d.setHours(h ?? 0, m ?? 0, 0, 0);
  return d.toISOString();
}

function hhmm(date: Date): string {
  return `${String(date.getHours()).padStart(2, '0')}:${String(date.getMinutes()).padStart(2, '0')}`;
}

export function addHours(time: string, hours: number): string {
  const [h, m] = time.split(':').map(Number);
  return `${String(((h ?? 0) + hours) % 24).padStart(2, '0')}:${String(m ?? 0).padStart(2, '0')}`;
}

const styles = StyleSheet.create({
  days: { flexDirection: 'row', justifyContent: 'space-between' },
  day: { width: 40, height: 40, borderRadius: 20, alignItems: 'center', justifyContent: 'center' },
  times: { flexDirection: 'row', gap: 8 },
  well: { flex: 1, gap: 4, backgroundColor: colors.bg, borderRadius: 18, borderWidth: 1.5, padding: 14 },
  dial: { backgroundColor: colors.sheet, borderRadius: 24, paddingVertical: 8, alignItems: 'center' },
  playlists: { gap: 6 },
  playlist: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    backgroundColor: colors.bg,
    borderRadius: 16,
    borderWidth: 1.5,
    borderColor: 'transparent',
    padding: 12,
  },
  swatch: { width: 32, height: 32, borderRadius: 9 },
  delete: { alignItems: 'center', paddingVertical: 12 },
});
