import { NativeModule, requireNativeModule } from 'expo';

declare class GocastGoogleAuthModule extends NativeModule<{}> {
  /**
   * Show Android's "Sign in with Google" sheet. Resolves null if the person
   * dismissed it. `webClientId` is the API's web OAuth client: the ID token's
   * audience, which the API checks.
   */
  signIn(webClientId: string): Promise<{ idToken: string; email: string; name: string | null } | null>;
  /** Forget the last chosen account, so the next sign-in shows the chooser. */
  signOut(): Promise<void>;
}

export default requireNativeModule<GocastGoogleAuthModule>('GocastGoogleAuth');
