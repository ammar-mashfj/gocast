import { Redirect, router, useFocusEffect } from 'expo-router';
import { useCallback, useState } from 'react';
import { StyleSheet, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { OverviewSkeleton } from '../components/station/parts';
import { Button, Card, T, Wordmark } from '../components/ui';
import { api } from '../lib/api';
import { errorText, type Station } from '../lib/station';
import { colors } from '../lib/theme';
import { openWeb } from '../lib/web';

/**
 * Where a signed-in person lands. An account has one station, so this only
 * finds it and hands over to the station page, replacing itself so back
 * leaves the app. Nothing to show unless there is no station yet, or the
 * API can't be reached.
 */
export default function Home() {
  const insets = useSafeAreaInsets();
  const [station, setStation] = useState<Station | null>(null);
  const [state, setState] = useState<'loading' | 'none' | { error: string }>('loading');

  const load = useCallback(async () => {
    setState('loading');
    try {
      const { data } = await api<{ data: Station[] }>('/stations');
      if (data[0]) setStation(data[0]);
      else setState('none');
    } catch (err) {
      setState({ error: errorText(err) });
    }
  }, []);

  // Again on focus: someone who went to the web to create their station
  // comes back to find it.
  useFocusEffect(
    useCallback(() => {
      load();
    }, [load]),
  );

  if (station) {
    return <Redirect href={{ pathname: '/station/[slug]', params: { slug: station.slug, name: station.name } }} />;
  }

  return (
    <View style={[styles.screen, { paddingTop: insets.top, paddingBottom: insets.bottom + 22 }]}>
      {state === 'loading' ? (
        <OverviewSkeleton />
      ) : (
        <View style={styles.body}>
          <View style={styles.top}>
            <Wordmark />
            <Button
              label="Account"
              variant="subtle"
              height={36}
              radius={12}
              size={13}
              onPress={() => router.push('/account')}
            />
          </View>
          <Card radius={26} padding={20} style={{ gap: 12 }}>
            <T weight={800} size={28} tracking={-0.03} style={{ lineHeight: 30 }}>
              {state === 'none' ? 'Create your station' : 'Couldn’t reach GoCast'}
            </T>
            <T weight={400} size={15} tone="muted" lineHeight={1.45}>
              {state === 'none'
                ? 'It takes a name and a minute on the web. Come back here and it opens on its own.'
                : state.error}
            </T>
            {state === 'none' ? (
              <Button label="Create on the web" onPress={() => openWeb('/dashboard')} />
            ) : (
              <Button label="Try again" onPress={load} />
            )}
          </Card>
        </View>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.bg },
  body: { flex: 1, paddingHorizontal: 18, gap: 24 },
  top: { height: 52, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
});
