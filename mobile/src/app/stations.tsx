import { IconChevronRight, IconPlayerPlayFilled, IconRefresh } from '@tabler/icons-react-native';
import { Image } from 'expo-image';
import { router, useFocusEffect } from 'expo-router';
import { useCallback, useState } from 'react';
import { FlatList, Pressable, RefreshControl, StyleSheet, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { useBroadcast } from '../broadcast/BroadcastContext';
import { TopBar } from '../components/AppHeader';
import { Wordmark } from '../components/Brand';
import { Bone, BonePanel, SkeletonGroup } from '../components/Skeleton';
import { StationArt } from '../components/StationArt';
import { Button, PageTitle, Panel, Pill, PlanTag, T } from '../components/ui';
import { api, mediaUrl } from '../lib/api';
import { useAuth } from '../lib/auth';
import { alpha, colors, fonts, radius } from '../lib/theme';
import { openWeb } from '../lib/web';

interface Station {
  id: number;
  name: string;
  slug: string;
  genre?: string | null;
  artwork_url?: string | null;
  is_live: boolean;
  is_on_air?: boolean;
  now_playing?: { title: string | null; artist: string | null } | null;
}

/** How often the list refreshes while it is on screen, so the pills stay honest. */
const POLL_MS = 20_000;

/**
 * Home: the broadcaster's stations, each one tap from Go Live. While a show
 * is running from this phone, the LIVE strip at the top leads back to it.
 */
export default function Home() {
  const { state } = useAuth();
  const broadcast = useBroadcast();
  const insets = useSafeAreaInsets();
  const [stations, setStations] = useState<Station[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [refreshing, setRefreshing] = useState(false);

  const load = useCallback(
    () =>
      api<{ data: Station[] }>('/stations').then(
        ({ data }) => {
          setStations(data);
          setError(null);
        },
        (err) => setError(err instanceof Error ? err.message : String(err)),
      ),
    [],
  );

  useFocusEffect(
    useCallback(() => {
      load();
      const id = setInterval(load, POLL_MS);
      return () => clearInterval(id);
    }, [load]),
  );

  const user = state.status === 'signedIn' ? state.user : null;
  const onAir = broadcast.state === 'live' || broadcast.state === 'reconnecting';
  const liveSlug = onAir ? broadcast.stationSlug : null;

  const openStation = (s: Station) =>
    router.push({ pathname: '/station/[slug]', params: { slug: s.slug, name: s.name } });
  const goLive = (s: Station) =>
    router.push(
      liveSlug === s.slug
        ? { pathname: '/studio/[slug]', params: { slug: s.slug } }
        : { pathname: '/live/[slug]', params: { slug: s.slug, name: s.name } },
    );

  return (
    <View style={styles.screen}>
      <TopBar
        right={
          user && (
            <Pressable
              accessibilityRole="button"
              accessibilityLabel="Account"
              hitSlop={8}
              onPress={() => router.push('/account')}
              style={({ pressed }) => [styles.avatar, pressed && { opacity: 0.7 }]}
            >
              {user.avatar_url ? (
                <Image source={mediaUrl(user.avatar_url)} style={StyleSheet.absoluteFill} contentFit="cover" />
              ) : (
                <T size={13} weight="semibold" style={{ color: colors.violetPale }}>
                  {initialsOf(user.name)}
                </T>
              )}
            </Pressable>
          )
        }
      >
        <Wordmark width={112} />
      </TopBar>

      {onAir && broadcast.stationSlug && <LiveStrip />}

      <FlatList
        data={stations ?? []}
        keyExtractor={(s) => s.slug}
        contentContainerStyle={[styles.list, { paddingBottom: insets.bottom + 32 }]}
        refreshControl={
          <RefreshControl
            refreshing={refreshing}
            tintColor={colors.text}
            colors={[colors.violet]}
            progressBackgroundColor={colors.popover}
            onRefresh={async () => {
              setRefreshing(true);
              await load();
              setRefreshing(false);
            }}
          />
        }
        ListHeaderComponent={
          <View style={styles.heading}>
            <PageTitle>Your stations</PageTitle>
            {user?.plan && <PlanTag slug={user.plan.slug} name={user.plan.name} />}
          </View>
        }
        ListEmptyComponent={
          error ? (
            <ErrorPanel message={error} onRetry={load} />
          ) : stations === null ? (
            <Skeleton />
          ) : (
            <EmptyPanel />
          )
        }
        ListFooterComponent={
          error && stations?.length ? (
            <T tone="fault" size={13} style={{ textAlign: 'center' }}>
              Couldn&apos;t refresh: {error}
            </T>
          ) : null
        }
        renderItem={({ item, index }) => (
          <StationCard
            station={item}
            primary={index === 0 && !liveSlug}
            broadcastingHere={liveSlug === item.slug}
            onPress={() => openStation(item)}
            onGoLive={() => goLive(item)}
          />
        )}
      />
    </View>
  );
}

function StationCard({
  station,
  primary,
  broadcastingHere,
  onPress,
  onGoLive,
}: {
  station: Station;
  primary: boolean;
  broadcastingHere: boolean;
  onPress: () => void;
  onGoLive: () => void;
}) {
  const lit = station.is_live || !!station.is_on_air;
  const np = station.now_playing;
  const track = np ? [np.title, np.artist].filter(Boolean).join(' — ') : null;

  return (
    <Pressable onPress={onPress} accessibilityRole="button" accessibilityLabel={`Open ${station.name}`}>
      {({ pressed }) => (
        <Panel style={[styles.card, pressed && { backgroundColor: colors.popover }]}>
          <View style={styles.cardTop}>
            <StationArt name={station.name} url={station.artwork_url} lit={lit} size={56} />
            <View style={{ flex: 1, gap: 3 }}>
              <T size={17} weight="semibold" numberOfLines={1}>
                {station.name}
              </T>
              <T mono size={12} tone="faint" numberOfLines={1}>
                /{station.slug}
              </T>
            </View>
            {station.is_live ? (
              <Pill label="LIVE" tone="live" />
            ) : station.is_on_air ? (
              <Pill label="ON AIR" tone="onAir" />
            ) : (
              <Pill label="OFF AIR" tone="off" />
            )}
          </View>

          {track && (
            <View style={styles.nowPlaying}>
              <IconPlayerPlayFilled size={12} color={station.is_live ? colors.liveText : colors.violetText} />
              <T size={13} tone="secondary" numberOfLines={1} style={{ flex: 1 }}>
                {track}
              </T>
            </View>
          )}

          <Button
            label={broadcastingHere ? 'Open studio' : 'Go live'}
            variant={broadcastingHere || primary ? 'primary' : 'outline'}
            onPress={onGoLive}
          />
        </Panel>
      )}
    </Pressable>
  );
}

/** The studio lamp's banner: a show is running from this phone. */
function LiveStrip() {
  const broadcast = useBroadcast();
  const reconnecting = broadcast.state === 'reconnecting';
  return (
    <Pressable
      onPress={() => router.push({ pathname: '/studio/[slug]', params: { slug: broadcast.stationSlug! } })}
      style={[
        styles.strip,
        reconnecting
          ? { backgroundColor: alpha(colors.fault, 0.12), borderColor: alpha(colors.fault, 0.4) }
          : { backgroundColor: alpha(colors.live, 0.08), borderColor: alpha(colors.live, 0.25) },
      ]}
    >
      <View style={[styles.chip, { backgroundColor: reconnecting ? colors.fault : colors.live }]}>
        <T style={[styles.chipText, { color: reconnecting ? colors.faultInk : colors.liveInk }]}>
          {reconnecting ? 'RECONNECTING' : 'LIVE'}
        </T>
      </View>
      <T size={14} style={{ flex: 1 }} numberOfLines={1}>
        {broadcast.stationName}
      </T>
      <T size={14} tone="violet" weight="semibold">
        Open studio
      </T>
      <IconChevronRight size={16} color={colors.violetText} />
    </Pressable>
  );
}

function EmptyPanel() {
  return (
    <Panel style={styles.empty}>
      <T size={17} weight="semibold">
        No stations yet
      </T>
      <T tone="muted" size={14} style={{ lineHeight: 21 }}>
        Create your station on the web. It takes a name and a minute. Then pull down here to see it.
      </T>
      <Button label="Create a station" variant="primary" onPress={() => openWeb('/dashboard')} />
    </Panel>
  );
}

function ErrorPanel({ message, onRetry }: { message: string; onRetry: () => void }) {
  return (
    <Panel style={[styles.empty, { borderColor: alpha(colors.fault, 0.4) }]}>
      <T size={17} weight="semibold">
        Couldn&apos;t load your stations
      </T>
      <T tone="fault" size={14} style={{ lineHeight: 21 }}>
        {message}
      </T>
      <Button label="Try again" icon={<IconRefresh size={18} color={colors.text} />} onPress={onRetry} />
    </Panel>
  );
}

/** Unlit placeholders in the shape of two cards while the list loads. */
function Skeleton() {
  return (
    <SkeletonGroup style={{ gap: 12 }}>
      {[0, 1].map((i) => (
        <BonePanel key={i} style={styles.card}>
          <View style={styles.cardTop}>
            <Bone w={56} h={56} r={radius.xl} />
            <View style={{ flex: 1, gap: 8 }}>
              <Bone w={i ? '45%' : '60%'} h={15} />
              <Bone w="30%" h={11} />
            </View>
            <Bone w={64} h={20} r={radius.full} />
          </View>
          <Bone h={44} r={radius.md} />
        </BonePanel>
      ))}
    </SkeletonGroup>
  );
}

function initialsOf(name: string): string {
  return (
    name
      .split(/\s+/)
      .filter(Boolean)
      .slice(0, 2)
      .map((w) => w[0]!.toUpperCase())
      .join('') || '?'
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.bg },
  avatar: {
    width: 36,
    height: 36,
    borderRadius: 18,
    overflow: 'hidden',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: alpha(colors.violet, 0.2),
    borderWidth: 1,
    borderColor: alpha(colors.violet, 0.5),
  },
  strip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    borderTopWidth: 1,
    borderBottomWidth: 1,
    paddingHorizontal: 16,
    minHeight: 52,
  },
  chip: { height: 26, borderRadius: radius.md, paddingHorizontal: 10, justifyContent: 'center' },
  chipText: { fontFamily: fonts.bold, fontSize: 12, letterSpacing: 1 },
  list: { paddingHorizontal: 16, gap: 12 },
  heading: { flexDirection: 'row', alignItems: 'center', gap: 10, paddingTop: 16, paddingBottom: 6 },
  card: { padding: 16, gap: 14 },
  cardTop: { flexDirection: 'row', alignItems: 'center', gap: 14 },
  nowPlaying: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    paddingHorizontal: 12,
    paddingVertical: 10,
    borderRadius: radius.lg,
    backgroundColor: alpha('#ffffff', 0.03),
    borderWidth: 1,
    borderColor: colors.divider,
  },
  empty: { padding: 20, gap: 12 },
});
