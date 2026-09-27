import { StyleSheet, View } from 'react-native';

import {
  EditOnWeb,
  ErrorNote,
  ScheduleSkeleton,
  ProTag,
  Section,
  StationScreen,
} from '../../../components/station/parts';
import { Panel, T } from '../../../components/ui';
import { useAutoDjLocked } from '../../../lib/auth';
import {
  formatDays,
  formatWhen,
  useApiData,
  useStation,
  type AutodjSlot,
  type Playlist,
  type StationSchedule,
} from '../../../lib/station';
import { alpha, colors, radius } from '../../../lib/theme';

/**
 * The web's Schedule page, read-only: show times (when you go live) and
 * AutoDJ slots (which playlist plays when). Editing is on the web for now.
 */
export default function ScheduleTab() {
  const { slug, station, error, reload } = useStation();
  const autoDjLocked = useAutoDjLocked();
  const playlists = useApiData<{ data: Playlist[] }>(`/stations/${slug}/playlists`);

  if (!station) {
    return error ? (
      <StationScreen onRefresh={reload}>
        <ErrorNote message={error} onRetry={reload} />
      </StationScreen>
    ) : (
      <ScheduleSkeleton />
    );
  }

  const names = new Map((playlists.data?.data ?? []).map((p) => [p.id, p.name]));
  const shows = sortByWeek(station.schedules ?? []);
  const slots = sortByWeek(station.autodj_slots ?? []);
  const programme = station.programme;

  return (
    <StationScreen onRefresh={() => Promise.all([reload(), playlists.reload()])}>
      {!autoDjLocked && programme && (
        <Panel style={styles.now}>
          <T tone="muted" size={12}>
            AutoDJ right now
          </T>
          <T size={16} weight="semibold">
            {programme.playlist?.name ?? 'Default playlist'}
            {programme.until ? <T tone="muted" size={14}>{`  until ${time(programme.until)}`}</T> : null}
          </T>
          {programme.next && (
            <T tone="faint" size={13}>
              Next: {programme.next.label || programme.next.playlist.name || 'Default playlist'} ·{' '}
              {formatWhen(programme.next.starts_at)}
            </T>
          )}
        </Panel>
      )}

      <Section title="Show times">
        {shows.length === 0 ? (
          <T tone="muted" size={14} style={{ lineHeight: 20 }}>
            No show times yet. Set them so listeners know when you&apos;re live.
          </T>
        ) : (
          shows.map((s, i) => <ShowRow key={s.id} show={s} divider={i > 0} />)
        )}
      </Section>

      <Section
        title="AutoDJ slots"
        action={autoDjLocked ? <ProTag /> : undefined}
      >
        {autoDjLocked ? (
          <T tone="muted" size={14} style={{ lineHeight: 20 }}>
            On Pro, AutoDJ plays a chosen playlist at set times each week, and your default playlist the rest of
            the time.
          </T>
        ) : slots.length === 0 ? (
          <T tone="muted" size={14} style={{ lineHeight: 20 }}>
            No slots. AutoDJ plays your default playlist around the clock.
          </T>
        ) : (
          slots.map((s, i) => (
            <SlotRow
              key={s.id}
              slot={s}
              playlist={names.get(s.playlist_id) ?? '…'}
              current={programme?.slot_id === s.id}
              divider={i > 0}
            />
          ))
        )}
      </Section>

      {!!station.timezone && (
        <T tone="faint" size={12} style={{ textAlign: 'center' }}>
          Times are in <T mono tone="faint" size={12}>{station.timezone}</T>
        </T>
      )}

      <EditOnWeb label="Edit the schedule on the web" path={`/dashboard/stations/${slug}/schedule`} />
    </StationScreen>
  );
}

function ShowRow({ show, divider }: { show: StationSchedule; divider: boolean }) {
  return (
    <View style={[styles.row, divider && styles.divider]}>
      <T mono size={15} style={styles.time}>
        {show.start_time}
      </T>
      <View style={{ flex: 1, gap: 2 }}>
        <T size={14} weight="medium" numberOfLines={1}>
          {show.label || 'Live show'}
        </T>
        <T tone="faint" size={12}>
          {formatDays(show.days)}
          {show.next_occurrence ? ` · next ${formatWhen(show.next_occurrence)}` : ''}
        </T>
      </View>
    </View>
  );
}

function SlotRow({
  slot,
  playlist,
  current,
  divider,
}: {
  slot: AutodjSlot;
  playlist: string;
  current: boolean;
  divider: boolean;
}) {
  const overnight = slot.end_time <= slot.start_time;
  return (
    <View style={[styles.row, divider && styles.divider]}>
      <View style={styles.time}>
        <T mono size={15}>
          {slot.start_time}
        </T>
        <T mono size={12} tone="faint">
          –{slot.end_time}
          {overnight ? '+1' : ''}
        </T>
      </View>
      <View style={{ flex: 1, gap: 2 }}>
        <T size={14} weight="medium" numberOfLines={1}>
          {slot.label || playlist}
        </T>
        <T tone="faint" size={12} numberOfLines={1}>
          {slot.label ? `${playlist} · ` : ''}
          {formatDays(slot.days)}
        </T>
      </View>
      {current && (
        <View style={styles.nowTag}>
          <T tone="violet" size={11} weight="semibold">
            NOW
          </T>
        </View>
      )}
    </View>
  );
}

/** Order by the first day in the week (Monday first), then by start time. */
function sortByWeek<T extends { days: number[]; start_time: string }>(rows: T[]): T[] {
  const key = (d: number) => (d + 6) % 7;
  return [...rows].sort(
    (a, b) =>
      Math.min(...a.days.map(key)) - Math.min(...b.days.map(key)) || a.start_time.localeCompare(b.start_time),
  );
}

function time(iso: string): string {
  const d = new Date(iso);
  return Number.isNaN(d.getTime()) ? '' : d.toLocaleTimeString(undefined, { hour: '2-digit', minute: '2-digit' });
}

const styles = StyleSheet.create({
  now: {
    padding: 16,
    gap: 6,
    borderColor: alpha(colors.violet, 0.3),
    backgroundColor: alpha(colors.violet, 0.06),
  },
  row: { flexDirection: 'row', alignItems: 'center', gap: 14, paddingVertical: 10 },
  divider: { borderTopWidth: 1, borderTopColor: colors.divider },
  time: { width: 64 },
  nowTag: {
    borderWidth: 1,
    borderRadius: radius.full,
    paddingHorizontal: 8,
    paddingVertical: 2,
    borderColor: alpha(colors.violet, 0.3),
    backgroundColor: alpha(colors.violet, 0.1),
  },
});
