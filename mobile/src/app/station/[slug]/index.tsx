import { IconPlayerPlayFilled, IconShare } from '@tabler/icons-react-native';
import { router } from 'expo-router';
import { useState } from 'react';
import { Pressable, Share, StyleSheet, View } from 'react-native';

import { useBroadcast } from '../../../broadcast/BroadcastContext';
import { useListeners } from '../../../broadcast/hooks';
import { Overlay } from '../../../components/Overlay';
import { StationArt } from '../../../components/StationArt';
import {
  ErrorNote,
  OverviewSkeleton,
  RowsSkeleton,
  Section,
  StatTile,
  StationScreen,
  TextLink,
  TileGrid,
} from '../../../components/station/parts';
import { Button, Panel, T } from '../../../components/ui';
import { api, ApiError } from '../../../lib/api';
import { useAutoDjLocked } from '../../../lib/auth';
import {
  errorText,
  formatAgo,
  formatDuration,
  SOURCE_LABEL,
  useApiData,
  useStation,
  useStationStatus,
  useTicker,
  type Station,
  type StationStatus,
  type StreamSession,
} from '../../../lib/station';
import { alpha, colors, fonts, radius } from '../../../lib/theme';
import { openWeb, webUrl } from '../../../lib/web';

type Headline = { label: string; tone: 'live' | 'onAir' | 'off' | 'fault' | 'neutral' };

export default function Overview() {
  const { slug, station, error, reload } = useStation();
  const status = useStationStatus(slug);
  const sessions = useApiData<{ data: StreamSession[]; total: number }>(`/stations/${slug}/sessions`);

  if (!station) {
    return error ? (
      <StationScreen onRefresh={reload}>
        <ErrorNote message={error} onRetry={reload} />
      </StationScreen>
    ) : (
      <OverviewSkeleton />
    );
  }

  return (
    <StationScreen onRefresh={() => Promise.all([reload(), status.refresh(), sessions.reload()])}>
      <ControlStrip
        station={station}
        status={status.status}
        receivedAt={status.receivedAt}
        statusFailed={status.failed}
        onChanged={async () => {
          await Promise.all([reload(), status.refresh()]);
        }}
      />
      <Listening station={station} running={(status.status?.state ?? station.state) !== 'offline'} />
      <ShareCard slug={slug} />
      <Broadcasts sessions={sessions.data?.data ?? null} total={sessions.data?.total ?? 0} station={station} />
    </StationScreen>
  );
}

// ── Control strip: the web's StationPower ──

