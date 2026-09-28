package expo.modules.restcountdown

import android.app.ActivityManager
import android.app.AlarmManager
import android.app.Notification
import android.app.NotificationChannel
import android.app.NotificationManager
import android.app.PendingIntent
import android.content.BroadcastReceiver
import android.content.Context
import android.content.Intent
import android.content.SharedPreferences
import android.media.AudioAttributes
import android.media.RingtoneManager
import android.net.Uri
import android.os.Build
import android.os.SystemClock
import android.widget.RemoteViews

/**
 * One notification for a rest, from start to finish.
 *
 * The rest's state (when it ends, the words to show) is kept in
 * SharedPreferences, because the buttons and the end-of-rest alarm arrive in
 * a BroadcastReceiver that may run with the app's JavaScript long gone.
 */
object RestNotifier {
  // The countdown channel is new in this version: the first one was "low"
  // importance, which many phones hide from the lock screen as "silent".
  // Channel importance can't change after creation, so it gets a new id.
  private const val CHANNEL_COUNTDOWN = "rest-countdown-2"
  private const val LEGACY_CHANNEL = "rest-countdown"
  // Shared with the app's earlier JavaScript alert, so anyone who tuned its
  // sound keeps their choice.
  private const val CHANNEL_ALERT = "rest-timer"
  const val NOTIFICATION_ID = 7201
  private const val ACCENT = 0xFF6D5AAB.toInt()
  private const val STEP_MS = 15_000L

  const val ACTION_MINUS = "expo.modules.restcountdown.MINUS"
  const val ACTION_PLUS = "expo.modules.restcountdown.PLUS"
  const val ACTION_SKIP = "expo.modules.restcountdown.SKIP"
  const val ACTION_END = "expo.modules.restcountdown.END"
  const val EXTRA_ENDS = "endsAtMs"

  private fun prefs(context: Context): SharedPreferences =
    context.getSharedPreferences("calgym_rest_countdown", Context.MODE_PRIVATE)

  private fun manager(context: Context) =
    context.getSystemService(Context.NOTIFICATION_SERVICE) as NotificationManager

  fun setLabels(context: Context, minus: String, plus: String, skip: String, countdownChannel: String, alertChannel: String) {
    prefs(context).edit()
      .putString("minus", minus)
      .putString("plus", plus)
      .putString("skip", skip)
      .putString("countdownChannel", countdownChannel)
      .putString("alertChannel", alertChannel)
      .apply()
  }

  /** Start or change the rest (from the app). */
  fun start(context: Context, endsAtMs: Long, title: String, subtitle: String, overTitle: String, overBody: String) {
    if (endsAtMs <= System.currentTimeMillis()) {
      stop(context)
      return
    }
    prefs(context).edit()
      .putLong("ends", endsAtMs)
      .putString("title", title)
      .putString("subtitle", subtitle)
      .putString("overTitle", overTitle)
      .putString("overBody", overBody)
      .apply()
    post(context, endsAtMs)
    scheduleEnd(context, endsAtMs)
  }

  /** The rest is over or gone (from the app): no countdown, no alert. */
  fun stop(context: Context) {
    prefs(context).edit().putLong("ends", 0L).apply()
    cancelEnd(context)
    manager(context).cancel(NOTIFICATION_ID)
  }

  fun takePending(context: Context): Long? {
    val p = prefs(context)
    if (!p.getBoolean("pending", false)) return null
    val at = p.getLong("pendingAt", 0L)
    val ends = p.getLong("pendingEnds", 0L)
    p.edit().putBoolean("pending", false).apply()
    // Only a change from this workout counts, not one from hours ago.
    if (System.currentTimeMillis() - at > 3 * 60 * 60 * 1000L) return null
    return ends
  }

  /** A button on the notification, or the end-of-rest alarm. */
  fun handle(context: Context, intent: Intent) {
    val p = prefs(context)
    val ends = p.getLong("ends", 0L)
    val now = System.currentTimeMillis()
    when (intent.action) {
      ACTION_MINUS, ACTION_PLUS -> {
        if (ends <= now) return
        val delta = if (intent.action == ACTION_PLUS) STEP_MS else -STEP_MS
        // Never below a second: taking 15 s off the last 10 ends the rest.
        val next = maxOf(now + 1000L, ends + delta)
        p.edit().putLong("ends", next).apply()
        post(context, next)
        scheduleEnd(context, next)
        changed(context, next)
      }
      ACTION_SKIP -> {
        stop(context)
        changed(context, 0L)
      }
      ACTION_END -> {
        // An alarm for a rest that was since changed or skipped is stale.
        val due = intent.getLongExtra(EXTRA_ENDS, -1L)
        if (ends == 0L || due != ends) return
        p.edit().putLong("ends", 0L).apply()
        if (appInForeground(context)) {
          // On screen, the timer finishes itself with a buzz.
          manager(context).cancel(NOTIFICATION_ID)
        } else {
          alert(context)
        }
      }
    }
  }

