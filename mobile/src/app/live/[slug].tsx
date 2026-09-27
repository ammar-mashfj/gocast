import { IconCheck, IconMicrophone, IconMusic, IconPlayerPlay, IconPlayerTrackPrev } from '@tabler/icons-react-native';
import { router, Stack, useFocusEffect, useLocalSearchParams } from 'expo-router';
import { useCallback, useEffect, useState, type ReactNode } from 'react';
import { ActivityIndicator, Pressable, ScrollView, StyleSheet, View } from 'react-native';

import { clearQueue, loadQueueSummary, type SavedQueueSummary } from '../../audio/queueStore';
import { useBroadcast } from '../../broadcast/BroadcastContext';
import { formatTrackTime } from '../../broadcast/hooks';
import { Overlay } from '../../components/Overlay';
import { Button, PageTitle, Panel, T } from '../../components/ui';
import { api } from '../../lib/api';
import { readJson, removeJson, writeJson } from '../../lib/kv';
import { alpha, colors, fonts, radius } from '../../lib/theme';

/**
 * Go Live: the web's pre-flight page (client/app/dashboard/stations/[slug]/
 * live). Choose mic + music or music only, see the saved running order and
 * whether to pick up where it stopped, then go live. The connecting steps
 * show here, and once live it hands over to the studio.
 */

interface Station {
  name: string;
  slug: string;
  is_live: boolean;
  is_on_air?: boolean;
}

const LIVE_HOLD_MS = 3000;
const micDisabledKey = (slug: string) => `broadcast-mic-disabled-${slug}`;
const RESUME_FROM_START_KEY = 'broadcast-resume-from-start';