function ControlStrip({
  station,
  status,
  receivedAt,
  statusFailed,
  onChanged,
}: {
  station: Station;
  status: StationStatus | null;
  receivedAt: number;
  statusFailed: boolean;
  onChanged: () => Promise<void>;
}) {
  const broadcast = useBroadcast();
  const autoDjLocked = useAutoDjLocked();
  const [busy, setBusy] = useState<'start' | 'stop' | null>(null);
  const [actionError, setActionError] = useState<string | null>(null);
  const [confirm, setConfirm] = useState<{ kind: 'off' } | { kind: 'force'; message: string } | null>(null);

  const state = status?.state ?? station.state;
  const running = state !== 'offline';
  const liveHere =
    broadcast.stationSlug === station.slug && (broadcast.state === 'live' || broadcast.state === 'reconnecting');
  const attached =
    running && (liveHere || (!!status?.reachable && (status.broadcaster ?? status.live_source !== null)));

  const headline: Headline =
    state === 'degraded'
      ? { label: 'NOT REACHING LISTENERS', tone: 'fault' }
      : state === 'starting'
        ? { label: 'STARTING…', tone: 'neutral' }
        : attached
          ? { label: 'LIVE', tone: 'live' }
          : !running
            ? { label: 'OFF AIR', tone: 'off' }
            : !status
              ? { label: statusFailed ? 'STATUS UNKNOWN' : 'CHECKING…', tone: 'neutral' }
              : !status.reachable
                ? { label: 'STATUS UNKNOWN', tone: 'neutral' }
                : status.source === 'silence'
                  ? { label: 'NO SOUND', tone: 'fault' }
                  : { label: 'ON AIR', tone: 'onAir' };

  const source = sourceChip(status, attached, liveHere);

  const start = async () => {
    setBusy('start');
    setActionError(null);
    try {
      await api(`/stations/${station.slug}/start`, { method: 'POST' });
      await onChanged();
    } catch (err) {
      setActionError(errorText(err));
    } finally {
      setBusy(null);
    }
  };

  const stop = async (force = false) => {
    setBusy('stop');
    setActionError(null);
    try {
      await api(`/stations/${station.slug}/stop`, { method: 'POST', body: force ? { force: true } : undefined });
      setConfirm(null);
      await onChanged();
    } catch (err) {
      const code = err instanceof ApiError ? (err.body as { code?: string } | null)?.code : undefined;
      if (code === 'station_is_live_external' && !force) setConfirm({ kind: 'force', message: errorText(err) });
      else {
        setConfirm(null);
        setActionError(errorText(err));
      }
    } finally {
      setBusy(null);
    }
  };

  const goLive = () =>
    router.push({ pathname: '/live/[slug]', params: { slug: station.slug, name: station.name } });
  const openStudio = () => router.push({ pathname: '/studio/[slug]', params: { slug: station.slug } });

  // Which buttons, by the web's rules (StationPower.tsx). Free never sees Start AutoDJ.
  let primary: { label: string; onPress: () => void; busy?: boolean } | null = null;
  let secondary: { label: string; onPress: () => void; busy?: boolean; disabled?: boolean } | null = null;
  if (liveHere) primary = { label: 'Open studio', onPress: openStudio };
  else if (attached) primary = { label: 'Hear your stream', onPress: () => openWeb(`/station/${station.slug}`) };
  else if (running) primary = { label: 'Go live', onPress: goLive };
  else if (autoDjLocked) primary = { label: 'Go live', onPress: goLive };
  else primary = { label: 'Start AutoDJ', onPress: start, busy: busy === 'start' };

  const liveFromAnotherBrowser = attached && !liveHere && status?.live_source?.type === 'browser';
  if (running && !liveHere && !liveFromAnotherBrowser) {
    secondary = {
      label: 'Turn station off',
      busy: busy === 'stop',
      disabled: !status,
      onPress: () =>
        headline.tone === 'onAir' && status?.source === 'autodj' ? setConfirm({ kind: 'off' }) : stop(),
    };
  } else if (!running && !autoDjLocked) {
    secondary = { label: 'Go live', onPress: goLive };
  }

  return (
    <Panel style={[styles.strip, stripEdge(headline.tone)]}>
      <View style={styles.stripHead}>
        <StationArt name={station.name} url={station.artwork_url} lit={running} size={52} />
        <View style={{ flex: 1, gap: 6 }}>
          <StatePill headline={headline} />
          {!!source && (
            <T tone="muted" size={13} numberOfLines={1}>
              {source}
            </T>
          )}
        </View>
      </View>

      {running && <NowPlaying station={station} status={status} receivedAt={receivedAt} />}

      {!running && (
        <T tone="muted" size={14} style={{ lineHeight: 20 }}>
          {autoDjLocked
            ? 'Nothing is playing. Go live and your station comes on air with you.'
            : 'Nothing is playing. Start AutoDJ to play your library, or go live.'}
        </T>
      )}

      {!!actionError && (
        <T tone="fault" size={13} style={{ lineHeight: 19 }}>
          {actionError}
        </T>
      )}

      <View style={{ gap: 10 }}>
        {primary && (
          <Button label={primary.label} variant="primary" busy={primary.busy} onPress={primary.onPress} />
        )}
        {secondary && (
          <Button
            label={secondary.label}
            busy={secondary.busy}
            disabled={secondary.disabled}
            onPress={secondary.onPress}
          />
        )}
      </View>

      <Overlay visible={!!confirm} onClose={() => setConfirm(null)} dismissable={busy === null}>
        <T size={17} weight="semibold">
          {confirm?.kind === 'force' ? 'Cut the broadcast off?' : `Turn ${station.name} off?`}
        </T>
        <T tone="muted" size={14} style={{ lineHeight: 21 }}>
          {confirm?.kind === 'force'
            ? confirm.message
            : 'AutoDJ stops and listeners hear nothing until you go live or start it again.'}
        </T>
        <View style={{ flexDirection: 'row', gap: 10, marginTop: 4 }}>
          <Button label="Cancel" onPress={() => setConfirm(null)} style={{ flex: 1 }} />
          <Button
            label={confirm?.kind === 'force' ? 'Cut it off' : 'Turn off'}
            variant="destructive"
            busy={busy === 'stop'}
            onPress={() => stop(confirm?.kind === 'force')}
            style={{ flex: 1 }}
          />
        </View>
      </Overlay>
    </Panel>
  );
}

