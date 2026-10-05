import { router, useFocusEffect } from 'expo-router';
import { useCallback, useState } from 'react';
import { Pressable, StyleSheet, View } from 'react-native';

import { EmptyNote, ErrorNote, ListSkeleton, StationScreen } from '../../../components/station/parts';
import { ScheduleEditor, type Entry } from '../../../components/station/ScheduleEditor';
import { buildRows } from '../../../components/station/scheduleRows';
import { Card, Heading, PillButton, T } from '../../../components/ui';
import { api } from '../../../lib/api';
import { useAutoDjLocked } from '../../../lib/auth';
import { useApiData, useStation, type Playlist } from '../../../lib/station';
import { colors } from '../../../lib/theme';

/** API weekdays are 0 = Sunday; the strip runs Monday to Sunday. */
const WEEK = [1, 2, 3, 4, 5, 6, 0];
const DAY_LABEL = ['SUN', 'MON', 'TUE', 'WED', 'THU', 'FRI', 'SAT'];
const DAY_NAME = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];

/**
 * What AutoDJ plays, day by day (violet, Pro). Tap a slot to change it,
 * + Add for a new one. The API replaces the list whole, so every save sends
 * the full list with the one change.
 *
 * Show times are drawn here read-only (coral) because going live takes over
 * from any slot, but they are edited on their own screen: they only tell
 * listeners when you're on and program nothing. This tab used to add them
 * through a "Live show | AutoDJ" switch, which made them look like
 * scheduling (docs/features/schedule.md).
 */
