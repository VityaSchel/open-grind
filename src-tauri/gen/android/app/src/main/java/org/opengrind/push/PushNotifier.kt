package org.opengrind.push

import android.app.NotificationChannel
import android.app.NotificationManager
import android.app.PendingIntent
import android.content.Context
import android.content.Intent
import android.os.Bundle
import android.provider.Settings
import android.service.notification.StatusBarNotification
import androidx.core.app.NotificationCompat
import androidx.core.app.NotificationManagerCompat
import org.opengrind.MainActivity
import org.opengrind.R

object PushNotifier {
	const val EXTRA_DEEPLINK = "org.opengrind.push.extra.DEEPLINK"

	private const val MESSAGES_CHANNEL = "org.opengrind.push.messages"
	private const val TAPS_CHANNEL = "org.opengrind.push.taps"
	private const val EXTRA_SENDER_ID = "org.opengrind.push.extra.SENDER_ID"

	fun apply(context: Context, decision: PushDecision) {
		when (decision) {
			is PushDecision.Notify -> notify(context, decision)
			is PushDecision.DismissSender -> dismiss(context) {
				it.notification.extras.getString(EXTRA_SENDER_ID) in decision.senderIds
			}
			is PushDecision.DismissNotification -> dismiss(context) {
				it.id == decision.dedupeKey.hashCode()
			}
			PushDecision.Ignore -> Unit
		}
	}

	fun cancelAll(context: Context) {
		dismiss(context) { it.tag == MESSAGES_CHANNEL || it.tag == TAPS_CHANNEL }
	}

	fun notificationsPermitted(context: Context): Boolean =
		NotificationManagerCompat.from(context).areNotificationsEnabled()

	fun channelBlocked(context: Context, kind: PushKind): Boolean {
		val channel = NotificationManagerCompat.from(context)
			.getNotificationChannelCompat(channelOf(kind))
		return channel != null &&
			channel.importance == NotificationManagerCompat.IMPORTANCE_NONE
	}

	fun cancelCategory(context: Context, kind: PushKind) {
		val channel = channelOf(kind)
		dismiss(context) { it.tag == channel }
	}

	fun openChannelSettings(context: Context, kind: PushKind) {
		val channel = Intent(Settings.ACTION_CHANNEL_NOTIFICATION_SETTINGS)
			.putExtra(Settings.EXTRA_APP_PACKAGE, context.packageName)
			.putExtra(Settings.EXTRA_CHANNEL_ID, channelOf(kind))
		val app = Intent(Settings.ACTION_APP_NOTIFICATION_SETTINGS)
			.putExtra(Settings.EXTRA_APP_PACKAGE, context.packageName)
		for (intent in listOf(channel, app)) {
			runCatching {
				context.startActivity(intent.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK))
				return
			}
		}
	}

	fun createChannels(context: Context) {
		val manager = context.getSystemService(NotificationManager::class.java)
		manager.createNotificationChannel(
			NotificationChannel(
				MESSAGES_CHANNEL,
				context.getString(R.string.push_channel_messages),
				NotificationManager.IMPORTANCE_HIGH,
			),
		)
		manager.createNotificationChannel(
			NotificationChannel(
				TAPS_CHANNEL,
				context.getString(R.string.push_channel_taps),
				NotificationManager.IMPORTANCE_DEFAULT,
			),
		)
	}

	fun channelOf(kind: PushKind) = when (kind) {
		PushKind.Message -> MESSAGES_CHANNEL
		PushKind.Tap -> TAPS_CHANNEL
	}

	private fun notify(context: Context, decision: PushDecision.Notify) {
		if (!notificationsPermitted(context)) return
		if (!PushSettings.categoryEnabled(context, decision.kind)) return
		createChannels(context)
		val channel = channelOf(decision.kind)
		val notification = NotificationCompat.Builder(context, channel)
			.setSmallIcon(R.drawable.ic_launcher_monochrome)
			.setContentTitle(decision.title)
			.setContentText(decision.body)
			.setStyle(NotificationCompat.BigTextStyle().bigText(decision.body))
			.setCategory(NotificationCompat.CATEGORY_MESSAGE)
			.setWhen(decision.timestamp)
			.setShowWhen(true)
			.setAutoCancel(true)
			.setGroup(decision.groupKey)
			.setContentIntent(openIntent(context, decision))
			.addExtras(Bundle().apply { putString(EXTRA_SENDER_ID, decision.senderId) })
			.build()
		NotificationManagerCompat.from(context)
			.notify(channel, decision.dedupeKey.hashCode(), notification)
	}

	private fun openIntent(context: Context, decision: PushDecision.Notify): PendingIntent {
		val intent = Intent(context, MainActivity::class.java)
			.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK or Intent.FLAG_ACTIVITY_CLEAR_TOP)
			.putExtra(EXTRA_DEEPLINK, decision.deeplink)
		return PendingIntent.getActivity(
			context,
			decision.dedupeKey.hashCode(),
			intent,
			PendingIntent.FLAG_UPDATE_CURRENT or PendingIntent.FLAG_IMMUTABLE,
		)
	}

	private fun dismiss(context: Context, matches: (StatusBarNotification) -> Boolean) {
		val manager = context.getSystemService(NotificationManager::class.java)
		manager.activeNotifications
			.filter(matches)
			.forEach { manager.cancel(it.tag, it.id) }
	}
}