function sourceChip(status: StationStatus | null, attached: boolean, liveHere: boolean): string | null {
  if (liveHere) return 'Live from this phone';
  if (!status) return null;
  if (attached) {
    const ls = status.live_source;
    if (ls?.type === 'external') return 'Live from an encoder';
    if (ls?.client) return `Live from ${ls.client}`;
    return 'Live from another browser';
  }
  if (status.source === 'live') return 'Handing back to AutoDJ';
  if (status.source === 'autodj') return 'AutoDJ';
  if (status.source === 'silence') return 'Silence';
  return null;
}

function StatePill({ headline }: { headline: Headline }) {
  const t = {
    live: { bg: alpha(colors.live, 0.1), text: colors.liveText, border: alpha(colors.live, 0.3) },
    onAir: { bg: alpha(colors.violet, 0.12), text: colors.violetText, border: alpha(colors.violet, 0.35) },
    off: { bg: 'transparent', text: colors.faint, border: alpha('#ffffff', 0.12) },
    fault: { bg: alpha(colors.fault, 0.1), text: colors.faultText, border: alpha(colors.fault, 0.4) },
    neutral: { bg: 'transparent', text: colors.muted, border: alpha('#ffffff', 0.15) },
  }[headline.tone];
  return (
    <View style={[styles.pill, { backgroundColor: t.bg, borderColor: t.border }]}>
      <T style={[styles.pillText, { color: t.text }]}>{headline.label}</T>
    </View>
  );
}

function stripEdge(tone: Headline['tone']) {
  if (tone === 'live') return { borderColor: alpha(colors.live, 0.3) };
  if (tone === 'fault') return { borderColor: alpha(colors.fault, 0.4) };
  return null;
}

function NowPlaying({
  station,
  status,
  receivedAt,
}: {
  station: Station;
  status: StationStatus | null;
  receivedAt: number;
}) {
  const now = useTicker(1000);
  const np = status?.now_playing ?? station.now_playing;
  const title = np?.title || np?.artist ? [np?.title, np?.artist].filter(Boolean).join(' — ') : null;
  const autodj = status?.source === 'autodj';
  const drift = receivedAt ? Math.max(0, (now - receivedAt) / 1000) : 0;
  const elapsed = status?.elapsed != null ? status.elapsed + drift : null;
  const total = status?.elapsed != null && status.remaining != null ? status.elapsed + status.remaining : null;
  const next = status?.up_next[0];

  if (!title) return null;
  return (
    <View style={styles.np}>
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
        <IconPlayerPlayFilled size={12} color={colors.muted} />
        <T tone="muted" size={12}>
          Now playing
        </T>
      </View>
      <T size={16} weight="semibold" numberOfLines={2}>
        {title}
      </T>
      {autodj && elapsed != null && total != null && total > 0 && (
        <View style={{ gap: 6 }}>
          <View style={styles.progressTrack}>
            <View style={[styles.progressFill, { width: `${Math.min(1, elapsed / total) * 100}%` }]} />
          </View>
          <View style={{ flexDirection: 'row', justifyContent: 'space-between' }}>
            <T mono size={11} tone="faint">
              {clock(Math.min(elapsed, total))}
            </T>
            <T mono size={11} tone="faint">
              −{clock(Math.max(0, total - elapsed))}
            </T>
          </View>
        </View>
      )}
      {autodj && next && (
        <T tone="faint" size={12} numberOfLines={1}>
          Up next: {[next.title, next.artist].filter(Boolean).join(' — ')}
        </T>
      )}
    </View>
  );
}

