import { useState } from 'react';

import { Report } from '../../../components/station/audience';
import { ErrorNote, ListSkeleton, StationScreen, StatTile, TileRow } from '../../../components/station/parts';
import { Button, Card, Heading, Segmented, T } from '../../../components/ui';
import { useApiData, useStation, type Audience } from '../../../lib/station';
import { colors } from '../../../lib/theme';
import { openWeb } from '../../../lib/web';

const RANGES = [7, 30, 90] as const;

/** The web's Audience page: Pro sees the history; Free sees now and the peak. */
export default function AudienceTab() {
  const { slug, station } = useStation();
  const [days, setDays] = useState<number | null>(null);
  const { data, error, reload } = useApiData<{ data: Audience }>(
    `/stations/${slug}/audience${days ? `?days=${days}` : ''}`,
    60_000,
  );
  const audience = data?.data;

  if (!audience) {
    return error ? (
      <StationScreen onRefresh={reload}>
        <ErrorNote message={error} onRetry={reload} />
      </StationScreen>
    ) : (
      <ListSkeleton />
    );
  }

  const ranges = audience.locked ? [] : RANGES.filter((r) => r <= audience.plan_days);
  const range = days ?? audience.range_days;

  return (
    <StationScreen onRefresh={reload}>
      <Heading
        action={
          ranges.length > 1 ? (
            <Segmented
              look="inline"
              surface={colors.card}
              value={range}
              onChange={setDays}
              options={ranges.map((r) => ({ value: r, label: `${r}d` }))}
            />
          ) : undefined
        }
      >
        Audience
      </Heading>

      {audience.locked ? (
        <>
          <TileRow>
            <StatTile
              label="LISTENING NOW"
              value={String(audience.live)}
              note={station?.is_on_air ? 'right now' : 'off air'}
            />
            <StatTile label="PEAK" value={String(audience.peak_all_time)} note="all time" />
          </TileRow>
          <Card radius={24} padding={22} style={{ gap: 12 }}>
            <T mono weight={600} size={11} tone="pro" tracking={0.1}>
              PRO
            </T>
            <T weight={800} size={26} tracking={-0.03} lineHeight={1.1}>
              See who tuned in, from where, for how long.
            </T>
            <T weight={400} size={15} tone="muted" lineHeight={1.45}>
              Listening history by day for 90 days, by country and by device, comes with Pro.
            </T>
            <Button label="Request Pro" variant="pro" height={52} radius={16} size={15} onPress={() => openWeb('/dashboard')} />
          </Card>
        </>
      ) : (
        <Report audience={audience} neverHeard={!station?.stats?.has_listeners && audience.peak_all_time === 0} />
      )}
    </StationScreen>
  );
}