export default function ScheduleTab() {
  const { slug, station, error, reload } = useStation();
  const autoDjLocked = useAutoDjLocked();
  const playlists = useApiData<{ data: Playlist[] }>(autoDjLocked ? null : `/stations/${slug}/playlists`);
  const today = new Date();
  const [day, setDay] = useState(today.getDay());
  const [editing, setEditing] = useState<Entry | null>(null);

  // Show times are edited on their own screen; pick up what changed there.
  useFocusEffect(
    useCallback(() => {
      reload();
    }, [reload]),
  );

  if (!station) {
    return error ? (
      <StationScreen onRefresh={reload}>
        <ErrorNote message={error} onRetry={reload} />
      </StationScreen>
    ) : (
      <ListSkeleton rows={3} />
    );
  }

  // The dates of this week, Monday first.
  const monday = new Date(today);
  monday.setDate(today.getDate() - ((today.getDay() + 6) % 7));
  const dates = WEEK.map((_, i) => {
    const d = new Date(monday);
    d.setDate(monday.getDate() + i);
    return d;
  });

  const lists = playlists.data?.data ?? [];
  const openShowTimes = () => router.push({ pathname: '/show-times/[slug]', params: { slug } });
  const rows = buildRows(station, lists, day, day === today.getDay(), !autoDjLocked, setEditing, openShowTimes);

  const write = async (next: Entry, remove: boolean) => {
    if (next.kind !== 'slot') return;
    const all = (station.autodj_slots ?? []).map((s) => ({
      label: s.label,
      playlist_id: s.playlist_id,
      days: s.days,
      start_time: s.start_time,
      end_time: s.end_time,
      // Sent back as it was: the API takes a missing mode as 'soft', so
      // leaving it out would quietly turn every on-time slot soft.
      start_mode: s.start_mode ?? 'soft',
    }));
    const row = {
      label: next.label.trim() || null,
      playlist_id: next.playlistId,
      days: next.days,
      start_time: next.start,
      end_time: next.end,
      start_mode: next.startMode,
    };
    if (next.index === null) all.push(row);
    else if (remove) all.splice(next.index, 1);
    else all[next.index] = row;
    // No `timezone`: the API keeps the station's. It is set with the show
    // times, so this screen can never move the clock under them.
    await api(`/stations/${slug}/autodj-slots`, { method: 'PUT', body: { slots: all } });
    await reload();
    setEditing(null);
  };

  const add = () =>
    setEditing({
      kind: 'slot',
      index: null,
      label: '',
      days: [day],
      start: '06:00',
      end: '12:00',
      playlistId: (lists.find((p) => !p.is_default) ?? lists[0])?.id ?? '',
      startMode: 'soft',
    });

  return (
    <>
      <StationScreen onRefresh={() => Promise.all([reload(), playlists.reload()])}>
        <Heading action={autoDjLocked ? undefined : <PillButton label="+ Add" onPress={add} />}>Schedule</Heading>

        <View style={styles.week}>
          {WEEK.map((weekday, i) => {
            const on = weekday === day;
            const hasLive = (station.schedules ?? []).some((s) => s.days.includes(weekday));
            return (
              <Pressable
                key={weekday}
                accessibilityRole="button"
                accessibilityState={{ selected: on }}
                accessibilityLabel={DAY_NAME[weekday]}
                onPress={() => setDay(weekday)}
                style={[styles.day, { backgroundColor: on ? colors.text : colors.card }]}
              >
                <T mono weight={600} size={11} style={{ color: on ? colors.bg : colors.text }}>
                  {DAY_LABEL[weekday]}
                </T>
                <T weight={700} size={18} style={{ color: on ? colors.bg : colors.text, lineHeight: 20 }}>
                  {dates[i]!.getDate()}
                </T>
                <View style={[styles.dayDot, { backgroundColor: hasLive ? colors.live : 'transparent' }]} />
              </Pressable>
            );
          })}
        </View>

        {rows.length === 0 ? (
          <EmptyNote
            body={
              autoDjLocked
                ? 'Scheduling what AutoDJ plays is part of Pro. Your show times are under Show times on the Overview.'
                : `Nothing scheduled on ${DAY_NAME[day]}.`
            }
          />
        ) : (
          <View style={{ gap: 8 }}>
            {rows.map((r) => (
              <Pressable
                key={r.key}
                disabled={!r.onPress}
                accessibilityRole={r.onPress ? 'button' : undefined}
                accessibilityHint={r.onPress ? 'Edit' : undefined}
                onPress={() => r.onPress?.()}
              >
                {({ pressed }) => (
                  <Card radius={20} style={[styles.slot, pressed && { opacity: 0.75 }]}>
                    <View style={[styles.stripe, { backgroundColor: r.color }]} />
                    <View style={{ flex: 1, gap: 4 }}>
                      <T mono weight={500} size={12} tone="muted">
                        {r.time}
                      </T>
                      <T weight={700} size={17} numberOfLines={1}>
                        {r.title}
                      </T>
                      <T weight={500} size={13} tone="faint" numberOfLines={1}>
                        {r.sub}
                      </T>
                    </View>
                    {r.now && (
                      <View style={styles.now}>
                        <T mono weight={600} size={10} tracking={0.08} tone="ink">
                          NOW
                        </T>
                      </View>
                    )}
                  </Card>
                )}
              </Pressable>
            ))}
          </View>
        )}

        {!!station.timezone && (
          <T weight={500} size={12} tone="faint" style={{ textAlign: 'center' }}>
            Times are in {station.timezone}. Change it in Station settings on the web.
          </T>
        )}
      </StationScreen>

      <ScheduleEditor
        entry={editing}
        playlists={lists}
        onClose={() => setEditing(null)}
        onSave={(e) => write(e, false)}
        onDelete={(e) => write(e, true)}
      />
    </>
  );
}

const styles = StyleSheet.create({
  week: { flexDirection: 'row', gap: 6 },
  day: { flex: 1, height: 62, borderRadius: 16, alignItems: 'center', justifyContent: 'center', gap: 4 },
  dayDot: { width: 5, height: 5, borderRadius: 3 },
  slot: { flexDirection: 'row', gap: 14, alignItems: 'stretch' },
  stripe: { width: 4, borderRadius: 2 },
  now: {
    alignSelf: 'flex-start',
    backgroundColor: colors.autodj,
    borderRadius: 6,
    paddingVertical: 4,
    paddingHorizontal: 7,
  },
});
