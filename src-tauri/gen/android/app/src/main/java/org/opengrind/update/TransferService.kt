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
import androidx.core.content.ContextCompat
import java.lang.ref.WeakReference
import org.opengrind.R
import org.opengrind.addon.AddonNames

// Prevent Android from freezing the process and dropping its sockets
class TransferService : Service() {
	private var wakeLock: PowerManager.WakeLock? = null
	private var foregroundStartId: Int? = null

	override fun onBind(intent: Intent?): IBinder? = null

	override fun onCreate() {
		super.onCreate()
		running = WeakReference(this)
	}

	override fun onStartCommand(
		intent: Intent?,
		flags: Int,
		startId: Int,
	): Int {
		try {
			ServiceCompat.startForeground(
				this,
				NOTIFICATION_ID,
				notification(
					this,
					holds.newest() ?: Transfer(
						title = TransferTitle.named(intent?.getStringExtra(EXTRA_TITLE)),
						addonPackage = intent?.getStringExtra(EXTRA_ADDON_PACKAGE),
					),
				),
				if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.Q) {
					ServiceInfo.FOREGROUND_SERVICE_TYPE_DATA_SYNC
				} else {
					0
				},
			)
		} catch (e: Exception) {
			stopIfLatest(startId)
			return START_NOT_STICKY
		}
		foregroundStartId = startId
		settle()
		return START_NOT_STICKY
	}

	override fun onTimeout(
		startId: Int,
		fgsType: Int,
	) {
		foregroundStartId = null
		stopSelf()
	}

	override fun onDestroy() {
		if (running?.get() === this) running = null
		wakeLock?.let { if (it.isHeld) it.release() }
		wakeLock = null
		getSystemService(NotificationManager::class.java).cancel(NOTIFICATION_ID)
		super.onDestroy()
	}

	private fun settle() {
		val startId = foregroundStartId ?: return
		val showing = holds.newest()
		if (showing == null) {
			stopIfLatest(startId)
			return
		}
		getSystemService(NotificationManager::class.java).notify(NOTIFICATION_ID, notification(this, showing))
		acquireWakeLock()
	}

	private fun stopIfLatest(startId: Int) {
		if (stopSelfResult(startId)) foregroundStartId = null
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
		private const val EXTRA_ADDON_PACKAGE = "org.opengrind.update.extra.ADDON_PACKAGE"
		private const val CHANNEL_ID = "org.opengrind.update.transfer"
		private const val NOTIFICATION_ID = 4711
		private const val WAKE_LOCK_TAG = "opengrind:update"
		private const val WAKE_LOCK_TIMEOUT_MS = 30L * 60L * 1000L
		private val holds = TransferHolds()
		private var running: WeakReference<TransferService>? = null

		fun start(
			context: Context,
			transfer: Transfer,
		) {
			holds.begin(transfer)
			context.startForegroundService(
				Intent(context, TransferService::class.java)
					.putExtra(EXTRA_TITLE, transfer.title.name)
					.putExtra(EXTRA_ADDON_PACKAGE, transfer.addonPackage),
			)
		}

		fun stop(
			context: Context,
			transfer: Transfer,
		) {
			holds.end(transfer)
			ContextCompat.getMainExecutor(context).execute { running?.get()?.settle() }
		}

		private fun notification(
			context: Context,
			transfer: Transfer,
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
				.setContentTitle(titleText(context, transfer))
				.setSmallIcon(
					if (transfer.title == TransferTitle.MediaUpload) {
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

		private fun titleText(
			context: Context,
			transfer: Transfer,
		): String {
			val addon = context.getString(AddonNames.resourceOf(transfer.addonPackage))
			return when (transfer.title) {
				TransferTitle.AppUpdate -> context.getString(R.string.update_transfer_title)
				TransferTitle.AddonInstall -> context.getString(R.string.addon_install_transfer_title, addon)
				TransferTitle.AddonUpdate -> context.getString(R.string.addon_update_transfer_title, addon)
				TransferTitle.MediaUpload -> context.getString(R.string.media_upload_transfer_title)
			}
		}
	}
}
