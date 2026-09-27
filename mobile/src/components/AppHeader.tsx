import { IconArrowLeft } from '@tabler/icons-react-native';
import type { NativeStackHeaderProps } from 'expo-router/native-stack';
import type { ReactNode } from 'react';
import { Pressable, StyleSheet, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { colors, fonts } from '../lib/theme';
import { T } from './ui';

export const HEADER_HEIGHT = 56;

/**
 * The top bar for every stacked screen: a panel-toned strip with a hairline
 * under it, so it reads as a bar above the page rather than part of it.
 * Screens add actions through the usual `headerRight` option.
 */
export function AppHeader({ navigation, options, route, back }: NativeStackHeaderProps) {
  const title = typeof options.headerTitle === 'string' ? options.headerTitle : (options.title ?? route.name);
  const right = options.headerRight?.({ tintColor: colors.text, canGoBack: !!back });
  return (
    <TopBar
      left={
        back ? (
          <Pressable
            accessibilityRole="button"
            accessibilityLabel="Back"
            hitSlop={8}
            onPress={() => navigation.goBack()}
            style={({ pressed }) => [styles.icon, pressed && { backgroundColor: colors.mutedSurface }]}
          >
            <IconArrowLeft size={22} color={colors.text} />
          </Pressable>
        ) : null
      }
      right={right}
    >
      <T numberOfLines={1} style={styles.title}>
        {title}
      </T>
    </TopBar>
  );
}

/** The bar itself, shared with Home's own top bar. */
export function TopBar({ left, right, children }: { left?: ReactNode; right?: ReactNode; children: ReactNode }) {
  const insets = useSafeAreaInsets();
  return (
    <View style={[styles.bar, { paddingTop: insets.top }]}>
      <View style={styles.row}>
        {left}
        <View style={styles.middle}>{children}</View>
        {!!right && <View style={styles.right}>{right}</View>}
      </View>
    </View>
  );
}

/** A round icon button for a bar's actions. */
export function HeaderIcon({ label, onPress, children }: { label: string; onPress: () => void; children: ReactNode }) {
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={label}
      hitSlop={6}
      onPress={onPress}
      style={({ pressed }) => [styles.icon, pressed && { backgroundColor: colors.mutedSurface }]}
    >
      {children}
    </Pressable>
  );
}

const styles = StyleSheet.create({
  bar: {
    backgroundColor: colors.panel,
    borderBottomWidth: 1,
    borderBottomColor: colors.hairline,
  },
  row: { height: HEADER_HEIGHT, flexDirection: 'row', alignItems: 'center', paddingHorizontal: 8, gap: 4 },
  middle: { flex: 1, paddingHorizontal: 8, justifyContent: 'center' },
  right: { flexDirection: 'row', alignItems: 'center', gap: 6, paddingRight: 4 },
  title: { fontFamily: fonts.display, fontSize: 19, letterSpacing: -0.4, color: colors.text },
  icon: { width: 40, height: 40, borderRadius: 20, alignItems: 'center', justifyContent: 'center' },
});
