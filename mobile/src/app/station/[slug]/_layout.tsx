import {
  IconBroadcast,
  IconCalendarTime,
  IconChartBar,
  IconMicrophone,
  IconPlaylist,
  IconShare,
} from '@tabler/icons-react-native';
import { router, Stack, useLocalSearchParams } from 'expo-router';
import { Tabs } from 'expo-router/js-tabs';
import { useCallback, useEffect, useMemo, useState } from 'react';
import { Share } from 'react-native';

import { useBroadcast } from '../../../broadcast/BroadcastContext';
import { HeaderIcon } from '../../../components/AppHeader';
import { Button } from '../../../components/ui';
import { api } from '../../../lib/api';
import { errorText, StationContext, type Station } from '../../../lib/station';
import { colors, fonts } from '../../../lib/theme';
import { webUrl } from '../../../lib/web';

/**
 * One station: Overview, Audience, Schedule and Library as bottom tabs, the
 * web dashboard's station pages for a phone. The station payload is fetched
 * here once and shared; each tab adds only what it alone needs.
 */
export default function StationLayout() {
  const { slug, name } = useLocalSearchParams<{ slug: string; name?: string }>();
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

  const broadcast = useBroadcast();
  const liveHere =
    broadcast.stationSlug === slug && (broadcast.state === 'live' || broadcast.state === 'reconnecting');
  const title = station?.name ?? name ?? 'Station';

  const value = useMemo(() => ({ slug, station, error, reload }), [slug, station, error, reload]);

  return (
    <StationContext.Provider value={value}>
      <Stack.Screen
        options={{
          title,
          headerRight: () => (
            <>
              <HeaderIcon
                label="Share station"
                onPress={() => {
                  const url = webUrl(`/station/${slug}`);
                  Share.share({ message: url, url });
                }}
              >
                <IconShare size={20} color={colors.text} />
              </HeaderIcon>
              <Button
                label={liveHere ? 'Studio' : 'Go live'}
                variant={liveHere ? 'outline' : 'primary'}
                height={36}
                icon={<IconMicrophone size={16} color={liveHere ? colors.text : '#ffffff'} />}
                style={{ paddingHorizontal: 12 }}
                onPress={() =>
                  router.push(
                    liveHere
                      ? { pathname: '/studio/[slug]', params: { slug } }
                      : { pathname: '/live/[slug]', params: { slug, name: title } },
                  )
                }
              />
            </>
          ),
        }}
      />
      <Tabs
        screenOptions={{
          headerShown: false,
          sceneStyle: { backgroundColor: colors.bg },
          tabBarStyle: {
            backgroundColor: colors.bg,
            borderTopColor: colors.hairline,
            borderTopWidth: 1,
            paddingTop: 4,
          },
          tabBarActiveTintColor: colors.violetPale,
          tabBarInactiveTintColor: colors.faint,
          tabBarLabelStyle: { fontFamily: fonts.medium, fontSize: 11 },
        }}
      >
        <Tabs.Screen
          name="index"
          options={{ title: 'Overview', tabBarIcon: ({ color }) => <IconBroadcast size={22} color={color} /> }}
        />
        <Tabs.Screen
          name="audience"
          options={{ title: 'Audience', tabBarIcon: ({ color }) => <IconChartBar size={22} color={color} /> }}
        />
        <Tabs.Screen
          name="schedule"
          options={{ title: 'Schedule', tabBarIcon: ({ color }) => <IconCalendarTime size={22} color={color} /> }}
        />
        <Tabs.Screen
          name="library"
          options={{ title: 'Library', tabBarIcon: ({ color }) => <IconPlaylist size={22} color={color} /> }}
        />
      </Tabs>
    </StationContext.Provider>
  );
}
