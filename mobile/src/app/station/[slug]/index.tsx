import { View } from 'react-native';

import { useBroadcast } from '../../../broadcast/BroadcastContext';
import { useListeners } from '../../../broadcast/hooks';
import { Overlay } from '../../../components/Overlay';
import { Hero, LinkCard, RecentShows, Stats, TurnOff } from '../../../components/station/overview';
import { ErrorNote, OverviewSkeleton, StationScreen } from '../../../components/station/parts';
import { usePower } from '../../../components/station/usePower';
import { Button, T } from '../../../components/ui';
import {
  useApiData,
  useStation,
  useStationStatus,
  type Station,
  type StreamSession,
} from '../../../lib/station';

export default function Overview() {
  const { slug, station, error, reload } = useStation();
  const status = useStationStatus(slug);
  const sessions = useApiData<{ data: StreamSession[]; total: number }>(`/stations/${slug}/sessions`, 30_000);

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
    <Loaded
      station={station}
      status={status}
      sessions={sessions}
      onChanged={async () => {
        await Promise.all([reload(), status.refresh(), sessions.reload()]);
      }}
    />
  );
}

function Loaded({
  station,
  status,
  sessions,
  onChanged,
}: {
  station: Station;
  status: ReturnType<typeof useStationStatus>;
  sessions: ReturnType<typeof useApiData<{ data: StreamSession[]; total: number }>>;
  onChanged: () => Promise<void>;
}) {
  const broadcast = useBroadcast();
  const power = usePower(station.slug, onChanged);
  const s = status.status;
  const state = s?.state ?? station.state;
  const running = state !== 'offline';
  const liveHere =
    broadcast.stationSlug === station.slug && (broadcast.state === 'live' || broadcast.state === 'reconnecting');
  const attached = running && (liveHere || (!!s?.reachable && (s.broadcaster ?? s.live_source !== null)));
  const liveFromAnotherBrowser = attached && !liveHere && s?.live_source?.type === 'browser';
  const canTurnOff = running && !liveHere && !liveFromAnotherBrowser;
  // One listener poll for the page: the hero and the tiles both show it.
  // Live from this phone, the broadcast already counts for its own lamp.
  const polled = useListeners(running && !liveHere ? station.slug : null);
  const listeners = liveHere ? broadcast.session.listeners : running ? polled : 0;

  return (
    <StationScreen onRefresh={onChanged}>
      <Hero
        station={station}
        status={s}
        receivedAt={status.receivedAt}
        statusFailed={status.failed}
        openSession={sessions.data?.data.find((x) => !x.ended_at) ?? null}
        running={running}
        liveHere={liveHere}
        attached={attached}
        listeners={listeners}
        power={power}
      />
      <Stats station={station} listeners={listeners} />
      <LinkCard station={station} />
      <RecentShows sessions={sessions.data?.data ?? null} total={sessions.data?.total ?? 0} slug={station.slug} />
      {canTurnOff && (
        <TurnOff
          busy={power.busy === 'stop'}
          disabled={!s}
          onPress={() => (s?.source === 'autodj' && !attached ? power.setConfirm({ kind: 'off' }) : power.stop())}
        />
      )}
      <Overlay
        visible={!!power.confirm}
        onClose={() => power.setConfirm(null)}
        placement="bottom"
        dismissable={power.busy === null}
      >
        <T weight={800} size={28} tracking={-0.03} style={{ lineHeight: 30 }}>
          {power.confirm?.kind === 'force' ? 'Cut the broadcast off?' : `Turn ${station.name} off?`}
        </T>
        <T weight={400} size={15} tone="muted" lineHeight={1.45}>
          {power.confirm?.kind === 'force'
            ? power.confirm.message
            : 'AutoDJ stops and listeners hear nothing until you go live or start it again.'}
        </T>
        <View style={{ gap: 8 }}>
          <Button
            label={power.confirm?.kind === 'force' ? 'Cut it off' : 'Turn off'}
            variant="live"
            busy={power.busy === 'stop'}
            onPress={() => power.stop(power.confirm?.kind === 'force')}
          />
          <Button label="Keep it on" variant="subtle" height={54} onPress={() => power.setConfirm(null)} />
        </View>
      </Overlay>
    </StationScreen>
  );
}
