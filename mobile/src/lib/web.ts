import * as WebBrowser from 'expo-web-browser';
import { Share } from 'react-native';

import { colors } from './theme';

const APP_URL = process.env.EXPO_PUBLIC_APP_URL ?? '';

export function webUrl(path: string): string {
  return `${APP_URL}${path}`;
}

/**
 * Open a page of the web app (sign-up, password reset, the dashboard) in an
 * in-app browser tab, for the things the app does not do itself.
 */
export function openWeb(path: string) {
  return WebBrowser.openBrowserAsync(webUrl(path), {
    toolbarColor: colors.bg,
    controlsColor: colors.autodjText,
    enableBarCollapsing: true,
  });
}

/** The system share sheet with the station's player page. */
export function shareStation(slug: string, name: string) {
  const url = webUrl(`/station/${slug}`);
  return Share.share({ message: `Listen to ${name}: ${url}`, url });
}
