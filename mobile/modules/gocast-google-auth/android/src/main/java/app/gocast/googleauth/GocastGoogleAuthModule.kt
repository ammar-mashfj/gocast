package app.gocast.googleauth

import androidx.credentials.ClearCredentialStateRequest
import androidx.credentials.CredentialManager
import androidx.credentials.CustomCredential
import androidx.credentials.GetCredentialRequest
import androidx.credentials.exceptions.GetCredentialCancellationException
import androidx.credentials.exceptions.GetCredentialException
import androidx.credentials.exceptions.NoCredentialException
import com.google.android.libraries.identity.googleid.GetSignInWithGoogleOption
import com.google.android.libraries.identity.googleid.GoogleIdTokenCredential
import expo.modules.kotlin.Promise
import expo.modules.kotlin.modules.Module
import expo.modules.kotlin.modules.ModuleDefinition
import kotlinx.coroutines.CoroutineScope
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.SupervisorJob
import kotlinx.coroutines.launch

/**
 * "Sign in with Google" through Android's Credential Manager: the system
 * bottom sheet listing the Google accounts already on the phone.
 *
 * It returns Google's ID token, a JWT whose audience is the web client ID
 * passed in (the API's own client), which the API verifies and swaps for a
 * Sanctum token. Nothing secret lives in the app. Google only opens the sheet
 * for an Android OAuth client registered with this package name and the
 * signing certificate's SHA-1; a mismatch surfaces as a GetCredentialException.
 */
class GocastGoogleAuthModule : Module() {
  private val scope = CoroutineScope(SupervisorJob() + Dispatchers.Main)

  override fun definition() = ModuleDefinition {
    Name("GocastGoogleAuth")

    // Resolves { idToken, email, name } or null when the person dismisses the sheet.
    AsyncFunction("signIn") { webClientId: String, promise: Promise ->
      val activity = appContext.currentActivity
      if (activity == null) {
        promise.reject("ERR_NO_ACTIVITY", "The app isn't in the foreground.", null)
        return@AsyncFunction
      }
      val request = GetCredentialRequest.Builder()
        .addCredentialOption(GetSignInWithGoogleOption.Builder(webClientId).build())
        .build()

      scope.launch {
        try {
          val credential = CredentialManager.create(activity).getCredential(activity, request).credential
          if (credential is CustomCredential &&
            credential.type == GoogleIdTokenCredential.TYPE_GOOGLE_ID_TOKEN_CREDENTIAL
          ) {
            val google = GoogleIdTokenCredential.createFrom(credential.data)
            promise.resolve(
              mapOf("idToken" to google.idToken, "email" to google.id, "name" to google.displayName)
            )
          } else {
            promise.reject("ERR_GOOGLE", "Google returned an unexpected credential.", null)
          }
        } catch (e: GetCredentialCancellationException) {
          promise.resolve(null)
        } catch (e: NoCredentialException) {
          promise.reject("ERR_NO_ACCOUNT", "There's no Google account on this phone. Add one in Settings, or sign in with email.", e)
        } catch (e: GetCredentialException) {
          promise.reject("ERR_GOOGLE", e.message ?: "Google sign-in failed.", e)
        }
      }
    }

    // Forget the account chosen last time, so the next sign-in asks again.
    AsyncFunction("signOut") { promise: Promise ->
      val context = appContext.reactContext
      if (context == null) {
        promise.resolve(null)
        return@AsyncFunction
      }
      scope.launch {
        try {
          CredentialManager.create(context).clearCredentialState(ClearCredentialStateRequest())
        } catch (_: Exception) {
          // Best effort: signing out of GoCast doesn't depend on it.
        }
        promise.resolve(null)
      }
    }
  }
}
