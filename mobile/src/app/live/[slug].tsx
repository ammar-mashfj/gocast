import { router, useFocusEffect, useLocalSearchParams } from 'expo-router';
import { useCallback, useEffect, useState } from 'react';
import { AppState, BackHandler, Linking, Pressable, ScrollView, StyleSheet, View } from 'react-native';
import { AudioManager } from 'react-native-audio-api';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import GocastKeepAlive from '../../../modules/gocast-keepalive/src/GocastKeepAliveModule';
import { clearQueue, loadQueueSummary, type SavedQueueSummary } from '../../audio/queueStore';
import { useBroadcast } from '../../broadcast/BroadcastContext';
import { formatTrackTime, useNow } from '../../broadcast/hooks';
import { CheckRow, Mode, Notice, type Check } from '../../components/live/parts';
import { Overlay } from '../../components/Overlay';
import { BackButton, Button, Card, Dot, Segmented, T } from '../../components/ui';
import { api } from '../../lib/api';
import { useAutoDjLocked } from '../../lib/auth';
import { readJson, removeJson, writeJson } from '../../lib/kv';
import { formatBytes } from '../../lib/station';
import { colors } from '../../lib/theme';

/**
 * Go live: choose mic + music or music only, check the four things that
 * make a show survive (mic, background running, music, connection), then a
 * 3-2-1 while the connection comes up, and into the studio.
 */

interface Station {
  name: string;
  slug: string;
  is_live: boolean;
  is_on_air?: boolean;
}

type Mic = 'Granted' | 'Denied' | 'Undetermined' | null;
type Probe = { state: 'checking' } | { state: 'ok'; ms: number } | { state: 'down' };

const COUNT_FROM = 3;
const COUNT_STEP_MS = 800;
/** The stream's bitrate, as the studio sends it. */
const BITRATE_KBPS = 128;
const SLOW_MS = 1500;
const micDisabledKey = (slug: string) => `broadcast-mic-disabled-${slug}`;
const RESUME_FROM_START_KEY = 'broadcast-resume-from-start';

