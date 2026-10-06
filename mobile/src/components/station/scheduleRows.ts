import { trackCount, type Playlist, type Station } from '../../lib/station';
import { colors } from '../../lib/theme';
import { addHours, type Entry } from './ScheduleEditor';

/** One row of the Schedule tab's day list (app/station/[slug]/schedule.tsx). */
export interface Row {
  key: string;
  time: string;
  sort: string;
  title: string;
  sub: string;
  color: string;
  now: boolean;
  /** What tapping the row does; null for the default playlist's all-day row. */
  onPress: (() => void) | null;
}

/**
 * A day's rows, sorted by start: the show times (coral), then, with Pro,
 * the AutoDJ slots (violet), or the default playlist all day when none fall
 * on it.
 */
export function buildRows(
  station: Station,
  playlists: Playlist[],
  weekday: number,
  isToday: boolean,
  pro: boolean,
  edit: (entry: Entry) => void,
  openShowTimes: () => void,
): Row[] {
  const byId = new Map(playlists.map((p) => [p.id, p]));
  const autodjOnAir = station.is_on_air && !station.is_live;
  const describe = (p: Playlist | undefined) =>
    p ? `AutoDJ · ${trackCount(p.track_count ?? 0)} ${p.order === 'shuffle' ? 'on shuffle' : 'in order'}` : 'AutoDJ';

  const rows: Row[] = [];
  (station.schedules ?? []).forEach((s) => {
    if (!s.days.includes(weekday)) return;
    rows.push({
      key: `show-${s.id}`,
      time: s.start_time,
      sort: s.start_time,
      title: s.label || 'Show time',
      sub: 'Show time · on your player page',
      color: colors.live,
      now: false,
      onPress: openShowTimes,
    });
  });

  if (pro) {
    let slotsToday = 0;
    (station.autodj_slots ?? []).forEach((s, index) => {
      if (!s.days.includes(weekday)) return;
      slotsToday++;
      const p = byId.get(s.playlist_id);
      rows.push({
        key: `slot-${s.id}`,
        time: `${s.start_time} – ${s.end_time}${s.start_mode === 'hard' ? ' · on time' : ''}`,
        sort: s.start_time,
        title: s.label || p?.name || 'AutoDJ',
        sub: describe(p),
        color: colors.autodj,
        now: isToday && autodjOnAir && station.programme?.slot_id === s.id,
        onPress: () =>
          edit({
            kind: 'slot',
            index,
            label: s.label ?? '',
            days: s.days,
            start: s.start_time,
            end: s.end_time || addHours(s.start_time, 2),
            playlistId: s.playlist_id,
          }),
      });
    });
    // No slots that day: the default playlist plays around the clock.
    if (slotsToday === 0) {
      const fallback = playlists.find((p) => p.is_default);
      rows.push({
        key: 'default',
        time: 'All day',
        sort: '',
        title: fallback?.name ?? 'Default playlist',
        sub: describe(fallback),
        color: colors.autodj,
        now: isToday && autodjOnAir && !station.programme?.slot_id,
        onPress: null,
      });
    }
  }

  return rows.sort((a, b) => a.sort.localeCompare(b.sort));
}
