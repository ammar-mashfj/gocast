import { IconHeadphones } from '@tabler/icons-react-native';
import { Pressable, StyleSheet, View } from 'react-native';

import type { AudioEngine } from '../../audio/engine';
import { useEngineValue } from '../../broadcast/hooks';
import { alpha, colors, radius } from '../../lib/theme';
import { T } from '../ui';

/**
 * The web's MonitorBar: hear the music through the phone. Music only, never
 * the mic (that would feed back), off by default and never part of what goes
 * out. Volume in 10% steps, since a slider would fight the page scroll.
 */
export function MonitorBar({ engine }: { engine: AudioEngine }) {
  const enabled = useEngineValue(engine, (e) => e.isMonitorEnabled());
  const volume = Math.round(useEngineValue(engine, (e) => e.getMonitorVolume()) * 100);

  return (
    <View style={styles.bar}>
      <Pressable
        accessibilityRole="switch"
        accessibilityState={{ checked: enabled }}
        onPress={() => engine.setMonitorEnabled(!enabled)}
        style={styles.toggle}
      >
        <IconHeadphones size={18} color={enabled ? colors.text : colors.muted} />
        <T size={13} tone={enabled ? 'text' : 'muted'} weight="medium">
          {enabled ? 'Monitor on' : 'Monitor off'}
        </T>
      </Pressable>
      <View style={[styles.volume, !enabled && { opacity: 0.4 }]}>
        <Step
          label="−"
          disabled={!enabled || volume <= 0}
          onPress={() => engine.setMonitorVolume((volume - 10) / 100)}
        />
        <T mono size={12} tone="muted" style={{ width: 40, textAlign: 'center' }}>
          {volume}%
        </T>
        <Step
          label="+"
          disabled={!enabled || volume >= 100}
          onPress={() => engine.setMonitorVolume((volume + 10) / 100)}
        />
      </View>
    </View>
  );
}

function Step({ label, disabled, onPress }: { label: string; disabled: boolean; onPress: () => void }) {
  return (
    <Pressable
      accessibilityLabel={label === '+' ? 'Monitor louder' : 'Monitor quieter'}
      disabled={disabled}
      onPress={onPress}
      style={({ pressed }) => [styles.step, pressed && { opacity: 0.7 }]}
    >
      <T size={18}>{label}</T>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  bar: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  toggle: { flexDirection: 'row', alignItems: 'center', gap: 8, height: 44, paddingRight: 12 },
  volume: { flexDirection: 'row', alignItems: 'center' },
  step: {
    width: 44,
    height: 44,
    borderRadius: radius.md,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: alpha('#ffffff', 0.03),
  },
});
