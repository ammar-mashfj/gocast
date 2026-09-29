import { IconArrowUpRight } from '@tabler/icons-react-native';
import { Pressable, StyleSheet, View } from 'react-native';

import { colors } from '../../lib/theme';
import { Divided, T } from '../ui';

/** Rows of the Account screen (app/account.tsx): a plan fact, a link out, a date. */

export function Fact({ label, value }: { label: string; value: string }) {
  return (
    <View style={styles.fact}>
      <T weight={500} size={14} tone="muted">
        {label}
      </T>
      <T weight={600} size={14} style={{ flexShrink: 1, textAlign: 'right' }}>
        {value}
      </T>
    </View>
  );
}

export function LinkRow({ label, onPress, first = false }: { label: string; onPress: () => void; first?: boolean }) {
  return (
    <Divided first={first}>
      <Pressable
        accessibilityRole="link"
        onPress={onPress}
        style={({ pressed }) => [styles.link, pressed && { backgroundColor: colors.raised }]}
      >
        <T weight={600} size={15} style={{ flex: 1 }}>
          {label}
        </T>
        <IconArrowUpRight size={18} color={colors.faint} />
      </Pressable>
    </Divided>
  );
}

export function formatDate(iso: string): string {
  const d = new Date(iso);
  return Number.isNaN(d.getTime())
    ? iso
    : d.toLocaleDateString(undefined, { day: 'numeric', month: 'long', year: 'numeric' });
}

const styles = StyleSheet.create({
  fact: { flexDirection: 'row', justifyContent: 'space-between', gap: 16 },
  link: { flexDirection: 'row', alignItems: 'center', gap: 12, height: 54, paddingHorizontal: 16 },
});
