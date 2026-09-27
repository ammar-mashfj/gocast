import { IconExternalLink } from '@tabler/icons-react-native';
import { useState, type ReactNode } from 'react';
import { Pressable, RefreshControl, ScrollView, StyleSheet, View } from 'react-native';

import { alpha, colors, fonts, radius } from '../../lib/theme';
import { openWeb } from '../../lib/web';
import { Bone, BonePanel, BoneRows, SkeletonGroup } from '../Skeleton';
import { Button, Panel, T } from '../ui';

/** A tab's scrolling body with pull-to-refresh. */
export function StationScreen({ onRefresh, children }: { onRefresh: () => Promise<unknown>; children: ReactNode }) {
  const [refreshing, setRefreshing] = useState(false);
  return (
    <ScrollView
      style={{ flex: 1, backgroundColor: colors.bg }}
      contentContainerStyle={styles.body}
      refreshControl={
        <RefreshControl
          refreshing={refreshing}
          tintColor={colors.text}
          colors={[colors.violet]}
          progressBackgroundColor={colors.popover}
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

/** A panel with a title row and an optional action on the right. */
export function Section({
  title,
  action,
  children,
  style,
}: {
  title: string;
  action?: ReactNode;
  children: ReactNode;
  style?: object;
}) {
  return (
    <Panel style={[styles.section, style]}>
      <View style={styles.sectionHead}>
        <T size={15} weight="semibold">
          {title}
        </T>
        {action}
      </View>
      {children}
    </Panel>
  );
}

export function TextLink({ label, onPress }: { label: string; onPress: () => void }) {
  return (
    <Pressable hitSlop={10} onPress={onPress}>
      <T tone="violet" size={13} weight="medium">
        {label}
      </T>
    </Pressable>
  );
}

/** A number with its label: "Peak at once · 12". */
export function StatTile({ label, value, hint }: { label: string; value: string; hint?: string }) {
  return (
    <View style={styles.tile}>
      <T tone="muted" size={12}>
        {label}
      </T>
      <T style={styles.tileValue} numberOfLines={1}>
        {value}
      </T>
      {!!hint && (
        <T tone="faint" size={11} numberOfLines={2}>
          {hint}
        </T>
      )}
    </View>
  );
}

export function TileGrid({ children }: { children: ReactNode }) {
  return <View style={styles.grid}>{children}</View>;
}

/** A row label and a proportional bar, for breakdowns. */
export function BarRow({ label, value, max, detail }: { label: string; value: number; max: number; detail: string }) {
  const pct = max > 0 ? Math.max(0.02, value / max) : 0;
  return (
    <View style={{ gap: 6 }}>
      <View style={styles.barHead}>
        <T size={14} numberOfLines={1} style={{ flex: 1 }}>
          {label}
        </T>
        <T mono size={12} tone="muted">
          {detail}
        </T>
      </View>
      <View style={styles.barTrack}>
        <View style={[styles.barFill, { width: `${pct * 100}%` }]} />
      </View>
    </View>
  );
}

// ── Skeletons: each tab's layout, unlit, while its data loads ──

function TileBones({ count = 2 }: { count?: number }) {
  return (
    <View style={styles.grid}>
      {Array.from({ length: count }, (_, i) => (
        <View key={i} style={[styles.tile, { gap: 10 }]}>
          <Bone w="55%" h={11} />
          <Bone w="40%" h={24} r={6} />
        </View>
      ))}
    </View>
  );
}

export function OverviewSkeleton() {
  return (
    <SkeletonGroup style={styles.body}>
      <BonePanel style={{ gap: 16 }}>
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 14 }}>
          <Bone w={52} h={52} r={radius.xl} />
          <View style={{ flex: 1, gap: 8 }}>
            <Bone w={84} h={28} r={radius.md} />
            <Bone w="45%" h={12} />
          </View>
        </View>
        <Bone h={78} r={radius.lg} />
        <Bone h={44} r={radius.md} />
      </BonePanel>
      <BonePanel>
        <Bone w="35%" h={14} />
        <Bone w={72} h={44} r={6} />
      </BonePanel>
      <BonePanel>
        <Bone w="45%" h={14} />
        <Bone h={44} r={radius.lg} />
      </BonePanel>
    </SkeletonGroup>
  );
}

export function AudienceSkeleton() {
  return (
    <SkeletonGroup style={styles.body}>
      <TileBones />
      <Bone h={46} r={radius.md} />
      <TileBones count={4} />
      <BonePanel>
        <Bone w="50%" h={14} />
        <View style={{ height: 120, flexDirection: 'row', alignItems: 'flex-end', gap: 3 }}>
          {Array.from({ length: 14 }, (_, i) => (
            <Bone key={i} w="auto" h={24 + ((i * 37) % 80)} r={2} style={{ flex: 1 }} />
          ))}
        </View>
      </BonePanel>
    </SkeletonGroup>
  );
}

export function ScheduleSkeleton() {
  return (
    <SkeletonGroup style={styles.body}>
      <BonePanel>
        <Bone w="35%" h={14} />
        <BoneRows count={3} lead={48} />
      </BonePanel>
      <BonePanel>
        <Bone w="35%" h={14} />
        <BoneRows count={2} lead={48} />
      </BonePanel>
    </SkeletonGroup>
  );
}

export function LibrarySkeleton() {
  return (
    <SkeletonGroup style={styles.body}>
      <BonePanel>
        <Bone w="30%" h={14} />
        <Bone h={6} r={3} />
        <Bone w="45%" h={11} />
      </BonePanel>
      <BonePanel>
        <Bone w="30%" h={14} />
        <BoneRows count={2} />
      </BonePanel>
      <BonePanel>
        <Bone w="35%" h={14} />
        <BoneRows count={5} />
      </BonePanel>
    </SkeletonGroup>
  );
}

/** A few unlit list rows, for a list inside a panel that is still loading. */
export function RowsSkeleton({ count = 3 }: { count?: number }) {
  return (
    <SkeletonGroup>
      <BoneRows count={count} />
    </SkeletonGroup>
  );
}

export function ErrorNote({ message, onRetry }: { message: string; onRetry: () => void }) {
  return (
    <Panel style={[styles.section, { borderColor: alpha(colors.fault, 0.4) }]}>
      <T tone="fault" size={14} style={{ lineHeight: 20 }}>
        {message}
      </T>
      <Button label="Try again" onPress={onRetry} />
    </Panel>
  );
}

/** For the parts of the dashboard the app only shows: finish the job on the web. */
export function EditOnWeb({ label, path }: { label: string; path: string }) {
  return (
    <Button
      label={label}
      icon={<IconExternalLink size={16} color={colors.text} />}
      onPress={() => openWeb(path)}
    />
  );
}

/** The amber Pro marker, after the thing it marks. */
export function ProTag() {
  return (
    <View style={styles.pro}>
      <T style={styles.proText}>PRO</T>
    </View>
  );
}

const styles = StyleSheet.create({
  body: { padding: 16, gap: 16, paddingBottom: 32 },
  section: { padding: 16, gap: 14 },
  sectionHead: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 12 },
  grid: { flexDirection: 'row', flexWrap: 'wrap', gap: 10 },
  tile: {
    flexGrow: 1,
    flexBasis: '45%',
    gap: 4,
    padding: 14,
    borderRadius: radius.xl,
    borderWidth: 1,
    borderColor: colors.hairline,
    backgroundColor: colors.panel,
  },
  tileValue: {
    fontFamily: fonts.display,
    fontSize: 26,
    letterSpacing: -0.6,
    color: colors.text,
    fontVariant: ['tabular-nums'],
  },
  barHead: { flexDirection: 'row', alignItems: 'center', gap: 12 },
  barTrack: { height: 6, borderRadius: 3, backgroundColor: alpha('#ffffff', 0.06), overflow: 'hidden' },
  barFill: { height: '100%', borderRadius: 3, backgroundColor: alpha(colors.violet, 0.7) },
  pro: {
    borderWidth: 1,
    borderRadius: radius.full,
    paddingHorizontal: 6,
    paddingVertical: 1,
    backgroundColor: alpha(colors.pro, 0.1),
    borderColor: alpha(colors.pro, 0.3),
  },
  proText: { fontFamily: fonts.semibold, fontSize: 11, letterSpacing: 0.5, color: colors.proText },
});
