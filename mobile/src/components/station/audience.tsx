import { StyleSheet, View } from 'react-native';

import { formatDuration, type AudienceReport, type Breakdown } from '../../lib/station';
import { colors } from '../../lib/theme';
import { Card, T } from '../ui';
import { BarRow, EmptyNote, Section, StatTile, TileRow } from './parts';

/** More days than this and the chart pairs them up, so bars stay readable. */
const MAX_BARS = 45;

/** The Pro half of the Audience tab (app/station/[slug]/audience.tsx): the range's report. */
export function Report({ audience, neverHeard }: { audience: AudienceReport; neverHeard: boolean }) {
  const t = audience.totals;
  if (t.sessions === 0 && t.listener_minutes === 0) {
    return neverHeard ? (
      <EmptyNote
        title="No listeners yet"
        body="Share your link from the Overview tab. Your first listener shows up here."
      />
    ) : (
      <EmptyNote body={`Nobody listened in the last ${audience.range_days} days.`} />
    );
  }

  const bars = bucket(audience.daily);
  const peakDay = audience.daily.reduce((a, b) => (b.peak > a.peak ? b : a), audience.daily[0]!);
  const countries = audience.countries.rows;
  const hours = t.listener_minutes / 60;

  return (
    <>
      <Card radius={24} padding={18} style={{ gap: 16 }}>
        <View style={styles.total}>
          <T weight={800} size={44} tracking={-0.04} style={{ lineHeight: 46 }}>
            {t.listeners.toLocaleString()}
          </T>
          <T weight={500} size={14} tone="muted" style={{ flexShrink: 1 }}>
            listeners · {hours >= 10 ? Math.round(hours) : hours.toFixed(1)} hours heard
          </T>
        </View>
        <View style={styles.chart} accessibilityLabel={`Listening time over the last ${audience.range_days} days`}>
          {bars.map((b, i) => (
            <View
              key={b.key}
              style={[
                styles.bar,
                {
                  height: `${b.fraction > 0 ? Math.max(4, b.fraction * 100) : 2}%`,
                  backgroundColor: i === bars.length - 1 ? colors.autodj : colors.autodjDim,
                },
              ]}
            />
          ))}
        </View>
        <View style={styles.axis}>
          <T mono weight={500} size={11} tone="faint">
            {audience.range_days} days ago
          </T>
          <T mono weight={500} size={11} tone="faint">
            Today
          </T>
        </View>
      </Card>

      <TileRow>
        <StatTile label="PEAK" value={String(t.peak)} note={peakDay?.peak ? shortDay(peakDay.day) : 'at once'} />
        <StatTile
          label="AVG. LISTEN"
          value={t.finished_listens > 0 ? formatDuration(t.avg_listen_seconds) : '–'}
          note="per session"
        />
      </TileRow>

      {countries.length > 0 && (
        <Section title="Where they're listening">
          {countries.slice(0, 5).map((r) => (
            <BarRow
              key={r.country}
              label={countryName(r.country)}
              fraction={r.sessions / countries[0]!.sessions}
              detail={pct(r.sessions, audience.countries.total)}
            />
          ))}
        </Section>
      )}
      <BreakdownCard title="Devices" data={audience.devices} />
      <BreakdownCard title="Where they came from" data={audience.referrers} />
    </>
  );
}

function BreakdownCard({ title, data }: { title: string; data: Breakdown }) {
  if (data.rows.length === 0) return null;
  const max = Math.max(...data.rows.map((r) => r.sessions));
  return (
    <Section title={title}>
      {data.rows.slice(0, 5).map((r) => (
        <BarRow key={r.label} label={r.label} fraction={r.sessions / max} detail={pct(r.sessions, data.total)} />
      ))}
    </Section>
  );
}

/** Listening minutes per bar, each as a share of the tallest. */
function bucket(daily: AudienceReport['daily']) {
  const size = Math.ceil(daily.length / MAX_BARS);
  const groups: { key: string; minutes: number }[] = [];
  // Group from the end, so the last bar is always today on its own terms.
  for (let end = daily.length; end > 0; end -= size) {
    const slice = daily.slice(Math.max(0, end - size), end);
    groups.unshift({ key: slice[0]!.day, minutes: slice.reduce((s, d) => s + d.listener_minutes, 0) });
  }
  const max = Math.max(1, ...groups.map((g) => g.minutes));
  return groups.map((g) => ({ key: g.key, fraction: g.minutes / max }));
}

function pct(n: number, total: number): string {
  return total > 0 ? `${Math.round((n / total) * 100)}%` : '–';
}

function shortDay(day: string): string {
  const d = new Date(`${day}T12:00:00`);
  return Number.isNaN(d.getTime())
    ? day
    : d.toLocaleDateString(undefined, { weekday: 'short', day: 'numeric', month: 'short' });
}

/** "EG" → "Egypt" where the runtime knows region names, else the code. */
function countryName(code: string): string {
  try {
    const DisplayNames = (Intl as unknown as { DisplayNames?: new (l: string[], o: object) => { of(c: string): string } })
      .DisplayNames;
    if (DisplayNames) return new DisplayNames(['en'], { type: 'region' }).of(code.toUpperCase()) ?? code;
  } catch {}
  return code.toUpperCase();
}

const styles = StyleSheet.create({
  total: { flexDirection: 'row', alignItems: 'baseline', gap: 10 },
  chart: { height: 120, flexDirection: 'row', alignItems: 'flex-end', gap: 3 },
  bar: { flex: 1, borderTopLeftRadius: 4, borderTopRightRadius: 4, borderBottomLeftRadius: 2, borderBottomRightRadius: 2 },
  axis: { flexDirection: 'row', justifyContent: 'space-between' },
});
