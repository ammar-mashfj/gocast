import type { ReactNode } from 'react';
import { Pressable, StyleSheet, View } from 'react-native';

import { colors } from '../../lib/theme';
import { Card, T } from '../ui';

/** The rows of the Go live pre-flight (app/live/[slug].tsx): a check, a mode, a notice. */

export interface Check {
  key: string;
  title: string;
  sub: string;
  ok: boolean;
  /** Neither fine nor a problem: an empty queue, a check still running. */
  neutral?: boolean;
  action?: { label: string; onPress: () => void; quiet?: boolean };
}

export function CheckRow({ check, first }: { check: Check; first: boolean }) {
  const glyph = check.ok ? '✓' : check.neutral ? '–' : '!';
  const fill = check.ok ? colors.ok : check.neutral ? colors.raised : colors.pro;
  const showAction = !!check.action && (!check.ok || check.action.quiet);
  return (
    <View style={[styles.check, !first && styles.divider]}>
      <View style={[styles.glyph, { backgroundColor: fill }]}>
        <T weight={800} size={13} style={{ color: check.neutral && !check.ok ? colors.muted : colors.bg }}>
          {glyph}
        </T>
      </View>
      <View style={{ flex: 1, gap: 3 }}>
        <T weight={600} size={15}>
          {check.title}
        </T>
        <T weight={500} size={13} tone="muted" lineHeight={1.35}>
          {check.sub}
        </T>
      </View>
      {showAction &&
        (check.action!.quiet ? (
          <Pressable accessibilityRole="button" hitSlop={10} onPress={check.action!.onPress}>
            <T weight={600} size={13} tone="faint">
              {check.action!.label}
            </T>
          </Pressable>
        ) : (
          <Pressable
            accessibilityRole="button"
            onPress={check.action!.onPress}
            style={({ pressed }) => [styles.action, pressed && { opacity: 0.8 }]}
          >
            <T weight={700} size={13} tone="ink">
              {check.action!.label}
            </T>
          </Pressable>
        ))}
    </View>
  );
}

export function Mode({
  selected,
  title,
  sub,
  onPress,
}: {
  selected: boolean;
  title: string;
  sub: string;
  onPress: () => void;
}) {
  const ink = selected ? colors.bg : colors.text;
  return (
    <Pressable
      accessibilityRole="radio"
      accessibilityState={{ checked: selected }}
      onPress={onPress}
      style={[styles.mode, { backgroundColor: selected ? colors.text : colors.card }]}
    >
      <View style={[styles.radio, { borderColor: ink }]}>
        {selected && <View style={[styles.radioDot, { backgroundColor: ink }]} />}
      </View>
      <View style={{ gap: 4 }}>
        <T weight={700} size={17} style={{ color: ink }}>
          {title}
        </T>
        <T weight={500} size={13} lineHeight={1.3} style={{ color: ink, opacity: 0.72 }}>
          {sub}
        </T>
      </View>
    </Pressable>
  );
}

export function Notice({ children }: { children: ReactNode }) {
  return (
    <Card radius={20} style={{ backgroundColor: colors.proBand }}>
      <T weight={500} size={14} lineHeight={1.45} style={{ color: colors.proText }}>
        {children}
      </T>
    </Card>
  );
}

const styles = StyleSheet.create({
  mode: { flex: 1, borderRadius: 22, padding: 14, gap: 16 },
  radio: { width: 22, height: 22, borderRadius: 11, borderWidth: 2, alignItems: 'center', justifyContent: 'center' },
  radioDot: { width: 10, height: 10, borderRadius: 5 },
  check: { flexDirection: 'row', alignItems: 'center', gap: 14, paddingVertical: 11 },
  divider: { borderTopWidth: 1, borderTopColor: colors.hairline },
  glyph: { width: 26, height: 26, borderRadius: 13, alignItems: 'center', justifyContent: 'center' },
  action: { backgroundColor: colors.text, borderRadius: 11, paddingVertical: 9, paddingHorizontal: 13 },
});
