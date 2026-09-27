import { IconAdjustments, IconMicrophone } from '@tabler/icons-react-native';
import { useEffect, useRef, useState } from 'react';
import { Pressable, StyleSheet, View } from 'react-native';

import type { AudioEngine } from '../../audio/engine';
import { INPUT_GAIN_MAX_DB, INPUT_GAIN_MIN_DB, type DuckLevel, type FadeSpeed } from '../../audio/micPrefs';
import { useEngineValue } from '../../broadcast/hooks';
import { alpha, colors, radius } from '../../lib/theme';
import { Overlay } from '../Overlay';
import { Button, Segmented, T } from '../ui';

/**
 * Push-to-talk, the latch, the mic settings and the mic meter: the web's
 * PushToTalk, MicSettings and MicMeter in one block for a phone.
 */
export function MicDesk({ engine }: { engine: AudioEngine }) {
  const [pressed, setPressed] = useState(false);
  const [settingsOpen, setSettingsOpen] = useState(false);
  const latched = useEngineValue(engine, (e) => e.isMicLatched());
  const micActive = useEngineValue(engine, (e) => e.isMicActive());
  const prefs = useEngineValue(engine, (e) => e.getMicPrefs());
  // The pad lights from the finger, not from the engine's round trip, so it
  // answers the instant it is touched.
  const micOpen = pressed || micActive;
  const musicHint = prefs.duck === 'silence' ? 'music fades out while you talk' : 'music dips while you talk';

  return (
    <View style={styles.desk}>
      <Pressable
        accessibilityRole="button"
        accessibilityLabel={latched ? 'Mic stays on' : 'Hold to talk'}
        onPressIn={() => {
          setPressed(true);
          engine.pttDown();
        }}
        onPressOut={() => {
          setPressed(false);
          engine.pttUp();
        }}
        style={[styles.pad, micOpen ? styles.padOpen : styles.padClosed]}
      >
        <View
          style={[styles.padIcon, { backgroundColor: micOpen ? alpha(colors.micInk, 0.15) : alpha(colors.mic, 0.12) }]}
        >
          <IconMicrophone size={20} color={micOpen ? colors.micInk : colors.micText} />
        </View>
        <View style={{ flex: 1 }}>
          <T size={16} weight="semibold" style={{ color: micOpen ? colors.micInk : colors.text }}>
            {micOpen ? (latched ? 'Mic stays on' : "You're on mic") : 'Hold to talk'}
          </T>
          <T size={12} style={{ color: micOpen ? alpha(colors.micInk, 0.75) : colors.muted }}>
            {micOpen ? (latched ? 'Tap Mic off to close' : 'Let go to close') : `Press and hold · ${musicHint}`}
          </T>
        </View>
      </Pressable>

      <View style={styles.controls}>
        <Button
          label={latched ? 'Mic off' : 'Keep mic on'}
          variant={latched ? 'mic' : 'outline'}
          onPress={() => engine.setMicLatched(!latched)}
          style={{ flex: 1 }}
        />
        <Button
          accessibilityLabel="Mic settings"
          variant="outline"
          icon={<IconAdjustments size={20} color={colors.text} />}
          onPress={() => setSettingsOpen(true)}
          style={{ width: 44, paddingHorizontal: 0 }}
        />
      </View>

      <MicMeter engine={engine} open={micOpen} />
      <T size={12} tone={micOpen ? 'mic' : 'faint'}>
        {micOpen ? 'Going out live' : "Mic check · listeners can't hear this"}
      </T>

      <MicSettings
        visible={settingsOpen}
        onClose={() => setSettingsOpen(false)}
        duck={prefs.duck}
        fade={prefs.fade}
        broadcastVoice={prefs.broadcastVoice}
        inputGainDb={prefs.inputGainDb}
        onChange={(patch) => engine.setMicPrefs(patch)}
      />
    </View>
  );
}

// ── Meter: the web's MicMeter constants ──

const FLOOR_DB = -60;
const SEGMENTS = 40;
const PEAK_HOLD_MS = 1200;
const LEVEL_RELEASE_DB_S = 24;
const PEAK_RELEASE_DB_S = 18;
const METER_MS = 50;
const SCALE = [-48, -24, -12, -6, 0];

