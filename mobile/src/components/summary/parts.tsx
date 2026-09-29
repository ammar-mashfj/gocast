import { StyleSheet } from 'react-native';

import { Caption, Card, T } from '../ui';

/** One of the wrap-up's four numbers (app/summary/[slug].tsx). */
export function Stat({ label, value, color }: { label: string; value: string; color?: string }) {
  return (
    <Card radius={20} style={styles.stat}>
      <Caption>{label}</Caption>
      <T mono weight={700} size={26} tracking={-0.03} numberOfLines={1} adjustsFontSizeToFit style={color ? { color } : null}>
        {value}
      </T>
    </Card>
  );
}

const styles = StyleSheet.create({
  stat: { flexBasis: '47%', flexGrow: 1, gap: 6 },
});
