import { useState, type ReactNode } from 'react';
import { RefreshControl, ScrollView, StyleSheet, View } from 'react-native';

import { colors } from '../../lib/theme';
import { Bone, BonePanel, BoneRows, SkeletonGroup } from '../Skeleton';
import { Button, Caption, Card, T } from '../ui';

/** A tab's scrolling body with pull-to-refresh. */
export function StationScreen({ onRefresh, children }: { onRefresh: () => Promise<unknown>; children: ReactNode }) {
  const [refreshing, setRefreshing] = useState(false);
  return (
    <ScrollView
      style={{ flex: 1, backgroundColor: colors.bg }}
      contentContainerStyle={styles.body}
      showsVerticalScrollIndicator={false}
      refreshControl={
        <RefreshControl
          refreshing={refreshing}
          tintColor={colors.text}
          colors={[colors.autodj]}
          progressBackgroundColor={colors.sheet}
          onRefresh={async () => {
            setRefreshing(true);
            await onRefresh();
            setRefreshing(false);
          }}
        />
      }
    >
      {children}
    </ScrollView>
  );
}

/** A card with a bold title row and an optional action on the right. */
export function Section({ title, action, children }: { title: string; action?: ReactNode; children: ReactNode }) {
  return (
    <Card style={{ gap: 14 }}>
      <View style={styles.sectionHead}>
        <T weight={700} size={16}>
          {title}
        </T>
        {action}
      </View>
      {children}
    </Card>
  );
}

/** The comp's stat tile: a mono caption, a big number, a faint note. */
export function StatTile({ label, value, note }: { label: string; value: string; note?: string }) {
  return (
    <Card radius={18} padding={14} style={{ flex: 1, gap: 8 }}>
      <Caption>{label}</Caption>
      <T weight={700} size={26} numberOfLines={1} adjustsFontSizeToFit style={{ lineHeight: 28 }}>
        {value}
      </T>
      {!!note && (
        <T weight={500} size={12} tone="faint" numberOfLines={1}>
          {note}
        </T>
      )}
    </Card>
  );
}

export function TileRow({ children }: { children: ReactNode }) {
  return <View style={styles.tiles}>{children}</View>;
}

/** A proportional bar with its label and share: "Egypt · 34%". */
export function BarRow({ label, fraction, detail }: { label: string; fraction: number; detail: string }) {
  return (
    <View style={{ gap: 6 }}>
      <View style={styles.barHead}>
        <T weight={600} size={14} numberOfLines={1} style={{ flex: 1 }}>
          {label}
        </T>
        <T mono weight={500} size={13} tone="muted">
          {detail}
        </T>
      </View>
      <View style={styles.barTrack}>
        <View style={[styles.barFill, { width: `${Math.max(0.02, Math.min(1, fraction)) * 100}%` }]} />
      </View>
    </View>
  );
}

export function ErrorNote({ message, onRetry }: { message: string; onRetry: () => void }) {
  return (
    <Card radius={24} style={{ gap: 14, padding: 20 }}>
      <T weight={700} size={17}>
        Couldn&apos;t load this
      </T>
      <T weight={400} size={15} tone="liveText" lineHeight={1.45}>
        {message}
      </T>
      <Button label="Try again" height={52} radius={16} onPress={onRetry} />
    </Card>
  );
}

/** A quiet card for "nothing here yet". */
export function EmptyNote({ title, body }: { title?: string; body: string }) {
  return (
    <Card radius={22} style={{ gap: 8, padding: 18 }}>
      {!!title && (
        <T weight={700} size={16}>
          {title}
        </T>
      )}
      <T weight={400} size={15} tone="muted" lineHeight={1.45}>
        {body}
      </T>
    </Card>
  );
}

// ── Skeletons: each tab's layout, unlit, while its data loads ──

export function OverviewSkeleton() {
  return (
    <SkeletonGroup style={styles.body}>
      <BonePanel style={{ borderRadius: 28, padding: 20, gap: 18 }}>
        <Bone w={150} h={12} />
        <View style={{ flexDirection: 'row', gap: 14, alignItems: 'center' }}>
          <Bone w={68} h={68} r={16} />
          <View style={{ flex: 1, gap: 8 }}>
            <Bone w="60%" h={18} />
            <Bone w="40%" h={13} />
          </View>
        </View>
        <Bone h={58} r={18} />
      </BonePanel>
      <View style={styles.tiles}>
        {[0, 1, 2].map((i) => (
          <BonePanel key={i} style={{ flex: 1, borderRadius: 18, padding: 14, gap: 10 }}>
            <Bone w="70%" h={10} />
            <Bone w="50%" h={22} />
          </BonePanel>
        ))}
      </View>
      <BonePanel>
        <Bone w="30%" h={14} />
        <Bone h={48} r={14} />
      </BonePanel>
    </SkeletonGroup>
  );
}

export function ListSkeleton({ heading = true, rows = 4 }: { heading?: boolean; rows?: number }) {
  return (
    <SkeletonGroup style={styles.body}>
      {heading && <Bone w={150} h={28} r={6} />}
      <BonePanel>
        <BoneRows count={rows} />
      </BonePanel>
      <BonePanel>
        <BoneRows count={2} />
      </BonePanel>
    </SkeletonGroup>
  );
}

export function RowsSkeleton({ count = 3 }: { count?: number }) {
  return (
    <SkeletonGroup>
      <BoneRows count={count} />
    </SkeletonGroup>
  );
}

const styles = StyleSheet.create({
  body: { paddingTop: 6, paddingHorizontal: 16, paddingBottom: 20, gap: 12 },
  sectionHead: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 12 },
  tiles: { flexDirection: 'row', gap: 8 },
  barHead: { flexDirection: 'row', alignItems: 'center', gap: 12 },
  barTrack: { height: 6, borderRadius: 3, backgroundColor: colors.bg, overflow: 'hidden' },
  barFill: { height: '100%', borderRadius: 3, backgroundColor: colors.autodj },
});
