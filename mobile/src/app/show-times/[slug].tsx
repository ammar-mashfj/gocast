import { router, useLocalSearchParams } from 'expo-router';
import { useState } from 'react';
import { Pressable, ScrollView, StyleSheet, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { ScheduleEditor, type Entry } from '../../components/station/ScheduleEditor';
import { EmptyNote, ErrorNote, ListSkeleton } from '../../components/station/parts';
import { BackButton, Card, PillButton, T } from '../../components/ui';
import { api } from '../../lib/api';
import { useApiData, type Station } from '../../lib/station';
import { colors } from '../../lib/theme';

/** API weekdays are 0 = Sunday; listed Monday first. */
const SHORT = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
const MONDAY_FIRST = [1, 2, 3, 4, 5, 6, 0];

/**
 * Show times: when you're usually live, shown on your player page. Every plan.
 *
 * Its own screen, reached from the Overview's link card, and NOT a kind of
 * row on the Schedule tab. Show times program nothing — the Schedule tab is
 * AutoDJ's slots — and when the two shared one editor with a
 * "Live show | AutoDJ" switch, Pro owners saved show times expecting them to
 * schedule the station (docs/features/schedule.md).
 *
 * There is no timezone picker on the phone. The web's Station settings is the
 * place to change it; a station that has none yet gets the phone's zone on
 * the first save, the same default the web's picker shows.
 */
export default function ShowTimes() {
  const { slug } = useLocalSearchParams<{ slug: string }>();
  const insets = useSafeAreaInsets();
  const { data, error, reload } = useApiData<{ data: Station }>(`/stations/${slug}`);
  const [editing, setEditing] = useState<Entry | null>(null);
  const station = data?.data ?? null;
  const shows = station?.schedules ?? [];

  const write = async (next: Entry, remove: boolean) => {
    if (!station || next.kind !== 'show') return;
    const timezone = station.timezone ?? Intl.DateTimeFormat().resolvedOptions().timeZone;
    const all = shows.map((s) => ({ label: s.label, days: s.days, start_time: s.start_time }));
    const row = { label: next.label.trim() || null, days: next.days, start_time: next.start };
    if (next.index === null) all.push(row);
    else if (remove) all.splice(next.index, 1);
    else all[next.index] = row;
    await api(`/stations/${slug}/schedules`, { method: 'PUT', body: { timezone, schedules: all } });
    await reload();
    setEditing(null);
  };

  return (
    <View style={[styles.screen, { paddingTop: insets.top }]}>
      <View style={styles.top}>
        <BackButton onPress={() => (router.canGoBack() ? router.back() : router.replace('/'))} />
        <T weight={700} size={19} tracking={-0.02} style={{ flex: 1 }}>
          Show times
        </T>
        {!!station && (
          <PillButton
            label="+ Add"
            onPress={() => setEditing({ kind: 'show', index: null, label: '', days: [], start: '20:00' })}
          />
        )}
      </View>

      <ScrollView contentContainerStyle={[styles.body, { paddingBottom: insets.bottom + 22 }]}>
        <T weight={400} size={15} tone="muted" lineHeight={1.45}>
          When you&apos;re usually live. They appear on your player page so listeners know when to come
          back. Nothing starts on its own: you still press Go live.
        </T>

        {!station ? (
          error ? (
            <ErrorNote message={error} onRetry={reload} />
          ) : (
            <ListSkeleton rows={2} />
          )
        ) : shows.length === 0 ? (
          <EmptyNote body="None yet. Add the times you're usually on air." />
        ) : (
          <View style={{ gap: 8 }}>
            {shows.map((s, index) => (
              <Pressable
                key={s.id}
                accessibilityRole="button"
                accessibilityHint="Edit"
                onPress={() =>
                  setEditing({ kind: 'show', index, label: s.label ?? '', days: s.days, start: s.start_time })
                }
              >
                {({ pressed }) => (
                  <Card radius={20} style={[styles.row, pressed && { opacity: 0.75 }]}>
                    <View style={styles.stripe} />
                    <View style={{ flex: 1, gap: 4 }}>
                      <T mono weight={500} size={12} tone="muted">
                        {s.start_time}
                      </T>
                      <T weight={700} size={17} numberOfLines={1}>
                        {s.label || 'Show time'}
                      </T>
                      <T weight={500} size={13} tone="faint" numberOfLines={1}>
                        {MONDAY_FIRST.filter((d) => s.days.includes(d))
                          .map((d) => SHORT[d])
                          .join(', ')}
                      </T>
                    </View>
                  </Card>
                )}
              </Pressable>
            ))}
          </View>
        )}

        {!!station?.timezone && (
          <T weight={500} size={12} tone="faint" style={{ textAlign: 'center' }}>
            Times are in {station.timezone}. Change it in Station settings on the web.
          </T>
        )}
      </ScrollView>

      <ScheduleEditor
        entry={editing}
        playlists={[]}
        onClose={() => setEditing(null)}
        onSave={(e) => write(e, false)}
        onDelete={(e) => write(e, true)}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.bg },
  top: { height: 52, flexDirection: 'row', alignItems: 'center', gap: 4, paddingLeft: 8, paddingRight: 18 },
  body: { paddingHorizontal: 18, paddingTop: 8, gap: 16 },
  row: { flexDirection: 'row', gap: 14, alignItems: 'stretch' },
  stripe: { width: 4, borderRadius: 2, backgroundColor: colors.live },
});
