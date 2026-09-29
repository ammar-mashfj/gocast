import * as SplashScreen from 'expo-splash-screen';
import { useEffect, useState } from 'react';
import { StyleSheet, View } from 'react-native';
import Animated, {
  Easing,
  useAnimatedStyle,
  useReducedMotion,
  useSharedValue,
  withDelay,
  withSequence,
  withTiming,
} from 'react-native-reanimated';

import { colors } from '../lib/theme';
import { LOGO_HEIGHT, LOGO_WIDTH, Wordmark } from './Brand';

/**
 * The launch animation (design concept "GoCast Splash 1c"): a violet
 * waveform swells and settles, then the wordmark wipes in from the left.
 *
 * The native splash (app.json) is only the ground colour, so hiding it the
 * moment this layer is drawn is seamless. The layer holds on the wordmark
 * until the app is `ready`, then fades out and calls `onDone`.
 */

/** 1 = the concept's timing (about 2.5 s). Lower is longer, higher is shorter. */
const SPEED = 1;
const BARS = 30;
const WAVE_W = 220;
const WAVE_H = 90;
const LOGO_W = 220;

const ms = (t: number) => t / SPEED;
const EASE_IN_OUT = Easing.bezier(0.42, 0, 0.58, 1); // CSS ease-in-out
const WIPE = Easing.bezier(0.7, 0, 0.2, 1);

/** How long the finished wordmark stays on screen before the app shows. */
const HOLD_MS = 1000;
/** When the wordmark has fully wiped in and had its moment. */
const PLAYED_AT = ms(1650 + 900) + HOLD_MS;
const FADE_OUT = 280;

export function AnimatedSplash({ ready, onDone }: { ready: boolean; onDone: () => void }) {
  const reduceMotion = useReducedMotion();
  const [played, setPlayed] = useState(false);
  // Each bar's peaks, drawn once: a random height under a sine envelope, so
  // the wave is tallest in the middle, like the concept.
  const [peaks] = useState(() =>
    Array.from({ length: BARS }, (_, k) => {
      const env = Math.sin((Math.PI * (k + 0.5)) / BARS);
      const r = () => (0.15 + Math.random() * 0.85) * env;
      return [r(), r(), r(), r() * 0.5];
    }),
  );

  const waveOpacity = useSharedValue(1);
  const logoWidth = useSharedValue(reduceMotion ? LOGO_W : 0);
  const layerOpacity = useSharedValue(1);

  useEffect(() => {
    if (reduceMotion) {
      const t = setTimeout(() => setPlayed(true), HOLD_MS);
      return () => clearTimeout(t);
    }
    waveOpacity.value = withDelay(ms(1750), withTiming(0, { duration: ms(300) }));
    logoWidth.value = withDelay(ms(1650), withTiming(LOGO_W, { duration: ms(900), easing: WIPE }));
    const t = setTimeout(() => setPlayed(true), PLAYED_AT);
    return () => clearTimeout(t);
  }, [reduceMotion, waveOpacity, logoWidth]);

  const done = played && ready;
  useEffect(() => {
    if (!done) return;
    layerOpacity.value = withTiming(0, { duration: FADE_OUT, easing: Easing.out(Easing.exp) });
    const t = setTimeout(onDone, FADE_OUT);
    return () => clearTimeout(t);
  }, [done, layerOpacity, onDone]);

  const layerStyle = useAnimatedStyle(() => ({ opacity: layerOpacity.value }));
  const waveStyle = useAnimatedStyle(() => ({ opacity: waveOpacity.value }));
  const logoStyle = useAnimatedStyle(() => ({ width: logoWidth.value }));

  return (
    <Animated.View
      style={[styles.layer, layerStyle]}
      pointerEvents={done ? 'none' : 'auto'}
      onLayout={() => SplashScreen.hideAsync()}
    >
      {!reduceMotion && (
        <Animated.View style={[styles.wave, waveStyle]}>
          {peaks.map((p, k) => (
            <Bar key={k} index={k} peaks={p} />
          ))}
        </Animated.View>
      )}
      <View style={styles.logoBox}>
        <Animated.View style={[styles.logoClip, logoStyle]}>
          <Wordmark width={LOGO_W} />
        </Animated.View>
      </View>
    </Animated.View>
  );
}

function Bar({ index, peaks }: { index: number; peaks: number[] }) {
  const scale = useSharedValue(0.04);
  useEffect(() => {
    // The concept's keyframes: 0 → peaks at 20/40/60/78% → 2% at 1.7 s.
    const step = (to: number, duration: number) => withTiming(to, { duration: ms(duration), easing: EASE_IN_OUT });
    scale.value = withDelay(
      ms(index * 12),
      withSequence(step(peaks[0], 340), step(peaks[1], 340), step(peaks[2], 340), step(peaks[3], 306), step(0.02, 374)),
    );
  }, [index, peaks, scale]);
  const style = useAnimatedStyle(() => ({ transform: [{ scaleY: scale.value }] }));
  return <Animated.View style={[styles.bar, style]} />;
}

const styles = StyleSheet.create({
  layer: {
    ...StyleSheet.absoluteFill,
    zIndex: 1000,
    elevation: 1000,
    backgroundColor: colors.bg,
    alignItems: 'center',
    justifyContent: 'center',
  },
  wave: {
    position: 'absolute',
    width: WAVE_W,
    height: WAVE_H,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  bar: { width: 3, height: WAVE_H, borderRadius: 2, backgroundColor: colors.autodj },
  logoBox: { width: LOGO_W, height: (LOGO_W * LOGO_HEIGHT) / LOGO_WIDTH },
  logoClip: { height: '100%', overflow: 'hidden' },
});
