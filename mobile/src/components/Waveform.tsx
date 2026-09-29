import { View } from 'react-native';
import Animated, {
  useAnimatedStyle,
  useFrameCallback,
  useReducedMotion,
  useSharedValue,
  type SharedValue,
} from 'react-native-reanimated';

import { colors } from '../lib/theme';

const BARS = 30;
/** The comp ticks every 200 ms; its phase advances one step per tick. */
const STEP_MS = 200;

function heightAt(t: number, i: number): number {
  'worklet';
  return 18 + 80 * Math.abs(Math.sin(t * 0.09 + i * 0.55) * Math.cos(t * 0.04 + i * 0.21));
}

/**
 * The welcome screen's wave: thirty bars, the first ten coral (live), the
 * rest violet (AutoDJ), drifting on two slow sines. Still under reduced motion.
 */
export function Waveform({ height = 64 }: { height?: number }) {
  const reduceMotion = useReducedMotion();
  const t = useSharedValue(40);
  useFrameCallback((frame) => {
    t.value += (frame.timeSincePreviousFrame ?? 16) / STEP_MS;
  }, !reduceMotion);

  return (
    <View style={{ flexDirection: 'row', gap: 4, alignItems: 'center', height }} accessible={false}>
      {Array.from({ length: BARS }, (_, i) => (
        <Bar key={i} i={i} t={t} />
      ))}
    </View>
  );
}

function Bar({ i, t }: { i: number; t: SharedValue<number> }) {
  const style = useAnimatedStyle(() => ({ height: `${heightAt(t.value, i)}%` }));
  return (
    <Animated.View
      style={[{ flex: 1, borderRadius: 3, backgroundColor: i < 10 ? colors.live : colors.autodj }, style]}
    />
  );
}
