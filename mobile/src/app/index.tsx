import { Redirect } from 'expo-router';

import { useAuth } from '../lib/auth';

/** The auth gate. While the session is checked the native splash covers it. */
export default function Index() {
  const { state } = useAuth();
  if (state.status === 'loading') return null;
  return <Redirect href={state.status === 'signedIn' ? '/stations' : '/login'} />;
}