export default function GoLive() {
  const { slug, name } = useLocalSearchParams<{ slug: string; name?: string }>();
  const broadcast = useBroadcast();
  const [station, setStation] = useState<Station | null>(null);
  const [skipMic, setSkipMic] = useState(() => readJson<boolean>(micDisabledKey(slug), false));
  const [fromStart, setFromStart] = useState(() => readJson<boolean>(RESUME_FROM_START_KEY, false));
  const [summary, setSummary] = useState<SavedQueueSummary | null>(null);
  const [confirmClear, setConfirmClear] = useState(false);
  const [secondsLeft, setSecondsLeft] = useState(LIVE_HOLD_MS / 1000);

  const thisStation = broadcast.stationSlug === slug;
  const otherStation = broadcast.stationSlug !== null && !thisStation;
  const phase = !thisStation ? 'idle' : broadcast.state;

  useFocusEffect(
    useCallback(() => {
      setSummary(loadQueueSummary());
      api<{ data: Station }>(`/stations/${slug}`)
        .then(({ data }) => setStation(data))
        .catch(() => {});
    }, [slug]),
  );

  // Once live, count down and open the studio, as the web does.
  useEffect(() => {
    if (phase !== 'live') return;
    let left = LIVE_HOLD_MS / 1000;
    const id = setInterval(() => {
      left -= 1;
      setSecondsLeft(left);
      if (left <= 0) {
        clearInterval(id);
        router.replace({ pathname: '/studio/[slug]', params: { slug } });
      }
    }, 1000);
    return () => clearInterval(id);
  }, [phase, slug]);

  const stationName = station?.name ?? name ?? slug;
  const goLive = (opts?: { skipMic?: boolean }) => {
    setSecondsLeft(LIVE_HOLD_MS / 1000);
    void broadcast.start(slug, stationName, { skipMic: opts?.skipMic ?? skipMic, resumeFromStart: fromStart });
  };
  const chooseMic = (noMic: boolean) => {
    setSkipMic(noMic);
    writeJson(micDisabledKey(slug), noMic);
  };
  const chooseFromStart = (value: boolean) => {
    setFromStart(value);
    writeJson(RESUME_FROM_START_KEY, value);
  };

  const micDenied = phase === 'error' && /microphone/i.test(broadcast.error ?? '');
  const alreadyLive = phase === 'idle' && !otherStation && !!station?.is_live;
  const stoppedAt = summary?.lastTrack ? formatTrackTime(summary.lastTrack.offset) : null;

  return (
    <ScrollView style={{ flex: 1, backgroundColor: colors.bg }} contentContainerStyle={styles.page}>
      <Stack.Screen options={{ title: 'Go live' }} />
      <PageTitle>{stationName}</PageTitle>

      {phase === 'idle' && otherStation && (
        <Notice tone="fault">
          You are live on {broadcast.stationName ?? broadcast.stationSlug}. End that broadcast before going live here.
        </Notice>
      )}

      {alreadyLive && (
        <Notice tone="fault">
          Someone is live from another browser or computer, and a station takes one broadcast at a time. Press End
          broadcast in the studio there, then come back and go live here.
        </Notice>
      )}

      {phase === 'idle' && !otherStation && !alreadyLive && station?.is_on_air && (
        <Notice tone="violet">
          AutoDJ is on air right now. Going live takes over from it, and ending hands back to it.
        </Notice>
      )}

      {phase === 'idle' && !otherStation && (
        <>
          <Section title="How are you broadcasting?">
            <Choice
              selected={!skipMic}
              icon={<IconMicrophone size={20} color={colors.text} />}
              title="Mic + music"
              note="Talk over your files"
              onPress={() => chooseMic(false)}
            />
            <Choice
              selected={skipMic}
              icon={<IconMusic size={20} color={colors.text} />}
              title="Music only"
              note="No mic permission asked"
              onPress={() => chooseMic(true)}
            />
          </Section>

          <Section title="Running order">
            {!summary || summary.trackCount === 0 ? (
              <T tone="muted" size={14}>
                Empty. Add music files in the studio once you&apos;re live.
              </T>
            ) : (
              <>
                <T size={14}>
                  {summary.trackCount} {summary.trackCount === 1 ? 'track' : 'tracks'} saved
                  {summary.lastTrack ? (
                    <T tone="muted" size={14}>
                      {' '}
                      · last played {summary.lastTrack.title}
                    </T>
                  ) : null}
                </T>
                {summary.lastTrack && summary.lastTrack.offset >= 1 && (
                  <>
                    <Choice
                      selected={!fromStart}
                      icon={<IconPlayerPlay size={20} color={colors.text} />}
                      title={`Pick up at ${stoppedAt}`}
                      note="Right where it stopped"
                      onPress={() => chooseFromStart(false)}
                    />
                    <Choice
                      selected={fromStart}
                      icon={<IconPlayerTrackPrev size={20} color={colors.text} />}
                      title="Start it over"
                      note="Same song, from 0:00"
                      onPress={() => chooseFromStart(true)}
                    />
                  </>
                )}
                <Button
                  label="Clear queue"
                  variant="ghost"
                  onPress={() => setConfirmClear(true)}
                  style={{ alignSelf: 'flex-start', paddingHorizontal: 0 }}
                />
              </>
            )}
          </Section>

          <Button label="Go live" variant="primary" height={52} disabled={alreadyLive} onPress={() => goLive()} />
        </>
      )}

      {thisStation && (phase === 'connecting' || phase === 'live' || phase === 'reconnecting') && (
        <Panel style={styles.progress}>
          <T size={15} weight="semibold" tone={phase === 'live' ? 'live' : 'text'}>
            {phase === 'live'
              ? `You're live. Opening the studio in ${secondsLeft}…`
              : phase === 'reconnecting'
                ? 'The connection dropped. Reconnecting…'
                : 'Going live…'}
          </T>
          {broadcast.steps.map((s) => (
            <View key={s.id} style={styles.step}>
              {s.status === 'active' ? (
                <ActivityIndicator color={colors.muted} size="small" />
              ) : s.status === 'done' ? (
                <IconCheck size={18} color={colors.liveText} />
              ) : (
                <View style={styles.pending} />
              )}
              <T size={14} tone={s.status === 'pending' ? 'faint' : 'text'}>
                {s.label}
              </T>
            </View>
          ))}
          {phase === 'live' && (
            <Button
              label="Open studio now"
              variant="outline"
              onPress={() => router.replace({ pathname: '/studio/[slug]', params: { slug } })}
            />
          )}
        </Panel>
      )}

      {thisStation && phase === 'error' && (
        <Panel style={styles.progress}>
          <T size={15} weight="semibold" tone="fault">
            Couldn&apos;t go live
          </T>
          <T tone="fault" size={14}>
            {broadcast.error || 'Something stopped the broadcast from starting.'}
          </T>
          {micDenied ? (
            <View style={styles.row}>
              <Button
                label="Continue without mic"
                variant="primary"
                onPress={() => {
                  chooseMic(true);
                  goLive({ skipMic: true });
                }}
                style={{ flex: 1 }}
              />
              <Button label="Try again" onPress={() => goLive()} style={{ flex: 1 }} />
            </View>
          ) : (
            <View style={styles.row}>
              <Button label="Try again" variant="primary" onPress={() => goLive()} style={{ flex: 1 }} />
              <Button
                label="Back"
                onPress={() => {
                  void broadcast.stop();
                  router.back();
                }}
                style={{ flex: 1 }}
              />
            </View>
          )}
        </Panel>
      )}

      <Overlay visible={confirmClear} onClose={() => setConfirmClear(false)}>
        <T style={styles.dialogTitle}>Clear your running order?</T>
        <T tone="muted" size={14} style={{ lineHeight: 20 }}>
          Every saved track is removed from this phone. Your music files elsewhere are not touched.
        </T>
        <View style={styles.row}>
          <Button label="Keep it" onPress={() => setConfirmClear(false)} style={{ flex: 1 }} />
          <Button
            label="Clear queue"
            variant="destructive"
            onPress={() => {
              clearQueue();
              removeJson(RESUME_FROM_START_KEY);
              setSummary(loadQueueSummary());
              setConfirmClear(false);
            }}
            style={{ flex: 1 }}
          />
        </View>
      </Overlay>
    </ScrollView>
  );
}

