import * as SecureStore from 'expo-secure-store';
import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from 'react';
import { Platform } from 'react-native';

import GocastGoogleAuth from '../../modules/gocast-google-auth/src/GocastGoogleAuthModule';
import { api, ApiError, setApiToken } from './api';

const TOKEN_KEY = 'auth-token';

/**
 * The API's web OAuth client ID. Android's sheet issues the ID token for this
 * audience, and the API accepts only tokens issued for it. Not a secret.
 */
const GOOGLE_WEB_CLIENT_ID = process.env.EXPO_PUBLIC_GOOGLE_WEB_CLIENT_ID ?? '';
const DEVICE_NAME = `GoCast app (${Platform.OS})`;

export interface User {
  id: number;
  name: string;
  email: string;
  avatar_url?: string | null;
  /** From GET /user (UserResource). Null when the account has no plan row. */
  plan?: {
    slug: string;
    name: string;
    autodj_enabled: boolean;
    max_listeners: number;
    /** When a time-limited plan drops back to Free; null when open-ended. */
    expires_at: string | null;
  } | null;
}

type AuthState = { status: 'loading' } | { status: 'signedOut' } | { status: 'signedIn'; user: User };

interface AuthContextValue {
  state: AuthState;
  signIn: (email: string, password: string) => Promise<void>;
  /** Resolves false if the person closed the Google page without finishing. */
  signInWithGoogle: () => Promise<boolean>;
  signOut: () => Promise<void>;
}

const AuthContext = createContext<AuthContextValue | null>(null);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [state, setState] = useState<AuthState>({ status: 'loading' });

  // Restore a saved session. A token the API no longer accepts is dropped;
  // a network failure is not, so a phone that boots offline stays signed in.
  useEffect(() => {
    (async () => {
      const saved = await SecureStore.getItemAsync(TOKEN_KEY);
      if (!saved) return setState({ status: 'signedOut' });
      setApiToken(saved);
      try {
        const { data } = await api<{ data: User }>('/user');
        setState({ status: 'signedIn', user: data });
      } catch (err) {
        if (err instanceof ApiError && err.status === 401) {
          await SecureStore.deleteItemAsync(TOKEN_KEY);
          setApiToken(null);
        }
        setState({ status: 'signedOut' });
      }
    })();
  }, []);

  const adoptToken = useCallback(async (token: string) => {
    await SecureStore.setItemAsync(TOKEN_KEY, token);
    setApiToken(token);
    // Login returns the bare model; /user is the resource with the plan.
    const { data } = await api<{ data: User }>('/user');
    setState({ status: 'signedIn', user: data });
  }, []);

  const signIn = useCallback(async (email: string, password: string) => {
    // device_name opts into getting the token in the body; see
    // AuthController::login. It also names the token in the user's sessions.
    const { token } = await api<{ token: string }>('/auth/login', {
      method: 'POST',
      body: { email, password, device_name: DEVICE_NAME },
    });
    await adoptToken(token);
  }, [adoptToken]);

  // Android's "Sign in with Google" sheet (Credential Manager). It hands us
  // Google's ID token; the API verifies it and returns our own token
  // (GoogleAuthController::native).
  const signInWithGoogle = useCallback(async () => {
    if (!GOOGLE_WEB_CLIENT_ID) throw new Error('Google sign-in isn’t set up in this build.');
    const google = await GocastGoogleAuth.signIn(GOOGLE_WEB_CLIENT_ID);
    if (!google) return false;
    const { token } = await api<{ token: string }>('/auth/google/native', {
      method: 'POST',
      body: { id_token: google.idToken, device_name: DEVICE_NAME },
    });
    await adoptToken(token);
    return true;
  }, [adoptToken]);

  const signOut = useCallback(async () => {
    await api('/logout', { method: 'POST' }).catch(() => {});
    await GocastGoogleAuth.signOut().catch(() => {});
    await SecureStore.deleteItemAsync(TOKEN_KEY);
    setApiToken(null);
    setState({ status: 'signedOut' });
  }, []);

  const value = useMemo(
    () => ({ state, signIn, signInWithGoogle, signOut }),
    [state, signIn, signInWithGoogle, signOut],
  );
  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

/**
 * Does this account NOT have AutoDJ? Negative on purpose, as on the web
 * (useAutoDjLocked): an unknown plan must behave as unlocked.
 */
export function useAutoDjLocked(): boolean {
  const { state } = useAuth();
  const plan = state.status === 'signedIn' ? state.user.plan : undefined;
  return !!plan && !plan.autodj_enabled;
}

export function useAuth(): AuthContextValue {
  const value = useContext(AuthContext);
  if (!value) throw new Error('useAuth outside AuthProvider');
  return value;
}

