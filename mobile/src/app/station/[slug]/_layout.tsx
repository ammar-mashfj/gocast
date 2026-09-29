import { useLocalSearchParams } from 'expo-router';
import { Tabs } from 'expo-router/js-tabs';
import { useCallback, useEffect, useMemo, useState } from 'react';
import { Pressable, StyleSheet, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { AccountButton } from '../../../components/AccountButton';
import { LiveStrip } from '../../../components/LiveStrip';
import { PillButton, T } from '../../../components/ui';
import { api } from '../../../lib/api';
import { errorText, StationContext, type Station } from '../../../lib/station';
import { colors } from '../../../lib/theme';
import { shareStation } from '../../../lib/web';

/**
 * The home screen: an account has one station, so this is where the app
 * opens (app/home.tsx hands over to it). Overview, Audience, Schedule and Library as bottom tabs. The
 * station payload is fetched here once and shared; each tab adds only what
 * it alone needs.
 */
export default function StationLayout() {
  const { slug, name } = useLocalSearchParams<{ slug: string; name?: string }>();
  const insets = useSafeAreaInsets();
  const [station, setStation] = useState<Station | null>(null);
  const [error, setError] = useState<string | null>(null);

  const reload = useCallback(async () => {
    try {
      const { data } = await api<{ data: Station }>(`/stations/${slug}`);
      setStation(data);
      setError(null);
    } catch (err) {
      setError(errorText(err));
    }
  }, [slug]);

  useEffect(() => {
    let active = true;
    api<{ data: Station }>(`/stations/${slug}`).then(
      ({ data }) => active && setStation(data),
      (err) => active && setError(errorText(err)),
    );
    return () => {
      active = false;
    };
  }, [slug]);

  const value = useMemo(() => ({ slug, station, error, reload }), [slug, station, error, reload]);
  const title = station?.name ?? name ?? 'Station';

  return (
    <StationContext.Provider value={value}>
      <View style={[styles.screen, { paddingTop: insets.top }]}>
        <LiveStrip />
        <View style={styles.header}>
          <AccountButton />
          <T weight={700} size={19} tracking={-0.02} numberOfLines={1} style={{ flex: 1 }}>
            {title}
          </T>
          <PillButton label="Share" variant="card" onPress={() => shareStation(slug, title)} />
        </View>
        <Tabs
          tabBar={(props) => <TabBar {...props} />}
          screenOptions={{ headerShown: false, sceneStyle: { backgroundColor: colors.bg } }}
        >
          <Tabs.Screen name="index" options={{ title: 'Overview' }} />
          <Tabs.Screen name="audience" options={{ title: 'Audience' }} />
          <Tabs.Screen name="schedule" options={{ title: 'Schedule' }} />
          <Tabs.Screen name="library" options={{ title: 'Library' }} />
        </Tabs>
      </View>
    </StationContext.Provider>
  );
}

type TabBarProps = Parameters<NonNullable<React.ComponentProps<typeof Tabs>['tabBar']>>[0];

/** The comp's tab bar: text labels, with a bar over the current one. */
function TabBar({ state, descriptors, navigation }: TabBarProps) {
  const insets = useSafeAreaInsets();
  return (
    <View style={[styles.tabs, { paddingBottom: insets.bottom }]} accessibilityRole="tablist">
      {state.routes.map((route, index) => {
        const focused = state.index === index;
        const label = descriptors[route.key]?.options.title ?? route.name;
        return (
          <Pressable
            key={route.key}
            accessibilityRole="tab"
            accessibilityState={{ selected: focused }}
            onPress={() => {
              const event = navigation.emit({ type: 'tabPress', target: route.key, canPreventDefault: true });
              if (!focused && !event.defaultPrevented) navigation.navigate(route.name, route.params);
            }}
            style={styles.tab}
          >
            <View style={[styles.tabBar, { backgroundColor: focused ? colors.text : 'transparent' }]} />
            <T weight={600} size={12} tone={focused ? 'text' : 'faint'}>
              {label}
            </T>
          </Pressable>
        );
      })}
    </View>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.bg },
  header: { height: 52, flexDirection: 'row', alignItems: 'center', gap: 12, paddingHorizontal: 14 },
  tabs: {
    flexDirection: 'row',
    paddingTop: 6,
    paddingHorizontal: 10,
    borderTopWidth: 1,
    borderTopColor: colors.hairline,
    backgroundColor: colors.bg,
  },
  tab: { flex: 1, height: 54, alignItems: 'center', justifyContent: 'center', gap: 6 },
  tabBar: { width: 34, height: 4, borderRadius: 2 },
});
