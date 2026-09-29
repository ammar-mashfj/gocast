import { useEffect, type ReactNode } from 'react';
import { View, type DimensionValue, type StyleProp, type ViewStyle } from 'react-native';
import Animated, {
  Easing,
  useAnimatedStyle,
  useReducedMotion,
  useSharedValue,
  withRepeat,
  withTiming,
} from 'react-native-reanimated';

import { colors } from '../lib/theme';

/**
 * Placeholders in the shape of what is loading, drawn "unlit" (the design's
 * off-air fill), so the layout doesn't jump when the data lands. One slow
 * breath for the whole group, never a shimmer; still under reduced motion.
 */
export function SkeletonGroup({ children, style }: { children: ReactNode; style?: StyleProp<ViewStyle> }) {
  const reduceMotion = useReducedMotion();
  const opacity = useSharedValue(1);
  useEffect(() => {
    if (reduceMotion) return;
    opacity.value = withRepeat(withTiming(0.45, { duration: 900, easing: Easing.inOut(Easing.ease) }), -1, true);
  }, [reduceMotion, opacity]);
  const animated = useAnimatedStyle(() => ({ opacity: opacity.value }));
  return (
    <Animated.View
      style={[style, animated]}
      accessibilityRole="progressbar"
      accessibilityLabel="Loading"
      pointerEvents="none"
    >
      {children}
    </Animated.View>
  );
}

/** One block: a line of text, a tile, a button. */
export function Bone({
  w = '100%',
  h = 14,
  r = 4,
  style,
}: {
  w?: DimensionValue;
  h?: number;
  r?: number;
  style?: StyleProp<ViewStyle>;
}) {
  return <View style={[{ width: w, height: h, borderRadius: r, backgroundColor: 'rgba(244,241,236,0.06)' }, style]} />;
}

/** An unlit panel to hold bones, the same frame as a real Panel. */
export function BonePanel({ children, style }: { children: ReactNode; style?: StyleProp<ViewStyle> }) {
  return (
    <View
      style={[
        {
          backgroundColor: colors.card,
          borderRadius: 22,
          padding: 16,
          gap: 12,
        },
        style,
      ]}
    >
      {children}
    </View>
  );
}

/** Rows of a list: a primary line, a secondary line, a value on the right. */
export function BoneRows({ count = 3, lead }: { count?: number; lead?: number }) {
  return (
    <View>
      {Array.from({ length: count }, (_, i) => (
        <View
          key={i}
          style={{
            flexDirection: 'row',
            alignItems: 'center',
            gap: 12,
            paddingVertical: 10,
            borderTopWidth: i > 0 ? 1 : 0,
            borderTopColor: colors.hairline,
          }}
        >
          {!!lead && <Bone w={lead} h={16} />}
          <View style={{ flex: 1, gap: 6 }}>
            <Bone w={`${70 - ((i * 17) % 30)}%`} h={13} />
            <Bone w={`${35 - ((i * 7) % 12)}%`} h={10} />
          </View>
          <Bone w={40} h={12} />
        </View>
      ))}
    </View>
  );
}
