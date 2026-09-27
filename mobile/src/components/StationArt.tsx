import { Image } from 'expo-image';
import { useState } from 'react';

import { mediaUrl } from '../lib/api';
import { colors, radius } from '../lib/theme';
import { InitialsTile } from './ui';

/**
 * A station's artwork, or its initials tile when it has none or the image
 * won't load. Unlit (dimmed) while the station is off air.
 */
export function StationArt({
  name,
  url,
  lit,
  size = 56,
}: {
  name: string;
  url: string | null | undefined;
  lit: boolean;
  size?: number;
}) {
  const src = mediaUrl(url);
  const [failed, setFailed] = useState<string | null>(null);
  if (!src || failed === src) return <InitialsTile name={name} lit={lit} size={size} />;
  return (
    <Image
      source={src}
      onError={() => setFailed(src)}
      contentFit="cover"
      transition={150}
      style={{
        width: size,
        height: size,
        borderRadius: size >= 48 ? radius.xl : radius.lg,
        backgroundColor: colors.unlit,
        opacity: lit ? 1 : 0.5,
      }}
    />
  );
}
