import * as WebBrowser from 'expo-web-browser';

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
    controlsColor: colors.violetPale,
    enableBarCollapsing: true,
  });
}
