import { Image } from 'expo-image';
import { useState } from 'react';
import { View } from 'react-native';

import { mediaUrl } from '../lib/api';
import { colors, SWATCHES } from '../lib/theme';
import { T } from './ui';

export function initialsOf(name: string): string {
  return (
    name
      .split(/\s+/)
      .filter(Boolean)
      .slice(0, 2)
      .map((w) => w[0]!.toUpperCase())
      .join('') || '?'
  );
}

/** A stable swatch per station, so its tile keeps its colour between lists. */
export function swatchFor(key: string): string {
  let h = 0;
  for (let i = 0; i < key.length; i++) h = (h * 31 + key.charCodeAt(i)) | 0;
  return SWATCHES[Math.abs(h) % SWATCHES.length]!;
}

/**
 * A station's artwork, or the comp's swatch tile with its initials when it
 * has none or the image won't load.
 */
export function StationArt({
  name,
  slug,
  url,
  size = 64,
}: {
  name: string;
  slug: string;
  url: string | null | undefined;
  size?: number;
}) {
  const src = mediaUrl(url);
  const [failed, setFailed] = useState<string | null>(null);
  const radius = size * 0.25;
  if (!src || failed === src) {
    return (
      <View
        style={{
          width: size,
          height: size,
          borderRadius: radius,
          backgroundColor: swatchFor(slug),
          alignItems: 'center',
          justifyContent: 'center',
        }}
      >
        <T weight={800} size={size * 0.34} style={{ color: colors.bg }}>
          {initialsOf(name)}
        </T>
      </View>
    );
  }
  return (
    <Image
      source={src}
      onError={() => setFailed(src)}
      contentFit="cover"
      transition={150}
      style={{ width: size, height: size, borderRadius: radius, backgroundColor: colors.raised }}
    />
  );
}
