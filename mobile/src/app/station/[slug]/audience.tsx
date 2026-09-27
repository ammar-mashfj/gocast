import { useState } from 'react';
import { StyleSheet, View } from 'react-native';

import {
  BarRow,
  EditOnWeb,
  ErrorNote,
  AudienceSkeleton,
  ProTag,
  Section,
  StatTile,
  StationScreen,
  TileGrid,
} from '../../../components/station/parts';
import { Panel, Segmented, T } from '../../../components/ui';
import {
  formatDuration,
  useApiData,
  useStation,
  type Audience,
  type AudienceReport,
  type Breakdown,
} from '../../../lib/station';
import { alpha, colors, radius } from '../../../lib/theme';

const RANGES = [7, 30, 90] as const;

/** The web's Audience page. Free sees now and the peak; Pro sees the history. */
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
      <AudienceSkeleton />
    );
  }

  const neverHeard = audience.live === 0 && audience.peak_all_time === 0 && !station?.stats?.has_listeners;

  return (
    <StationScreen onRefresh={reload}>
      <TileGrid>
        <StatTile label="Listening now" value={String(audience.live)} hint={station?.is_on_air ? 'right now' : 'station is off air'} />
        <StatTile label="Peak at once" value={String(audience.peak_all_time)} hint="all time" />
      </TileGrid>

      {audience.locked ? (
        <>
          {neverHeard && <NoListenersYet />}
          <Panel style={styles.upsell}>
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
              <T size={15} weight="semibold">
                Listening history
              </T>
              <ProTag />
            </View>
            <T tone="muted" size={14} style={{ lineHeight: 21 }}>
              Pro shows how long people listened, day by day for 90 days, and where they tuned in from.
            </T>
            <EditOnWeb label="Request Pro" path="/dashboard" />
          </Panel>
        </>
      ) : (
        <Report audience={audience} days={days ?? audience.range_days} onDays={setDays} neverHeard={neverHeard} />
      )}
    </StationScreen>
  );
}

function Report({
  audience,
  days,
  onDays,
  neverHeard,
}: {
  audience: AudienceReport;
  days: number;
  onDays: (d: number) => void;
  neverHeard: boolean;
}) {
  const ranges = RANGES.filter((r) => r <= audience.plan_days);
  const t = audience.totals;
  const coverage = t.sessions > 0 ? 'listens' : t.listener_minutes > 0 ? 'stream-only' : 'none';

  return (
    <>
      {ranges.length > 1 && (
        <Segmented
          value={String(days)}
          onChange={(v) => onDays(Number(v))}
          options={ranges.map((r) => ({ value: String(r), label: `${r}d` }))}
        />
      )}

      {coverage === 'none' ? (
        neverHeard ? (
          <NoListenersYet />
        ) : (
          <Panel style={styles.upsell}>
            <T tone="muted" size={14} style={{ lineHeight: 21 }}>
              Nobody listened in the last {audience.range_days} days.
            </T>
          </Panel>
        )
      ) : (
        <>
          <TileGrid>
            <StatTile label="Listening time" value={formatDuration(t.listener_minutes * 60)} />
            <StatTile label="Daily listeners" value={String(t.listeners)} />
            <StatTile label="Peak at once" value={String(t.peak)} hint={`last ${audience.range_days} days`} />
            {coverage === 'listens' && (
              <StatTile
                label="Average listen"
                value={formatDuration(t.avg_listen_seconds)}
                hint={`across ${t.finished_listens} finished listens`}
              />
            )}
          </TileGrid>

          <Section title="Listening time by day">
            <DailyChart daily={audience.daily} />
          </Section>

          {audience.countries.rows.length > 0 && (
            <Section title="Countries">
              {audience.countries.rows.slice(0, 8).map((r) => (
                <BarRow
                  key={r.country}
                  label={`${flag(r.country)}  ${r.country}`}
                  value={r.sessions}
                  max={audience.countries.rows[0]!.sessions}
                  detail={pct(r.sessions, audience.countries.total)}
                />
              ))}
            </Section>
          )}
          <BreakdownSection title="Devices" data={audience.devices} />
          <BreakdownSection title="Browsers" data={audience.browsers} />
          <BreakdownSection title="Where they came from" data={audience.referrers} />
        </>
      )}
    </>
  );
}

function BreakdownSection({ title, data }: { title: string; data: Breakdown }) {
  if (data.rows.length === 0) return null;
  const max = Math.max(...data.rows.map((r) => r.sessions));
  return (
    <Section title={title}>
      {data.rows.slice(0, 6).map((r) => (
        <BarRow key={r.label} label={r.label} value={r.sessions} max={max} detail={pct(r.sessions, data.total)} />
      ))}
    </Section>
  );
}

/** Minutes listened per day as columns; the last day is today. */
function DailyChart({ daily }: { daily: AudienceReport['daily'] }) {
  const max = Math.max(1, ...daily.map((d) => d.listener_minutes));
  const best = daily.reduce((a, b) => (b.listener_minutes > a.listener_minutes ? b : a), daily[0]!);
  return (
    <View style={{ gap: 8 }}>
      <View style={styles.chart}>
        {daily.map((d) => (
          <View key={d.day} style={styles.col}>
            <View
              style={[
                styles.colFill,
                {
                  height: `${Math.max(d.listener_minutes > 0 ? 3 : 1, (d.listener_minutes / max) * 100)}%`,
                  backgroundColor: d.listener_minutes > 0 ? alpha(colors.violet, 0.75) : alpha('#ffffff', 0.07),
                },
              ]}
            />
          </View>
        ))}
      </View>
      <View style={{ flexDirection: 'row', justifyContent: 'space-between' }}>
        <T mono size={11} tone="faint">
          {shortDay(daily[0]?.day)}
        </T>
        <T mono size={11} tone="faint">
          {shortDay(daily[daily.length - 1]?.day)}
        </T>
      </View>
      {best && best.listener_minutes > 0 && (
        <T tone="muted" size={12}>
          Best day: {shortDay(best.day)}, {formatDuration(best.listener_minutes * 60)} listened
        </T>
      )}
    </View>
  );
}

function NoListenersYet() {
  return (
    <Panel style={styles.upsell}>
      <T size={15} weight="semibold">
        No listeners yet
      </T>
      <T tone="muted" size={14} style={{ lineHeight: 21 }}>
        Share your player page from the Overview tab. Your first listener shows up here.
      </T>
    </Panel>
  );
}

function pct(n: number, total: number): string {
  return total > 0 ? `${Math.round((n / total) * 100)}%` : '–';
}

function shortDay(day?: string): string {
  if (!day) return '';
  const d = new Date(`${day}T12:00:00`);
  return Number.isNaN(d.getTime()) ? day : d.toLocaleDateString(undefined, { day: 'numeric', month: 'short' });
}

/** ISO 3166 alpha-2 → regional-indicator flag emoji. */
function flag(code: string): string {
  if (!/^[A-Za-z]{2}$/.test(code)) return '🏳️';
  return String.fromCodePoint(...[...code.toUpperCase()].map((c) => 0x1f1e6 + c.charCodeAt(0) - 65));
}

const styles = StyleSheet.create({
  upsell: { padding: 16, gap: 12 },
  chart: { height: 120, flexDirection: 'row', alignItems: 'flex-end', gap: 2 },
  col: { flex: 1, height: '100%', justifyContent: 'flex-end' },
  colFill: { width: '100%', borderRadius: radius.sm / 2 },
});
