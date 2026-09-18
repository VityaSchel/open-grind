package org.opengrind.update

import android.app.Notification
import android.app.NotificationChannel
import android.app.NotificationManager
import android.app.Service
import android.content.Context
import android.content.Intent
import android.content.pm.ServiceInfo
import android.os.Build
import android.os.IBinder
import android.os.PowerManager
import androidx.core.app.NotificationCompat
import androidx.core.app.ServiceCompat
import org.opengrind.R

// Prevent Android from freezing the process and dropping its sockets
// POST_NOTIFICATIONS is not requested, so on API 33+ the notification below stays hidden
class TransferService : Service() {
	private var wakeLock: PowerManager.WakeLock? = null

	override fun onBind(intent: Intent?): IBinder? = null

	override fun onStartCommand(
		intent: Intent?,
		flags: Int,
		startId: Int,
	): Int {
		try {
			ServiceCompat.startForeground(
				this,
				NOTIFICATION_ID,
				notification(this, TransferTitle.named(intent?.getStringExtra(EXTRA_TITLE))),
				if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.Q) {
					ServiceInfo.FOREGROUND_SERVICE_TYPE_DATA_SYNC
				} else {
					0
				},
			)
		} catch (e: Exception) {
			stopSelf(startId)
			return START_NOT_STICKY
		}
		acquireWakeLock()
		return START_NOT_STICKY
	}

	override fun onTimeout(
		startId: Int,
		fgsType: Int,
	) {
		stopSelf()
	}

	override fun onDestroy() {
		wakeLock?.let { if (it.isHeld) it.release() }
		wakeLock = null
		super.onDestroy()
	}

	private fun acquireWakeLock() {
		if (wakeLock?.isHeld == true) return
		val power = getSystemService(Context.POWER_SERVICE) as PowerManager
		wakeLock = power.newWakeLock(PowerManager.PARTIAL_WAKE_LOCK, WAKE_LOCK_TAG).apply {
			setReferenceCounted(false)
			acquire(WAKE_LOCK_TIMEOUT_MS)
		}
	}

	companion object {
		private const val EXTRA_TITLE = "org.opengrind.update.extra.TRANSFER_TITLE"
		private const val CHANNEL_ID = "org.opengrind.update.transfer"
		private const val NOTIFICATION_ID = 4711
		private const val WAKE_LOCK_TAG = "opengrind:update"
		private const val WAKE_LOCK_TIMEOUT_MS = 30L * 60L * 1000L
		private val holds = TransferHolds()

		fun start(
			context: Context,
			title: TransferTitle,
		) {
			holds.begin(title)
			context.startForegroundService(
				Intent(context, TransferService::class.java).putExtra(EXTRA_TITLE, title.name),
			)
		}

		fun stop(
			context: Context,
			title: TransferTitle,
		) {
			val showing = holds.end(title)
			if (showing == null) {
				context.stopService(Intent(context, TransferService::class.java))
				return
			}
			context
				.getSystemService(NotificationManager::class.java)
				.notify(NOTIFICATION_ID, notification(context, showing))
		}

		private fun notification(
			context: Context,
			title: TransferTitle,
		): Notification {
			if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
				val channel = NotificationChannel(
					CHANNEL_ID,
					context.getString(R.string.transfer_channel_name),
					NotificationManager.IMPORTANCE_LOW,
				).apply { setShowBadge(false) }
				context.getSystemService(NotificationManager::class.java).createNotificationChannel(channel)
			}
			return NotificationCompat.Builder(context, CHANNEL_ID)
				.setContentTitle(context.getString(titleText(title)))
				.setSmallIcon(
					if (title == TransferTitle.MediaUpload) {
						android.R.drawable.stat_sys_upload
					} else {
						android.R.drawable.stat_sys_download
					},
				)
				.setPriority(NotificationCompat.PRIORITY_LOW)
				.setOngoing(true)
				.setSilent(true)
				.setForegroundServiceBehavior(NotificationCompat.FOREGROUND_SERVICE_DEFERRED)
				.build()
		}

		private fun titleText(title: TransferTitle): Int =
			when (title) {
				TransferTitle.AppUpdate -> R.string.update_transfer_title
				TransferTitle.GoogleOauthInstall -> R.string.google_oauth_install_transfer_title
				TransferTitle.GoogleOauthUpdate -> R.string.google_oauth_update_transfer_title
				TransferTitle.RecaptchaInstall -> R.string.recaptcha_install_transfer_title
				TransferTitle.RecaptchaUpdate -> R.string.recaptcha_update_transfer_title
				TransferTitle.MediaUpload -> R.string.media_upload_transfer_title
			}
	}
}
