package expo.modules.restcountdown

import android.app.Notification
import android.app.NotificationChannel
import android.app.NotificationManager
import android.app.PendingIntent
import android.content.Context
import android.content.Intent
import android.net.Uri
import android.os.Build
import android.os.SystemClock
import android.widget.RemoteViews
import expo.modules.kotlin.modules.Module
import expo.modules.kotlin.modules.ModuleDefinition

/**
 * The rest countdown on the Android lock screen and in the notification
 * shade: an ongoing, silent notification whose large time is a system
 * Chronometer counting down to the end of the rest. The system keeps it
 * ticking with the app asleep, and it removes itself when the rest is over
 * (the separate end-of-rest alert still sounds).
 *
 * The Android counterpart of the iPhone Live Activity; JavaScript drives both
 * from the same value (see src/lib/rest-live-activity.ts).
 */
class RestCountdownModule : Module() {
  override fun definition() = ModuleDefinition {
    Name("RestCountdown")

    Function("show") { endsAtMs: Double, title: String, subtitle: String ->
      val context = appContext.reactContext ?: return@Function
      show(context, endsAtMs.toLong(), title, subtitle)
    }

    Function("hide") {
      val context = appContext.reactContext ?: return@Function
      manager(context).cancel(NOTIFICATION_ID)
    }
  }

  private fun manager(context: Context) =
    context.getSystemService(Context.NOTIFICATION_SERVICE) as NotificationManager

  private fun show(context: Context, endsAtMs: Long, title: String, subtitle: String) {
    val nm = manager(context)
    val remaining = endsAtMs - System.currentTimeMillis()
    if (remaining <= 0) {
      nm.cancel(NOTIFICATION_ID)
      return
    }

    if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O && nm.getNotificationChannel(CHANNEL_ID) == null) {
      // Low importance: shown on the lock screen and in the shade, but no
      // sound, vibration or heads-up for something the person just started.
      val channel = NotificationChannel(
        CHANNEL_ID,
        context.getString(R.string.rest_countdown_channel),
        NotificationManager.IMPORTANCE_LOW,
      ).apply {
        setShowBadge(false)
        setSound(null, null)
        enableVibration(false)
        lockscreenVisibility = Notification.VISIBILITY_PUBLIC
      }
      nm.createNotificationChannel(channel)
    }

    // Chronometer counts against elapsedRealtime, which a clock change on the
    // phone cannot disturb.
    val base = SystemClock.elapsedRealtime() + remaining
    fun views(layout: Int) = RemoteViews(context.packageName, layout).apply {
      setChronometer(R.id.rest_countdown_time, base, null, true)
      setChronometerCountDown(R.id.rest_countdown_time, true)
      setTextViewText(R.id.rest_countdown_title, title)
      setTextViewText(R.id.rest_countdown_subtitle, subtitle)
    }

    // A tap opens the workout.
    val open = Intent(Intent.ACTION_VIEW, Uri.parse("calapp://session"))
      .setPackage(context.packageName)
      .addFlags(Intent.FLAG_ACTIVITY_NEW_TASK or Intent.FLAG_ACTIVITY_SINGLE_TOP)
    val tap = PendingIntent.getActivity(
      context,
      0,
      open,
      PendingIntent.FLAG_UPDATE_CURRENT or PendingIntent.FLAG_IMMUTABLE,
    )

    val builder = if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
      Notification.Builder(context, CHANNEL_ID)
        // Gone on its own when the rest ends, even with the app asleep.
        .setTimeoutAfter(remaining + 1000)
    } else {
      @Suppress("DEPRECATION")
      Notification.Builder(context)
        .setPriority(Notification.PRIORITY_LOW)
        .setSound(null)
    }

    val notification = builder
      .setSmallIcon(R.drawable.rest_countdown_icon)
      .setColor(ACCENT)
      .setContentTitle(title)
      .setContentText(subtitle)
      .setCustomContentView(views(R.layout.rest_countdown))
      .setCustomBigContentView(views(R.layout.rest_countdown_big))
      .setStyle(Notification.DecoratedCustomViewStyle())
      .setOngoing(true)
      .setOnlyAlertOnce(true)
      .setShowWhen(false)
      .setCategory(Notification.CATEGORY_STOPWATCH)
      .setVisibility(Notification.VISIBILITY_PUBLIC)
      .setContentIntent(tap)
      .build()

    try {
      nm.notify(NOTIFICATION_ID, notification)
    } catch (e: SecurityException) {
      // Notifications not allowed: the countdown simply doesn't show.
    }
  }

  companion object {
    private const val CHANNEL_ID = "rest-countdown"
    private const val NOTIFICATION_ID = 7201
    private const val ACCENT = 0xFF6D5AAB.toInt()
  }
}