  private fun changed(context: Context, endsAtMs: Long) {
    prefs(context).edit()
      .putBoolean("pending", true)
      .putLong("pendingEnds", endsAtMs)
      .putLong("pendingAt", System.currentTimeMillis())
      .apply()
    RestCountdownModule.instance?.emitChange(endsAtMs)
  }

  private fun appInForeground(context: Context): Boolean {
    val info = ActivityManager.RunningAppProcessInfo()
    ActivityManager.getMyMemoryState(info)
    return info.importance == ActivityManager.RunningAppProcessInfo.IMPORTANCE_FOREGROUND
  }

  private fun ensureChannels(context: Context) {
    if (Build.VERSION.SDK_INT < Build.VERSION_CODES.O) return
    val nm = manager(context)
    val p = prefs(context)
    if (nm.getNotificationChannel(LEGACY_CHANNEL) != null) nm.deleteNotificationChannel(LEGACY_CHANNEL)
    if (nm.getNotificationChannel(CHANNEL_COUNTDOWN) == null) {
      // Default importance so it shows on the lock screen, but no sound or
      // vibration: the person just started this rest themselves.
      nm.createNotificationChannel(
        NotificationChannel(
          CHANNEL_COUNTDOWN,
          p.getString("countdownChannel", null) ?: context.getString(R.string.rest_countdown_channel),
          NotificationManager.IMPORTANCE_DEFAULT,
        ).apply {
          setShowBadge(false)
          setSound(null, null)
          enableVibration(false)
          lockscreenVisibility = Notification.VISIBILITY_PUBLIC
        },
      )
    }
    if (nm.getNotificationChannel(CHANNEL_ALERT) == null) {
      nm.createNotificationChannel(
        NotificationChannel(
          CHANNEL_ALERT,
          p.getString("alertChannel", null) ?: context.getString(R.string.rest_alert_channel),
          NotificationManager.IMPORTANCE_HIGH,
        ).apply {
          setShowBadge(false)
          enableVibration(true)
          vibrationPattern = longArrayOf(0, 250, 150, 250)
          setSound(
            RingtoneManager.getDefaultUri(RingtoneManager.TYPE_NOTIFICATION),
            AudioAttributes.Builder()
              .setUsage(AudioAttributes.USAGE_NOTIFICATION)
              .setContentType(AudioAttributes.CONTENT_TYPE_SONIFICATION)
              .build(),
          )
          lockscreenVisibility = Notification.VISIBILITY_PUBLIC
        },
      )
    }
  }

  private fun openSession(context: Context): PendingIntent {
    val open = Intent(Intent.ACTION_VIEW, Uri.parse("calapp://session"))
      .setPackage(context.packageName)
      .addFlags(Intent.FLAG_ACTIVITY_NEW_TASK or Intent.FLAG_ACTIVITY_SINGLE_TOP)
    return PendingIntent.getActivity(context, 0, open, PendingIntent.FLAG_UPDATE_CURRENT or PendingIntent.FLAG_IMMUTABLE)
  }

  private fun broadcast(context: Context, action: String, code: Int, endsAtMs: Long = 0L): PendingIntent {
    val intent = Intent(context, RestCountdownReceiver::class.java).setAction(action).putExtra(EXTRA_ENDS, endsAtMs)
    return PendingIntent.getBroadcast(context, code, intent, PendingIntent.FLAG_UPDATE_CURRENT or PendingIntent.FLAG_IMMUTABLE)
  }

