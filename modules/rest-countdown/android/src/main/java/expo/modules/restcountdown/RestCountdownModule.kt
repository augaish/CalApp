package expo.modules.restcountdown

import android.app.AlarmManager
import android.content.Context
import android.content.Intent
import android.net.Uri
import android.os.Build
import android.provider.Settings
import expo.modules.kotlin.modules.Module
import expo.modules.kotlin.modules.ModuleDefinition

/**
 * The rest countdown on the Android lock screen and in the notification
 * shade — one notification for the whole rest (see RestNotifier):
 *
 *  - while resting, a large system Chronometer counting down, with −15 s,
 *    +15 s and Skip buttons that work without opening the app;
 *  - when the rest ends, the same notification becomes the "Rest over" alert
 *    (with sound), fired by an alarm, so nothing depends on the app being
 *    awake.
 *
 * JavaScript drives it from the session's stored rest end
 * (src/lib/rest-live-activity.ts). A change made from the notification is
 * sent back as an `onRestChange` event, and kept until `takePending()` reads
 * it, so a change made while the app was closed is not lost either.
 */
class RestCountdownModule : Module() {
  override fun definition() = ModuleDefinition {
    Name("RestCountdown")

    // 2: the notification carries the alert and the buttons itself.
    Constants("version" to 2)

    Events("onRestChange")

    OnCreate { instance = this@RestCountdownModule }
    OnDestroy { if (instance === this@RestCountdownModule) instance = null }

    Function("setLabels") { minus: String, plus: String, skip: String, countdownChannel: String, alertChannel: String ->
      appContext.reactContext?.let { RestNotifier.setLabels(it, minus, plus, skip, countdownChannel, alertChannel) }
      Unit
    }

    Function("show") { endsAtMs: Double, title: String, subtitle: String, overTitle: String, overBody: String ->
      appContext.reactContext?.let { RestNotifier.start(it, endsAtMs.toLong(), title, subtitle, overTitle, overBody) }
      Unit
    }

    Function("hide") {
      appContext.reactContext?.let { RestNotifier.stop(it) }
      Unit
    }

    // A change made from the notification that the app hasn't applied yet:
    // the new end in epoch ms, 0 for skipped, or null for none. Read once.
    Function("takePending") {
      appContext.reactContext?.let { RestNotifier.takePending(it)?.toDouble() }
    }

    // Android 14+ asks the person before an app may set exact alarms; until
    // then the alert can arrive a little after the rest ends.
    Function("canExact") {
      val context = appContext.reactContext ?: return@Function true
      if (Build.VERSION.SDK_INT < Build.VERSION_CODES.S) return@Function true
      (context.getSystemService(Context.ALARM_SERVICE) as AlarmManager).canScheduleExactAlarms()
    }

    Function("openExactSettings") {
      val context = appContext.reactContext
      if (context != null && Build.VERSION.SDK_INT >= Build.VERSION_CODES.S) {
        try {
          context.startActivity(
            Intent(Settings.ACTION_REQUEST_SCHEDULE_EXACT_ALARM, Uri.parse("package:" + context.packageName))
              .addFlags(Intent.FLAG_ACTIVITY_NEW_TASK),
          )
        } catch (e: Exception) {
          // No such screen on this device.
        }
      }
      Unit
    }
  }

  fun emitChange(endsAtMs: Long) {
    try {
      sendEvent("onRestChange", mapOf("endsAtMs" to endsAtMs.toDouble()))
    } catch (e: Exception) {
      // JavaScript not running: takePending() picks it up on the next open.
    }
  }

  companion object {
    @Volatile
    var instance: RestCountdownModule? = null
  }
}