function MicMeter({ engine, open }: { engine: AudioEngine; open: boolean }) {
  const [level, setLevel] = useState(FLOOR_DB);
  const [peak, setPeak] = useState(FLOOR_DB);
  const state = useRef({ level: FLOOR_DB, peak: FLOOR_DB, peakAt: 0, last: 0 });

  useEffect(() => {
    const s = state.current;
    s.last = Date.now();
    const id = setInterval(() => {
      const now = Date.now();
      const dt = (now - s.last) / 1000;
      s.last = now;
      const raw = engine.readMicPeakDb();
      const db = raw === null || !Number.isFinite(raw) ? FLOOR_DB : Math.max(FLOOR_DB, Math.min(0, raw));
      // Instant attack, steady release.
      s.level = db >= s.level ? db : Math.max(db, s.level - LEVEL_RELEASE_DB_S * dt);
      if (s.level >= s.peak) {
        s.peak = s.level;
        s.peakAt = now;
      } else if (now - s.peakAt > PEAK_HOLD_MS) {
        s.peak = Math.max(s.level, s.peak - PEAK_RELEASE_DB_S * dt);
      }
      setLevel(s.level);
      setPeak(s.peak);
    }, METER_MS);
    return () => clearInterval(id);
  }, [engine]);

  const lit = Math.round(((level - FLOOR_DB) / -FLOOR_DB) * SEGMENTS);
  const peakSeg = Math.round(((peak - FLOOR_DB) / -FLOOR_DB) * SEGMENTS) - 1;

  return (
    <View accessibilityLabel={`${Math.round(level)} dB`} style={{ gap: 4 }}>
      <View style={styles.meter}>
        {Array.from({ length: SEGMENTS }, (_, i) => {
          const segDb = FLOOR_DB + ((i + 1) / SEGMENTS) * -FLOOR_DB;
          const on = i < lit || i === peakSeg;
          let color = alpha('#ffffff', 0.07);
          if (on) {
            if (!open) color = alpha('#ffffff', 0.32);
            else if (segDb > -1) color = colors.fault;
            else if (segDb > -6) color = '#e0f2fe';
            else color = colors.mic;
          }
          return <View key={i} style={[styles.seg, { backgroundColor: color }]} />;
        })}
      </View>
      <View style={styles.scale}>
        {SCALE.map((db) => (
          <T
            key={db}
            mono
            tone="faint"
            size={11}
            style={[styles.scaleLabel, { left: `${((db - FLOOR_DB) / -FLOOR_DB) * 100}%` }]}
          >
            {db}
          </T>
        ))}
      </View>
    </View>
  );
}

// ── Settings: the web's MicSettings popover, as a bottom sheet ──

function MicSettings({
  visible,
  onClose,
  duck,
  fade,
  broadcastVoice,
  inputGainDb,
  onChange,
}: {
  visible: boolean;
  onClose: () => void;
  duck: DuckLevel;
  fade: FadeSpeed;
  broadcastVoice: boolean;
  inputGainDb: number;
  onChange: (patch: { duck?: DuckLevel; fade?: FadeSpeed; broadcastVoice?: boolean; inputGainDb?: number }) => void;
}) {
  return (
    <Overlay visible={visible} onClose={onClose} placement="bottom">
      <T size={16} weight="semibold">
        Mic settings
      </T>

      <View style={styles.field}>
        <T tone="muted" size={12}>
          Music while you talk
        </T>
        <Segmented
          value={duck}
          onChange={(v) => onChange({ duck: v })}
          options={[
            { value: 'under', label: 'Under you' },
            { value: 'low', label: 'Low' },
            { value: 'silence', label: 'Silent' },
          ]}
        />
        <T tone="faint" size={12}>
          {duck === 'silence'
            ? 'The music fades out completely and keeps playing underneath.'
            : 'How far the music drops under your voice.'}
        </T>
      </View>

      <View style={styles.field}>
        <T tone="muted" size={12}>
          Fade
        </T>
        <Segmented
          value={fade}
          onChange={(v) => onChange({ fade: v })}
          options={[
            { value: 'instant', label: 'Instant' },
            { value: 'smooth', label: 'Smooth' },
            { value: 'slow', label: 'Slow' },
          ]}
        />
        <T tone="faint" size={12}>
          How quickly the music goes down and comes back.
        </T>
      </View>

      <View style={styles.field}>
        <T tone="muted" size={12}>
          Broadcast voice
        </T>
        <Segmented
          value={broadcastVoice}
          onChange={(v) => onChange({ broadcastVoice: v })}
          options={[
            { value: true, label: 'On' },
            { value: false, label: 'Off' },
          ]}
        />
        <T tone="faint" size={12}>
          Cuts rumble, lifts clarity and evens out your level.
        </T>
      </View>

      <View style={styles.field}>
        <T tone="muted" size={12}>
          Mic level
        </T>
        <View style={styles.levelRow}>
          <Button
            label="−"
            disabled={inputGainDb <= INPUT_GAIN_MIN_DB}
            onPress={() => onChange({ inputGainDb: inputGainDb - 3 })}
            style={{ width: 56 }}
          />
          <T mono size={16} style={{ flex: 1, textAlign: 'center' }}>
            +{inputGainDb} dB
          </T>
          <Button
            label="+"
            disabled={inputGainDb >= INPUT_GAIN_MAX_DB}
            onPress={() => onChange({ inputGainDb: inputGainDb + 3 })}
            style={{ width: 56 }}
          />
        </View>
        <T tone="faint" size={12}>
          Phone mics vary. Speak normally and aim for the meter to peak around −12 to −6.
        </T>
      </View>

      <Button label="Done" variant="outline" onPress={onClose} />
    </Overlay>
  );
}

const styles = StyleSheet.create({
  desk: { gap: 10 },
  pad: {
    minHeight: 72,
    borderRadius: radius.xl,
    borderWidth: 1,
    paddingHorizontal: 20,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 14,
  },
  padClosed: { backgroundColor: alpha('#ffffff', 0.03), borderColor: alpha('#ffffff', 0.12) },
  padOpen: { backgroundColor: colors.mic, borderColor: colors.mic, transform: [{ scale: 0.99 }] },
  padIcon: { width: 40, height: 40, borderRadius: 20, alignItems: 'center', justifyContent: 'center' },
  controls: { flexDirection: 'row', gap: 8 },
  meter: { flexDirection: 'row', gap: 2, height: 12 },
  seg: { flex: 1, borderRadius: 1.5 },
  scale: { height: 14 },
  scaleLabel: { position: 'absolute', transform: [{ translateX: -10 }] },
  field: { gap: 8 },
  levelRow: { flexDirection: 'row', alignItems: 'center', gap: 12 },
});