export default function GoLive() {
  const { slug, name } = useLocalSearchParams<{ slug: string; name?: string }>();
  const broadcast = useBroadcast();
  const insets = useSafeAreaInsets();
  const autoDjLocked = useAutoDjLocked();
  const [station, setStation] = useState<Station | null>(null);
  const [skipMic, setSkipMic] = useState(() => readJson<boolean>(micDisabledKey(slug), false));
  const [fromStart, setFromStart] = useState(() => readJson<boolean>(RESUME_FROM_START_KEY, false));
  const [summary, setSummary] = useState<SavedQueueSummary | null>(null);
  const [confirmClear, setConfirmClear] = useState(false);
  const [mic, setMic] = useState<Mic>(null);
  const [batteryOk, setBatteryOk] = useState(true);
  const [probe, setProbe] = useState<Probe>({ state: 'checking' });
  // When the 3-2-1 started; null on the pre-flight page.
  const [launchedAt, setLaunchedAt] = useState<number | null>(null);

  const thisStation = broadcast.stationSlug === slug;
  const otherStation = broadcast.stationSlug !== null && !thisStation;
  const phase = !thisStation ? 'idle' : broadcast.state;
  const stationName = station?.name ?? name ?? slug;

  // Re-read everything the checklist shows whenever the screen or the app
  // comes back: the grants happen in system dialogs and settings.
  const refresh = useCallback(() => {
    setSummary(loadQueueSummary());
    AudioManager.checkRecordingPermissions().then(setMic, () => setMic(null));
    if (GocastKeepAlive) setBatteryOk(GocastKeepAlive.isIgnoringBatteryOptimizations());
    const began = Date.now();
    setProbe({ state: 'checking' });
    api<{ data: Station }>(`/stations/${slug}`).then(
      ({ data }) => {
        setStation(data);
        setProbe({ state: 'ok', ms: Date.now() - began });
      },
      () => setProbe({ state: 'down' }),
    );
  }, [slug]);

  useFocusEffect(
    useCallback(() => {
      refresh();
      const sub = AppState.addEventListener('change', (next) => {
        if (next === 'active') refresh();
      });
      return () => sub.remove();
    }, [refresh]),
  );

  const counting = launchedAt !== null || (thisStation && phase === 'connecting');

  // A failed start drops back to the pre-flight page, which shows why.
  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- leaving the countdown on failure
    if (phase === 'error') setLaunchedAt(null);
  }, [phase]);

  // Live, and the countdown is over (or there was none): into the studio.
  const now = useNow(counting ? 100 : 60_000);
  const countDone = launchedAt === null || now - launchedAt >= COUNT_FROM * COUNT_STEP_MS;
  useEffect(() => {
    if (phase === 'live' && countDone) router.replace({ pathname: '/studio/[slug]', params: { slug } });
  }, [phase, countDone, slug]);

  const cancel = useCallback(() => {
    setLaunchedAt(null);
    void broadcast.stop();
  }, [broadcast]);

  // Back during the countdown cancels it rather than leaving a show starting.
  useEffect(() => {
    if (!counting) return;
    const sub = BackHandler.addEventListener('hardwareBackPress', () => {
      cancel();
      return true;
    });
    return () => sub.remove();
  }, [counting, cancel]);

  const chooseMic = (noMic: boolean) => {
    setSkipMic(noMic);
    writeJson(micDisabledKey(slug), noMic);
  };
  const chooseFromStart = (value: boolean) => {
    setFromStart(value);
    writeJson(RESUME_FROM_START_KEY, value);
  };

  const askMic = async (): Promise<boolean> => {
    const result = await AudioManager.requestRecordingPermissions().catch(() => 'Denied' as const);
    setMic(result);
    if (result !== 'Granted' && mic === 'Denied') await Linking.openSettings();
    return result === 'Granted';
  };

  const launch = (opts?: { skipMic?: boolean }) => {
    const noMic = opts?.skipMic ?? skipMic;
    setLaunchedAt(Date.now());
    void broadcast.start(slug, stationName, { skipMic: noMic, resumeFromStart: fromStart });
  };

  const goLive = async () => {
    if (!skipMic && mic !== 'Granted' && !(await askMic())) return;
    launch();
  };

  const alreadyLive = !otherStation && phase === 'idle' && !!station?.is_live;
  const blocked = otherStation || alreadyLive;
  const micMissing = !skipMic && mic !== 'Granted';
  const failed = thisStation && phase === 'error';
  const micDenied = failed && /microphone/i.test(broadcast.error ?? '');

  if (counting) {
    const elapsed = launchedAt === null ? Infinity : now - launchedAt;
    const count = Math.max(1, COUNT_FROM - Math.floor(elapsed / COUNT_STEP_MS));
    const waiting = countDone && phase !== 'live';
    const step = broadcast.steps.find((s) => s.status === 'active');
    return (
      <View style={[styles.countdown, { paddingTop: insets.top, paddingBottom: insets.bottom }]}>
        <T mono weight={600} size={13} tracking={0.16} tone="liveInk">
          {waiting ? 'CONNECTING' : 'LIVE IN'}
        </T>
        <T
          weight={800}
          size={200}
          tracking={-0.06}
          tone="liveInk"
          style={{ lineHeight: 190, opacity: waiting ? 0.35 : 1 }}
          accessibilityLiveRegion="assertive"
        >
          {count}
        </T>
        <T weight={500} size={15} tone="liveInk" style={{ textAlign: 'center', paddingHorizontal: 32 }}>
          {waiting
            ? `${step?.label ?? 'Connecting'}…`
            : skipMic
              ? 'Music only · mic stays off'
              : 'Mic is closed until you hold to talk'}
        </T>
        <Pressable
          accessibilityRole="button"
          onPress={cancel}
          style={({ pressed }) => [styles.cancel, pressed && { opacity: 0.7 }]}
        >
          <T weight={700} size={15} tone="liveInk">
            Cancel
          </T>
        </Pressable>
      </View>
    );
  }

  const checks: Check[] = [
    ...(!skipMic
      ? [
          {
            key: 'mic',
            title: 'Microphone',
            ok: mic === 'Granted',
            sub:
              mic === 'Granted'
                ? 'Allowed · this phone’s mic'
                : mic === 'Denied'
                  ? 'Blocked. Allow the microphone for GoCast in Settings.'
                  : 'GoCast needs your mic to put you on air',
            action: mic === 'Denied' ? { label: 'Settings', onPress: () => Linking.openSettings() } : { label: 'Allow', onPress: askMic },
          },
        ]
      : []),
    {
      key: 'battery',
      title: 'Keep running when locked',
      ok: batteryOk,
      sub: batteryOk ? 'On · the show survives a locked screen' : 'Without it, the phone may cut a long show',
      action: { label: 'Turn on', onPress: () => GocastKeepAlive?.requestIgnoreBatteryOptimizations() },
    },
    {
      key: 'queue',
      title: 'Running order',
      ok: !!summary?.trackCount,
      neutral: !summary?.trackCount,
      sub: summary?.trackCount
        ? `${summary.trackCount} ${summary.trackCount === 1 ? 'track' : 'tracks'} · ${formatBytes(summary.bytes)}`
        : 'Empty. You can add music once you’re live.',
      action: summary?.trackCount ? { label: 'Clear', onPress: () => setConfirmClear(true), quiet: true } : undefined,
    },
    {
      key: 'net',
      title: 'Connection',
      ok: probe.state === 'ok' && probe.ms < SLOW_MS,
      neutral: probe.state === 'checking',
      sub:
        probe.state === 'checking'
          ? 'Checking…'
          : probe.state === 'down'
            ? 'Can’t reach GoCast. Check your internet.'
            : probe.ms < SLOW_MS
              ? `Connected · ${BITRATE_KBPS} kbps stream`
              : `Slow · ${probe.ms} ms to GoCast`,
      action: probe.state === 'down' ? { label: 'Retry', onPress: refresh } : undefined,
    },
  ];
  const stoppedAt = summary?.lastTrack && summary.lastTrack.offset >= 1 ? formatTrackTime(summary.lastTrack.offset) : null;

  return (
    <View style={[styles.screen, { paddingTop: insets.top, paddingBottom: insets.bottom + 14 }]}>
      <View style={styles.top}>
        <BackButton onPress={() => (router.canGoBack() ? router.back() : router.replace('/'))} />
        <T weight={600} size={15} tone="muted" numberOfLines={1} style={{ flex: 1 }}>
          {stationName}
        </T>
      </View>

      <ScrollView contentContainerStyle={styles.body} showsVerticalScrollIndicator={false}>
        <T weight={800} size={34} tracking={-0.04} style={{ lineHeight: 36 }}>
          Ready to go live?
        </T>

        {otherStation && (
          <Notice>
            You&apos;re live on {broadcast.stationName ?? broadcast.stationSlug}. End that show before going live here.
          </Notice>
        )}
        {alreadyLive && (
          <Notice>
            Someone is live on this station from another device, and a station takes one show at a time. End it
            there, then come back.
          </Notice>
        )}
        {failed && (
          <Card radius={22} style={{ gap: 12 }}>
            <T weight={700} size={16} tone="liveText">
              Couldn&apos;t go live
            </T>
            <T weight={400} size={14} tone="muted" lineHeight={1.45}>
              {broadcast.error || 'Something stopped the show from starting.'}
            </T>
            {micDenied && (
              <Button
                label="Go live without the mic"
                variant="outline"
                height={50}
                radius={16}
                size={15}
                onPress={() => {
                  chooseMic(true);
                  launch({ skipMic: true });
                }}
              />
            )}
          </Card>
        )}

        <View style={styles.modes}>
          <Mode
            selected={!skipMic}
            title="Mic + music"
            sub="Talk over your tracks"
            onPress={() => chooseMic(false)}
          />
          <Mode selected={skipMic} title="Music only" sub="No mic, no permission" onPress={() => chooseMic(true)} />
        </View>

        <Card style={{ paddingVertical: 4 }}>
          {checks.map((c, i) => (
            <View key={c.key}>
              <CheckRow check={c} first={i === 0} />
              {c.key === 'queue' && stoppedAt && (
                <View style={{ paddingBottom: 11 }}>
                  <Segmented
                    value={fromStart}
                    onChange={chooseFromStart}
                    options={[
                      { value: false, label: `Pick up at ${stoppedAt}` },
                      { value: true, label: 'Start it over' },
                    ]}
                  />
                </View>
              )}
            </View>
          ))}
        </Card>

        {!autoDjLocked && station?.is_on_air && !station.is_live && (
          <View style={styles.note}>
            <View style={{ marginTop: 5 }}>
              <Dot color={colors.autodj} />
            </View>
            <T weight={500} size={13} tone="muted" lineHeight={1.45} style={{ flex: 1 }}>
              AutoDJ is on air. It fades out when you start and picks up again when you end.
            </T>
          </View>
        )}
      </ScrollView>

      <Button
        label={failed ? 'Try again' : micMissing ? 'Allow mic & go live' : 'Go live now'}
        variant="live"
        height={64}
        radius={20}
        size={18}
        dot
        disabled={blocked}
        onPress={goLive}
        style={styles.start}
      />

      <Overlay visible={confirmClear} onClose={() => setConfirmClear(false)} placement="bottom">
        <T weight={800} size={28} tracking={-0.03} style={{ lineHeight: 30 }}>
          Clear your running order?
        </T>
        <T weight={400} size={15} tone="muted" lineHeight={1.45}>
          Every saved track is removed from this phone. Your music files elsewhere are not touched.
        </T>
        <View style={{ gap: 8 }}>
          <Button
            label="Clear it"
            variant="live"
            onPress={() => {
              clearQueue();
              removeJson(RESUME_FROM_START_KEY);
              setSummary(loadQueueSummary());
              setConfirmClear(false);
            }}
          />
          <Button label="Keep it" variant="subtle" height={54} onPress={() => setConfirmClear(false)} />
        </View>
      </Overlay>
    </View>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.bg, paddingHorizontal: 18 },
  top: { height: 48, flexDirection: 'row', alignItems: 'center', gap: 4, marginLeft: -10 },
  body: { flexGrow: 1, gap: 14, paddingTop: 2, paddingBottom: 4 },
  modes: { flexDirection: 'row', gap: 10 },
  note: { flexDirection: 'row', gap: 10 },
  start: { marginTop: 12 },
  countdown: { flex: 1, backgroundColor: colors.live, alignItems: 'center', justifyContent: 'center', gap: 18 },
  cancel: {
    marginTop: 30,
    borderWidth: 1.5,
    borderColor: 'rgba(26,8,6,0.35)',
    borderRadius: 14,
    paddingVertical: 12,
    paddingHorizontal: 22,
  },
});
