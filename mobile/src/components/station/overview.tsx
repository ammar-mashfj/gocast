import { router } from 'expo-router';
import { Pressable, StyleSheet, View } from 'react-native';

import { useBroadcast } from '../../broadcast/BroadcastContext';
import { formatClock } from '../../broadcast/hooks';
import { useAutoDjLocked } from '../../lib/auth';
import { SOURCE_LABEL, useTicker, type Station, type StationStatus, type StreamSession } from '../../lib/station';
import { colors } from '../../lib/theme';
import { openWeb, shareStation, webUrl } from '../../lib/web';
import { StationArt } from '../StationArt';
import { Button, Card, Divided, Progress, StateLabel, T, TextLink } from '../ui';
import { mmss } from '../studio/model';
import { RowsSkeleton, StatTile, TileRow } from './parts';
import type { Power } from './usePower';

/**
 * The cards of a station's Overview tab, top to bottom: what the station is
 * doing now, its numbers, its link, its recent shows, and the quiet
 * turn-off at the foot. The tab (app/station/[slug]/index.tsx) loads the
 * data and lays these out.
 */

// ── The hero: what the station is doing, and the one thing to do next ──

export function Hero({
  station,
  status,
  receivedAt,
  statusFailed,
  openSession,
  running,
  liveHere,
  attached,
  listeners,
  power,
}: {
  station: Station;
  status: StationStatus | null;
  receivedAt: number;
  statusFailed: boolean;
  openSession: StreamSession | null;
  running: boolean;
  liveHere: boolean;
  attached: boolean;
  /** Listening now: this phone's own count when live from here, else the page's poll. */
  listeners: number | null;
  power: Power;
}) {
  const broadcast = useBroadcast();
  const autoDjLocked = useAutoDjLocked();
  const now = useTicker(1000);
  const state = status?.state ?? station.state;
  const actionError = power.error;

  const goLive = () => router.push({ pathname: '/live/[slug]', params: { slug: station.slug, name: station.name } });

  const errorLine = !!actionError && (
    <T weight={600} size={13} tone={attached ? 'liveInk' : 'liveText'} lineHeight={1.4}>
      {actionError}
    </T>
  );

  let card;
  if (attached) {
    // Someone is on air: this phone, another browser, or an encoder.
    const since = liveHere ? broadcast.liveSince : openSession ? Date.parse(openSession.started_at) : null;
    const peak = liveHere ? broadcast.session.peakListeners : openSession?.peak_listeners;
    card = (
      <View style={[styles.hero, { backgroundColor: colors.live, gap: 16 }]}>
        <StateLabel label={liveSourceLabel(status, liveHere)} color={colors.liveInk} weight={700} />
        {since ? (
          <T mono weight={700} size={48} tracking={-0.03} tone="liveInk" style={{ lineHeight: 50 }}>
            {formatClock((now - since) / 1000)}
          </T>
        ) : null}
        <T weight={500} size={14} tone="liveInk">
          {listeners === null ? 'Counting listeners…' : `${listeners} listening now`}
          {peak != null ? ` · peak ${Math.max(peak, listeners ?? 0)}` : ''}
        </T>
        {errorLine}
        {liveHere ? (
          <Button
            label="Open studio"
            variant="liveInk"
            height={54}
            radius={16}
            onPress={() => router.push({ pathname: '/studio/[slug]', params: { slug: station.slug } })}
          />
        ) : (
          <Button
            label="Hear your stream"
            variant="liveInk"
            height={54}
            radius={16}
            onPress={() => openWeb(`/station/${station.slug}`)}
          />
        )}
      </View>
    );
  } else if (running) {
    const label =
      state === 'degraded'
        ? 'NOT REACHING LISTENERS'
        : state === 'starting'
          ? 'STARTING…'
          : !status
            ? statusFailed
              ? 'STATUS UNKNOWN'
              : 'CHECKING…'
            : !status.reachable
              ? 'STATUS UNKNOWN'
              : status.source === 'silence'
                ? 'NO SOUND'
                : status.source === 'live'
                  ? 'HANDING BACK TO AUTODJ'
                  : 'ON AIR · AUTODJ';
    const warn = state === 'degraded' || status?.source === 'silence';
    card = (
      <View style={[styles.hero, { backgroundColor: colors.autodjCard, gap: 18 }]}>
        <View style={styles.heroTop}>
          <StateLabel
            label={label}
            color={warn ? colors.proText : colors.autodjText}
            dotColor={warn ? colors.pro : colors.autodj}
          />
          {listeners !== null && (
            <T mono weight={500} size={12} tone="muted">
              {listeners} listening
            </T>
          )}
        </View>
        <AutoDjTrack station={station} status={status} receivedAt={receivedAt} now={now} />
        {errorLine}
        <View style={{ gap: 8 }}>
          <Button label="Go live" size={17} dot={colors.live} onPress={goLive} />
          <T weight={500} size={13} tone="muted" style={{ textAlign: 'center' }}>
            AutoDJ hands over when you start, and takes back when you end.
          </T>
        </View>
      </View>
    );
  } else {
    card = (
      <View style={[styles.hero, { backgroundColor: colors.card, gap: 16 }]}>
        <StateLabel label="OFF AIR" color={colors.muted} dotColor={colors.faint} />
        <T weight={800} size={30} tracking={-0.03} style={{ lineHeight: 32 }}>
          Nothing&apos;s playing right now.
        </T>
        <T weight={400} size={15} tone="muted" lineHeight={1.45}>
          {autoDjLocked
            ? 'Your station plays while you’re live. AutoDJ, which keeps it going between shows, is Pro.'
            : 'Go live, or start AutoDJ to keep your library playing.'}
        </T>
        {errorLine}
        <Button label="Go live" size={17} dot={colors.live} onPress={goLive} />
        {!autoDjLocked && (
          <Button
            label="Start AutoDJ"
            variant="autodj"
            height={50}
            radius={16}
            size={15}
            busy={power.busy === 'start'}
            onPress={power.start}
          />
        )}
      </View>
    );
  }

  return card;
}