  private fun builder(context: Context, channel: String): Notification.Builder =
    if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
      Notification.Builder(context, channel)
    } else {
      @Suppress("DEPRECATION")
      Notification.Builder(context)
    }

  private fun post(context: Context, endsAtMs: Long) {
    val remaining = endsAtMs - System.currentTimeMillis()
    if (remaining <= 0) return
    ensureChannels(context)
    val p = prefs(context)
    val title = p.getString("title", "") ?: ""
    val subtitle = p.getString("subtitle", "") ?: ""

    // Chronometer counts against elapsedRealtime, which a clock change on the
    // phone cannot disturb.
    val base = SystemClock.elapsedRealtime() + remaining
    fun views(layout: Int) = RemoteViews(context.packageName, layout).apply {
      setChronometer(R.id.rest_countdown_time, base, null, true)
      setChronometerCountDown(R.id.rest_countdown_time, true)
      setTextViewText(R.id.rest_countdown_title, title)
      setTextViewText(R.id.rest_countdown_subtitle, subtitle)
    }

    @Suppress("DEPRECATION")
    val b = builder(context, CHANNEL_COUNTDOWN)
      .setPriority(Notification.PRIORITY_DEFAULT)
      .setSound(null)
    if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
      // A safety net only: the end-of-rest alarm replaces it on time.
      b.setTimeoutAfter(remaining + 5 * 60 * 1000L)
    }
    fun action(label: String, pi: PendingIntent) = Notification.Action.Builder(null, label, pi).build()
    val notification = b
      .setSmallIcon(R.drawable.rest_countdown_icon)
      .setColor(ACCENT)
      .setContentTitle(title)
      .setContentText(subtitle)
      .setCustomContentView(views(R.layout.rest_countdown))
      .setCustomBigContentView(views(R.layout.rest_countdown_big))
      .setStyle(Notification.DecoratedCustomViewStyle())
      .addAction(action(p.getString("minus", null) ?: "−15 s", broadcast(context, ACTION_MINUS, 1)))
      .addAction(action(p.getString("plus", null) ?: "+15 s", broadcast(context, ACTION_PLUS, 2)))
      .addAction(action(p.getString("skip", null) ?: "Skip", broadcast(context, ACTION_SKIP, 3)))
      .setOngoing(true)
      .setOnlyAlertOnce(true)
      .setShowWhen(false)
      .setCategory(Notification.CATEGORY_STOPWATCH)
      .setVisibility(Notification.VISIBILITY_PUBLIC)
      .setContentIntent(openSession(context))
      .build()
    notify(context, notification)
  }

  /** The countdown becomes the alert: same notification, now with sound. */
  private fun alert(context: Context) {
    ensureChannels(context)
    val p = prefs(context)
    @Suppress("DEPRECATION")
    val b = builder(context, CHANNEL_ALERT)
      .setPriority(Notification.PRIORITY_HIGH)
      .setDefaults(Notification.DEFAULT_ALL)
    if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
      // A "rest over" from long ago is only clutter.
      b.setTimeoutAfter(15 * 60 * 1000L)
    }
    val notification = b
      .setSmallIcon(R.drawable.rest_countdown_icon)
      .setColor(ACCENT)
      .setContentTitle(p.getString("overTitle", "") ?: "")
      .setContentText(p.getString("overBody", "") ?: "")
      .setAutoCancel(true)
      .setCategory(Notification.CATEGORY_REMINDER)
      .setVisibility(Notification.VISIBILITY_PUBLIC)
      .setContentIntent(openSession(context))
      .build()
    notify(context, notification)
  }

  private fun notify(context: Context, notification: Notification) {
    try {
      manager(context).notify(NOTIFICATION_ID, notification)
    } catch (e: SecurityException) {
      // Notifications not allowed: nothing shows.
    }
  }

  private fun scheduleEnd(context: Context, endsAtMs: Long) {
    val am = context.getSystemService(Context.ALARM_SERVICE) as AlarmManager
    val pi = broadcast(context, ACTION_END, 4, endsAtMs)
    try {
      if (Build.VERSION.SDK_INT < Build.VERSION_CODES.S || am.canScheduleExactAlarms()) {
        am.setExactAndAllowWhileIdle(AlarmManager.RTC_WAKEUP, endsAtMs, pi)
      } else {
        am.setAndAllowWhileIdle(AlarmManager.RTC_WAKEUP, endsAtMs, pi)
      }
    } catch (e: SecurityException) {
      am.setAndAllowWhileIdle(AlarmManager.RTC_WAKEUP, endsAtMs, pi)
    }
  }

  private fun cancelEnd(context: Context) {
    val am = context.getSystemService(Context.ALARM_SERVICE) as AlarmManager
    am.cancel(broadcast(context, ACTION_END, 4))
  }
}

/** The notification's buttons and the end-of-rest alarm land here. */
class RestCountdownReceiver : BroadcastReceiver() {
  override fun onReceive(context: Context, intent: Intent) {
    RestNotifier.handle(context.applicationContext, intent)
  }
}
