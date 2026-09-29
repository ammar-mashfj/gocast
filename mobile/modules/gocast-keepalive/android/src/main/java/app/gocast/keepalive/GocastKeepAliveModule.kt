package app.gocast.keepalive

import android.annotation.SuppressLint
import android.content.Context
import android.content.Intent
import android.net.Uri
import android.net.wifi.WifiManager
import android.os.Build
import android.os.PowerManager
import android.provider.Settings
import expo.modules.kotlin.modules.Module
import expo.modules.kotlin.modules.ModuleDefinition

/**
 * What keeps a broadcast alive through a night with the screen off, beyond the
 * foreground service react-native-audio-api already runs.
 *
 * The foreground service stops Android killing the process, but not the radio
 * or the CPU going to sleep under it: with the screen off, Wi-Fi drops into
 * power save and can reassociate, which kills the webcast socket while the app
 * looks healthy. The Wi-Fi lock holds the radio at full performance and the
 * partial wake lock keeps the CPU running the encoder when nothing is playing
 * out of the speaker to hold one implicitly.
 *
 * Samsung (and other OEMs) also run their own background limits on top of
 * stock Android and will stop a foreground service anyway unless the app is
 * exempt from battery optimisation, which Samsung shows as "Unrestricted".
 * Only the person can grant that, through the system dialog below.
 */
class GocastKeepAliveModule : Module() {
  private var wifiLock: WifiManager.WifiLock? = null
  private var wakeLock: PowerManager.WakeLock? = null

  private val context: Context
    get() = appContext.reactContext ?: throw IllegalStateException("No React context")

  override fun definition() = ModuleDefinition {
    Name("GocastKeepAlive")

    Function("acquire") {
      acquireLocks()
    }

    Function("release") {
      releaseLocks()
    }

    Function("isIgnoringBatteryOptimizations") {
      val power = context.getSystemService(Context.POWER_SERVICE) as PowerManager
      power.isIgnoringBatteryOptimizations(context.packageName)
    }

    Function("requestIgnoreBatteryOptimizations") {
      openBatteryExemption()
    }

    OnDestroy {
      releaseLocks()
    }
  }

  @SuppressLint("WakelockTimeout")
  private fun acquireLocks() {
    if (wakeLock?.isHeld != true) {
      val power = context.getSystemService(Context.POWER_SERVICE) as PowerManager
      // No timeout: a show runs as long as it runs, and release() always follows stop.
      wakeLock = power.newWakeLock(PowerManager.PARTIAL_WAKE_LOCK, "GoCast:broadcast").apply {
        setReferenceCounted(false)
        acquire()
      }
    }
    if (wifiLock?.isHeld != true) {
      val wifi = context.applicationContext.getSystemService(Context.WIFI_SERVICE) as WifiManager
      @Suppress("DEPRECATION")
      val mode = if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.Q) {
        WifiManager.WIFI_MODE_FULL_LOW_LATENCY
      } else {
        WifiManager.WIFI_MODE_FULL_HIGH_PERF
      }
      wifiLock = wifi.createWifiLock(mode, "GoCast:broadcast").apply {
        setReferenceCounted(false)
        acquire()
      }
    }
  }

  private fun releaseLocks() {
    wakeLock?.let { if (it.isHeld) it.release() }
    wakeLock = null
    wifiLock?.let { if (it.isHeld) it.release() }
    wifiLock = null
  }

  /**
   * The direct "Allow GoCast to always run in the background?" dialog, or the
   * battery optimisation list if a skin has removed that dialog.
   */
  @SuppressLint("BatteryLife")
  private fun openBatteryExemption() {
    val activity = appContext.currentActivity
    val launcher: Context = activity ?: context
    val flags = if (activity == null) Intent.FLAG_ACTIVITY_NEW_TASK else 0
    val direct = Intent(Settings.ACTION_REQUEST_IGNORE_BATTERY_OPTIMIZATIONS)
      .setData(Uri.parse("package:${context.packageName}"))
      .addFlags(flags)
    try {
      launcher.startActivity(direct)
    } catch (e: Exception) {
      launcher.startActivity(Intent(Settings.ACTION_IGNORE_BATTERY_OPTIMIZATION_SETTINGS).addFlags(flags))
    }
  }
}
