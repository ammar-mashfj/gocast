import { router } from 'expo-router';
import { useState } from 'react';
import { ScrollView, StyleSheet, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import type { AudioEngine } from '../../audio/engine';
import { useBroadcast } from '../../broadcast/BroadcastContext';
import { useEngineSnapshot, useNow, type StudioSignal } from '../../broadcast/hooks';
import { useAutoDjLocked } from '../../lib/auth';
import { colors } from '../../lib/theme';
import { Band } from './Band';
import { Controls, NowPlaying, TalkPad } from './Console';
import { Focus } from './Focus';
import { Milestone } from './Milestone';
import { lampFor } from './model';
import { EndSheet, MicSheet, QueueSheet, type AfterEnd } from './Sheets';

type Sheet = 'queue' | 'mic' | 'end' | null;

/** The studio while the show is on: band, console, sheets, and End. The screen (app/studio/[slug].tsx) decides when it shows. */
export function OnAir({
  slug,
  engine,
  signal,
  endingRef,
  lostMs,
}: {
  slug: string;
  engine: AudioEngine;
  signal: StudioSignal;
  endingRef: React.RefObject<boolean>;
  lostMs: number;
}) {
  const broadcast = useBroadcast();
  const autoDjLocked = useAutoDjLocked();
  const insets = useSafeAreaInsets();
  const snap = useEngineSnapshot(engine);
  const now = useNow(1000);
  const [focus, setFocus] = useState(false);
  const [sheet, setSheet] = useState<Sheet>(null);

  const uptime = broadcast.liveSince ? (now - broadcast.liveSince) / 1000 : 0;
  const { listeners, peakListeners, tracksPlayed } = broadcast.session;
  const lamp = lampFor(signal, snap, broadcast.micDisabled);

  const end = async (after: AfterEnd) => {
    endingRef.current = true;
    const params = {
      slug,
      name: broadcast.stationName ?? '',
      seconds: String(Math.round(uptime)),
      peak: String(Math.max(peakListeners, listeners ?? 0)),
      tracks: String(tracksPlayed),
      lost: String(Math.round(lostMs / 1000)),
      after,
    };
    await broadcast.stop({ releaseStation: autoDjLocked });
    router.replace({ pathname: '/summary/[slug]', params });
  };

  const toStation = () => router.navigate({ pathname: '/station/[slug]', params: { slug } });

  return (
    <View style={[styles.screen, { paddingTop: insets.top, paddingBottom: insets.bottom }]}>
      {focus ? (
        <Focus
          engine={engine}
          snap={snap}
          micDisabled={broadcast.micDisabled}
          uptime={uptime}
          listeners={listeners}
          onExit={() => setFocus(false)}
          onEnd={() => setSheet('end')}
          onQueue={() => setSheet('queue')}
        />
      ) : (
        <>
          <Band
            lamp={lamp}
            code={signal.code}
            uptime={uptime}
            listeners={listeners}
            onBack={toStation}
            onEnd={() => setSheet('end')}
          />
          <ScrollView
            contentContainerStyle={styles.body}
            showsVerticalScrollIndicator={false}
            // The pad needs every touch it gets; the page only scrolls on short phones.
            alwaysBounceVertical={false}
            overScrollMode="never"
          >
            <NowPlaying engine={engine} snap={snap} onQueue={() => setSheet('queue')} />
            <TalkPad engine={engine} snap={snap} micDisabled={broadcast.micDisabled} onFocus={() => setFocus(true)} />
            <Controls
              engine={engine}
              snap={snap}
              micDisabled={broadcast.micDisabled}
              onMicSettings={() => setSheet('mic')}
            />
          </ScrollView>
        </>
      )}

      <Milestone peak={peakListeners} />

      <QueueSheet visible={sheet === 'queue'} onClose={() => setSheet(null)} engine={engine} snap={snap} />
      <MicSheet
        visible={sheet === 'mic'}
        onClose={() => setSheet(null)}
        engine={engine}
        snap={snap}
        micDisabled={broadcast.micDisabled}
      />
      <EndSheet
        visible={sheet === 'end'}
        onClose={() => setSheet(null)}
        slug={slug}
        autoDjLocked={autoDjLocked}
        onEnd={end}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.bg },
  body: { flexGrow: 1, gap: 10, paddingTop: 10, paddingHorizontal: 12, paddingBottom: 12 },
});