function clock(seconds: number): string {
  const s = Math.max(0, Math.floor(seconds));
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`;
}

// ── Listening now ──

function Listening({ station, running }: { station: Station; running: boolean }) {
  const count = useListeners(running ? station.slug : null);
  const peak = station.stats?.peak_listeners ?? 0;
  return (
    <Section
      title="Listening now"
      action={
        <TextLink
          label="View audience"
          onPress={() => router.navigate({ pathname: '/station/[slug]/audience', params: { slug: station.slug } })}
        />
      }
    >
      <View style={{ flexDirection: 'row', alignItems: 'flex-end', gap: 16 }}>
        <T style={styles.bigCount}>{running ? (count ?? '–') : 0}</T>
        <T tone="muted" size={13} style={{ paddingBottom: 8 }}>
          {running ? 'right now' : 'station is off air'} · peak {peak}
        </T>
      </View>
    </Section>
  );
}

// ── Share ──

function ShareCard({ slug }: { slug: string }) {
  const url = webUrl(`/station/${slug}`);
  return (
    <Section title="Share your station">
      <Pressable onPress={() => openWeb(`/station/${slug}`)} style={styles.linkWell}>
        <T mono size={13} tone="muted" numberOfLines={1}>
          {url.replace(/^https?:\/\//, '')}
        </T>
      </Pressable>
      <View style={{ flexDirection: 'row', gap: 10 }}>
        <Button
          label="Share"
          icon={<IconShare size={18} color={colors.text} />}
          onPress={() => Share.share({ message: url, url })}
          style={{ flex: 1 }}
        />
        <Button
          label="Player page"
          onPress={() => openWeb(`/station/${slug}`)}
          style={{ flex: 1 }}
        />
      </View>
    </Section>
  );
}

// ── Broadcasts ──

function Broadcasts({
  sessions,
  total,
  station,
}: {
  sessions: StreamSession[] | null;
  total: number;
  station: Station;
}) {
  const finished = (sessions ?? []).filter((s) => s.ended_at);
  const stats = station.stats;
  return (
    <>
      {stats && stats.sessions > 0 && (
        <TileGrid>
          <StatTile label="Broadcasts" value={String(stats.sessions)} />
          <StatTile label="Live airtime" value={formatDuration(stats.total_airtime_seconds)} hint="all time" />
        </TileGrid>
      )}
      <Section title="Recent broadcasts">
        {sessions === null ? (
          <RowsSkeleton count={3} />
        ) : finished.length === 0 ? (
          <T tone="muted" size={14} style={{ lineHeight: 20 }}>
            No broadcasts yet. Your shows appear here after you go live.
          </T>
        ) : (
          <View>
            {finished.slice(0, 5).map((s, i) => (
              <View key={s.id} style={[styles.row, i > 0 && styles.rowDivider]}>
                <View style={{ flex: 1, gap: 2 }}>
                  <T size={14}>{formatAgo(s.started_at)}</T>
                  <T tone="faint" size={12}>
                    {SOURCE_LABEL[s.source_type] ?? s.source_type}
                  </T>
                </View>
                <View style={{ alignItems: 'flex-end', gap: 2 }}>
                  <T mono size={13}>
                    {formatDuration((new Date(s.ended_at!).getTime() - new Date(s.started_at).getTime()) / 1000)}
                  </T>
                  <T tone="faint" size={12}>
                    peak {s.peak_listeners}
                  </T>
                </View>
              </View>
            ))}
            {total > 5 && (
              <T tone="faint" size={12} style={{ marginTop: 10 }}>
                Showing your latest 5 of {total}.
              </T>
            )}
          </View>
        )}
      </Section>
    </>
  );
}

const styles = StyleSheet.create({
  strip: { padding: 16, gap: 16 },
  stripHead: { flexDirection: 'row', alignItems: 'center', gap: 14 },
  pill: {
    alignSelf: 'flex-start',
    height: 28,
    paddingHorizontal: 10,
    borderRadius: radius.md,
    borderWidth: 1,
    justifyContent: 'center',
  },
  pillText: { fontFamily: fonts.bold, fontSize: 12, letterSpacing: 1 },
  np: {
    gap: 8,
    padding: 14,
    borderRadius: radius.lg,
    backgroundColor: alpha('#ffffff', 0.03),
    borderWidth: 1,
    borderColor: colors.divider,
  },
  progressTrack: { height: 4, borderRadius: 2, backgroundColor: alpha('#ffffff', 0.08), overflow: 'hidden' },
  progressFill: { height: '100%', backgroundColor: colors.violetText },
  bigCount: {
    fontFamily: fonts.display,
    fontSize: 48,
    lineHeight: 52,
    letterSpacing: -1.2,
    color: colors.text,
    fontVariant: ['tabular-nums'],
  },
  linkWell: {
    paddingHorizontal: 14,
    paddingVertical: 12,
    borderRadius: radius.lg,
    backgroundColor: alpha(colors.bg, 0.6),
    borderWidth: 1,
    borderColor: colors.divider,
  },
  row: { flexDirection: 'row', alignItems: 'center', gap: 12, paddingVertical: 10 },
  rowDivider: { borderTopWidth: 1, borderTopColor: colors.divider },
});