function Section({ title, children }: { title: string; children: ReactNode }) {
  return (
    <View style={{ gap: 10 }}>
      <T size={13} tone="muted" weight="medium">
        {title}
      </T>
      {children}
    </View>
  );
}

function Choice({
  selected,
  icon,
  title,
  note,
  onPress,
}: {
  selected: boolean;
  icon: ReactNode;
  title: string;
  note: string;
  onPress: () => void;
}) {
  return (
    <Pressable
      accessibilityRole="radio"
      accessibilityState={{ checked: selected }}
      onPress={onPress}
      style={[
        styles.choice,
        selected
          ? { borderColor: colors.violetPale, backgroundColor: alpha(colors.violet, 0.08) }
          : { borderColor: colors.hairline, backgroundColor: colors.panel },
      ]}
    >
      {icon}
      <View style={{ flex: 1 }}>
        <T size={15} weight="semibold">
          {title}
        </T>
        <T size={13} tone="muted">
          {note}
        </T>
      </View>
      <View style={[styles.radio, selected && { borderColor: colors.violetPale }]}>
        {selected && <View style={styles.radioDot} />}
      </View>
    </Pressable>
  );
}

function Notice({ tone, children }: { tone: 'fault' | 'violet'; children: ReactNode }) {
  const c = tone === 'fault' ? colors.fault : colors.violet;
  return (
    <View style={[styles.notice, { backgroundColor: alpha(c, 0.08), borderColor: alpha(c, 0.3) }]}>
      <T size={14} tone={tone === 'fault' ? 'fault' : 'violet'} style={{ lineHeight: 20 }}>
        {children}
      </T>
    </View>
  );
}

const styles = StyleSheet.create({
  page: { padding: 16, gap: 20, paddingBottom: 40 },
  choice: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 14,
    borderWidth: 1,
    borderRadius: radius.xl,
    paddingHorizontal: 16,
    minHeight: 64,
  },
  radio: {
    width: 20,
    height: 20,
    borderRadius: 10,
    borderWidth: 1.5,
    borderColor: colors.inputLine,
    alignItems: 'center',
    justifyContent: 'center',
  },
  radioDot: { width: 10, height: 10, borderRadius: 5, backgroundColor: colors.violetPale },
  notice: { borderWidth: 1, borderRadius: radius.xl, padding: 14 },
  progress: { padding: 16, gap: 12 },
  step: { flexDirection: 'row', alignItems: 'center', gap: 10, minHeight: 24 },
  pending: { width: 18, height: 18, borderRadius: 9, borderWidth: 1.5, borderColor: colors.inputLine },
  row: { flexDirection: 'row', gap: 10 },
  dialogTitle: { fontFamily: fonts.display, fontSize: 20, color: colors.text },
});
