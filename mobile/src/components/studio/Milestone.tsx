import { useEffect, useRef, useState } from 'react';
import { AccessibilityInfo, Animated, StyleSheet, View } from 'react-native';

import { colors } from '../../lib/theme';
import { T } from '../ui';

const MILESTONES = [1, 5, 10, 25, 50, 100, 250, 500, 1000];
const SHOW_MS = 6000;

/**
 * A card that drops in when the show's peak crosses a milestone: the first
 * listener, then 5, 10, 25… Each fires once per show.
 */
export function Milestone({ peak }: { peak: number }) {
  // Seeded with what the show had already reached, so coming back to the
  // studio doesn't replay an old milestone.
  const shown = useRef(reached(peak));
  const [toast, setToast] = useState<number | null>(null);
  const [opacity] = useState(() => new Animated.Value(0));

  useEffect(() => {
    const hit = reached(peak);
    if (hit <= shown.current) return;
    shown.current = hit;
    setToast(hit);
    AccessibilityInfo.announceForAccessibility(title(hit));
    opacity.setValue(0);
    Animated.timing(opacity, { toValue: 1, duration: 220, useNativeDriver: true }).start();
    const t = setTimeout(
      () => Animated.timing(opacity, { toValue: 0, duration: 220, useNativeDriver: true }).start(() => setToast(null)),
      SHOW_MS,
    );
    return () => clearTimeout(t);
  }, [peak, opacity]);

  if (toast === null) return null;
  return (
    <Animated.View pointerEvents="none" style={[styles.toast, { opacity }]}>
      <View style={styles.badge}>
        <T weight={800} size={toast >= 100 ? 15 : 22} tone="ink">
          {toast}
        </T>
      </View>
      <View style={{ flex: 1, gap: 2 }}>
        <T weight={700} size={15} tone="ink">
          {title(toast)}
        </T>
        <T weight={500} size={12} tone="faint">
          Keep going, you&apos;re building an audience.
        </T>
      </View>
    </Animated.View>
  );
}

function reached(peak: number): number {
  return [...MILESTONES].reverse().find((m) => peak >= m) ?? 0;
}

function title(n: number): string {
  return n === 1 ? 'Your first listener tuned in' : `${n} people are listening`;
}

const styles = StyleSheet.create({
  toast: {
    position: 'absolute',
    left: 20,
    right: 20,
    top: 120,
    zIndex: 4,
    backgroundColor: colors.text,
    borderRadius: 18,
    paddingVertical: 14,
    paddingHorizontal: 16,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    boxShadow: '0 20px 40px -10px rgba(0,0,0,0.6)',
  },
  badge: {
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: colors.pro,
    alignItems: 'center',
    justifyContent: 'center',
  },
});