/** "Turn station off", quiet at the foot of the page. */
export function TurnOff({ busy, disabled, onPress }: { busy: boolean; disabled: boolean; onPress: () => void }) {
  return (
    <Pressable
      accessibilityRole="button"
      disabled={busy || disabled}
      onPress={onPress}
      style={({ pressed }) => [styles.turnOff, pressed && { opacity: 0.6 }, (busy || disabled) && { opacity: 0.45 }]}
    >
      <T weight={600} size={14} tone="muted">
        {busy ? 'Turning off…' : 'Turn station off'}
      </T>
    </Pressable>
  );
}

function liveSourceLabel(status: StationStatus | null, liveHere: boolean): string {
  if (liveHere) return 'LIVE FROM THIS PHONE';
  const ls = status?.live_source;
  if (ls?.type === 'external') return 'LIVE FROM AN ENCODER';
  if (ls?.client) return `LIVE FROM ${ls.client.toUpperCase()}`;
  return 'LIVE FROM ANOTHER DEVICE';
}

function AutoDjTrack({
  station,
  status,
  receivedAt,
  now,
}: {
  station: Station;
  status: StationStatus | null;
  receivedAt: number;
  now: number;
}) {
  const np = status?.now_playing ?? station.now_playing;
  const drift = receivedAt ? Math.max(0, (now - receivedAt) / 1000) : 0;
  const total = status?.elapsed != null && status.remaining != null ? status.elapsed + status.remaining : null;
  const elapsed = status?.elapsed != null && total ? Math.min(total, status.elapsed + drift) : null;

  return (
    <>
      <View style={styles.track}>
        {!!station.artwork_url && (
          <StationArt name={station.name} slug={station.slug} url={station.artwork_url} size={68} />
        )}
        <View style={{ flex: 1, minWidth: 0, gap: 4 }}>
          <T weight={700} size={21} tracking={-0.02} numberOfLines={2} style={{ lineHeight: 24 }}>
            {np?.title || (status?.source === 'silence' ? 'Nothing is playing' : 'Waiting for the first track')}
          </T>
          {!!np?.artist && (
            <T weight={500} size={15} tone="muted" numberOfLines={1}>
              {np.artist}
            </T>
          )}
        </View>
      </View>
      {elapsed != null && total != null && total > 0 && (
        <View style={{ gap: 7 }}>
          <Progress fraction={elapsed / total} color={colors.autodj} />
          <View style={styles.times}>
            <T mono weight={500} size={12} tone="faint">
              {mmss(elapsed)}
            </T>
            <T mono weight={500} size={12} tone="faint">
              −{mmss(total - elapsed)}
            </T>
          </View>
        </View>
      )}
    </>
  );
}

