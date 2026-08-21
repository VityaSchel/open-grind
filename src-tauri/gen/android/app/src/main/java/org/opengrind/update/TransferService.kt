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
				notification(),
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

	private fun notification(): Notification {
		if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
			val channel = NotificationChannel(
				CHANNEL_ID,
				getString(R.string.update_channel_name),
				NotificationManager.IMPORTANCE_LOW,
			).apply { setShowBadge(false) }
			getSystemService(NotificationManager::class.java).createNotificationChannel(channel)
		}
		return NotificationCompat.Builder(this, CHANNEL_ID)
			.setContentTitle(getString(R.string.update_transfer_title))
			.setSmallIcon(android.R.drawable.stat_sys_download)
			.setPriority(NotificationCompat.PRIORITY_LOW)
			.setOngoing(true)
			.setSilent(true)
			.setForegroundServiceBehavior(NotificationCompat.FOREGROUND_SERVICE_DEFERRED)
			.build()
	}

	companion object {
		private const val CHANNEL_ID = "org.opengrind.update.transfer"
		private const val NOTIFICATION_ID = 4711
		private const val WAKE_LOCK_TAG = "opengrind:update"
		private const val WAKE_LOCK_TIMEOUT_MS = 30L * 60L * 1000L

		fun start(context: Context) {
			context.startForegroundService(Intent(context, TransferService::class.java))
		}

		fun stop(context: Context) {
			context.stopService(Intent(context, TransferService::class.java))
		}
	}
}
