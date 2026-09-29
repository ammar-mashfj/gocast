import { Image } from 'expo-image';
import { router } from 'expo-router';
import { Pressable, StyleSheet } from 'react-native';

import { mediaUrl } from '../lib/api';
import { useAuth } from '../lib/auth';
import { colors } from '../lib/theme';
import { initialsOf } from './StationArt';
import { T } from './ui';

/** The signed-in person's avatar, leading to Account. */
export function AccountButton() {
  const { state } = useAuth();
  const user = state.status === 'signedIn' ? state.user : null;
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel="Account"
      hitSlop={6}
      onPress={() => router.push('/account')}
      style={({ pressed }) => [styles.avatar, pressed && { opacity: 0.7 }]}
    >
      {user?.avatar_url ? (
        <Image source={mediaUrl(user.avatar_url)} style={StyleSheet.absoluteFill} contentFit="cover" />
      ) : (
        <T weight={700} size={14} tone="pro">
          {user ? initialsOf(user.name).slice(0, 1) : ''}
        </T>
      )}
    </Pressable>
  );
}

const styles = StyleSheet.create({
  avatar: {
    width: 36,
    height: 36,
    borderRadius: 18,
    overflow: 'hidden',
    backgroundColor: colors.avatar,
    alignItems: 'center',
    justifyContent: 'center',
  },
});