// ── Numbers ──

export function Stats({ station, listeners }: { station: Station; listeners: number | null }) {
  const stats = station.stats;
  const airtime = stats?.total_airtime_seconds ?? 0;
  const hours = Math.floor(airtime / 3600);

  return (
    <TileRow>
      <StatTile label="LISTENING" value={listeners === null ? '–' : String(listeners)} note={`peak ${stats?.peak_listeners ?? 0}`} />
      <StatTile label="SHOWS" value={String(stats?.sessions ?? 0)} note="all time" />
      <StatTile
        label="AIRTIME"
        value={hours > 0 ? `${hours}h` : `${Math.round(airtime / 60)}m`}
        note={hours > 0 ? `${Math.round((airtime % 3600) / 60)} min` : 'live, all time'}
      />
    </TileRow>
  );
}

// ── Your link ──

export function LinkCard({ station }: { station: Station }) {
  const url = webUrl(`/station/${station.slug}`).replace(/^https?:\/\//, '');
  return (
    <Card style={{ gap: 12 }}>
      <T weight={700} size={16}>
        Your link
      </T>
      <View style={{ flexDirection: 'row', gap: 8 }}>
        <Pressable
          accessibilityRole="link"
          onPress={() => openWeb(`/station/${station.slug}`)}
          style={styles.urlWell}
        >
          <T mono weight={500} size={14} numberOfLines={1}>
            {url}
          </T>
        </Pressable>
        <Button
          label="Share"
          height={48}
          radius={14}
          size={14}
          style={{ paddingHorizontal: 16 }}
          onPress={() => shareStation(station.slug, station.name)}
        />
      </View>
      <T weight={400} size={13} tone="faint">
        Listeners open it in any browser. No app, no account.
      </T>
      {/* Show times are what the player page says about when you're on, so
          they are reached from here and not from the Schedule tab, which is
          AutoDJ's (docs/features/schedule.md). */}
      <Pressable
        accessibilityRole="button"
        onPress={() => router.push({ pathname: '/show-times/[slug]', params: { slug: station.slug } })}
        style={({ pressed }) => [styles.showTimes, pressed && { opacity: 0.7 }]}
      >
        <View style={{ flex: 1, gap: 2 }}>
          <T weight={600} size={15}>
            Show times
          </T>
          <T weight={400} size={13} tone="faint">
            {showTimesSummary(station)}
          </T>
        </View>
        <T weight={600} size={18} tone="muted">
          ›
        </T>
      </Pressable>
    </Card>
  );
}

/** "None yet" or "2 on your player page". */
function showTimesSummary(station: Station): string {
  const count = station.schedules?.length ?? 0;
  if (count === 0) return 'None yet. Tell listeners when you\'re usually on.';
  return `${count} on your player page`;
}

// ── Recent shows ──

export function RecentShows({ sessions, total, slug }: { sessions: StreamSession[] | null; total: number; slug: string }) {
  const finished = (sessions ?? []).filter((s) => s.ended_at).slice(0, 4);
  const length = (s: StreamSession) => (Date.parse(s.ended_at!) - Date.parse(s.started_at)) / 1000;
  const longest = Math.max(1, ...finished.map(length));

  return (
    <Card style={{ paddingVertical: 6 }}>
      <View style={styles.recentHead}>
        <T weight={700} size={16}>
          Recent shows
        </T>
        {total > finished.length && (
          <TextLink label={`All ${total}`} onPress={() => openWeb(`/dashboard/stations/${slug}`)} />
        )}
      </View>
      {sessions === null ? (
        <View style={{ paddingBottom: 8 }}>
          <RowsSkeleton count={3} />
        </View>
      ) : finished.length === 0 ? (
        <Divided first={false} style={{ paddingVertical: 14 }}>
          <T weight={400} size={14} tone="muted" lineHeight={1.45}>
            No shows yet. They appear here after you go live.
          </T>
        </Divided>
      ) : (
        finished.map((s) => (
          <Divided key={s.id} first={false} style={styles.showRow}>
            <View style={{ flex: 1, gap: 3 }}>
              <T weight={600} size={15}>
                {showWhen(s.started_at)}
              </T>
              <T weight={500} size={12} tone="faint">
                {SOURCE_LABEL[s.source_type] ?? s.source_type} · peak {s.peak_listeners}
              </T>
            </View>
            <View style={styles.showBar}>
              <View style={{ height: '100%', width: `${(length(s) / longest) * 100}%`, backgroundColor: colors.live }} />
            </View>
            <T mono weight={500} size={13} style={{ width: 58, textAlign: 'right' }}>
              {hm(length(s))}
            </T>
          </Divided>
        ))
      )}
    </Card>
  );
}

// ── Formatting ──

/** "1h 52m", "58m". */
function hm(seconds: number): string {
  const m = Math.max(0, Math.round(seconds / 60));
  if (m < 60) return `${m}m`;
  return `${Math.floor(m / 60)}h ${String(m % 60).padStart(2, '0')}m`;
}

/** "Today, 22:04", "Yesterday, 22:04", "Sat, 21:10", "12 Sep, 22:00". */
function showWhen(iso: string): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return '';
  const time = d.toLocaleTimeString(undefined, { hour: '2-digit', minute: '2-digit', hour12: false });
  const startOf = (x: Date) => new Date(x.getFullYear(), x.getMonth(), x.getDate()).getTime();
  const days = Math.round((startOf(new Date()) - startOf(d)) / 86_400_000);
  if (days === 0) return `Today, ${time}`;
  if (days === 1) return `Yesterday, ${time}`;
  if (days < 7) return `${d.toLocaleDateString(undefined, { weekday: 'short' })}, ${time}`;
  return `${d.toLocaleDateString(undefined, { day: 'numeric', month: 'short' })}, ${time}`;
}

const styles = StyleSheet.create({
  hero: { borderRadius: 28, padding: 20 },
  heroTop: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 12 },
  track: { flexDirection: 'row', alignItems: 'center', gap: 14 },
  times: { flexDirection: 'row', justifyContent: 'space-between' },
  turnOff: { alignItems: 'center', padding: 10 },
  urlWell: {
    flex: 1,
    minWidth: 0,
    height: 48,
    borderRadius: 14,
    backgroundColor: colors.bg,
    justifyContent: 'center',
    paddingHorizontal: 14,
  },
  showTimes: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    paddingTop: 12,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: colors.line,
  },
  recentHead: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingTop: 12,
    paddingBottom: 8,
  },
  showRow: { flexDirection: 'row', alignItems: 'center', gap: 12, paddingVertical: 12 },
  showBar: { width: 60, height: 5, borderRadius: 3, backgroundColor: colors.track, overflow: 'hidden' },
});
