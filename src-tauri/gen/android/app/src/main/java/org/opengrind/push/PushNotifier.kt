package org.opengrind.push

import android.app.Activity
import android.app.NotificationChannel
import android.app.NotificationManager
import android.app.PendingIntent
import android.content.Context
import android.content.Intent
import android.net.Uri
import android.os.Bundle
import android.provider.Settings
import android.service.notification.StatusBarNotification
import androidx.core.app.NotificationCompat
import androidx.core.app.NotificationManagerCompat
import androidx.core.content.ContextCompat
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
			is PushDecision.DismissConversation -> NotificationManagerCompat.from(context)
				.cancel(MESSAGES_CHANNEL, decision.postedId)
			is PushDecision.DismissNotification -> withdraw(context, decision)
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

	fun openChannelSettings(activity: Activity, kind: PushKind): Boolean {
		val channel = Intent(Settings.ACTION_CHANNEL_NOTIFICATION_SETTINGS)
			.putExtra(Settings.EXTRA_APP_PACKAGE, activity.packageName)
			.putExtra(Settings.EXTRA_CHANNEL_ID, channelOf(kind))
		return start(activity, listOf(channel) + appNotificationIntents(activity))
	}

	fun openAppNotificationSettings(activity: Activity): Boolean =
		start(activity, appNotificationIntents(activity))

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
		if (!PushSettings.notificationsEnabled(context)) return
		if (!notificationsPermitted(context)) return
		if (!PushSettings.categoryEnabled(context, decision.kind)) return
		createChannels(context)
		val channel = channelOf(decision.kind)
		val id = decision.postedId
		val builder = NotificationCompat.Builder(context, channel)
			.setSmallIcon(R.drawable.ic_notification)
			.setColor(ContextCompat.getColor(context, R.color.brand_primary))
			.setShowWhen(true)
			.setAutoCancel(true)
			.setContentIntent(openIntent(context, id, decision.deeplink))
			.addExtras(Bundle().apply { putString(EXTRA_SENDER_ID, decision.senderId) })
		when (decision.kind) {
			PushKind.Message -> ConversationNotification.post(
				context,
				channel,
				id,
				builder,
				decision,
				active(context).firstOrNull { it.tag == channel && it.id == id },
			)
			PushKind.Tap -> NotificationManagerCompat.from(context).notify(
				channel,
				id,
				builder
					.setContentTitle(decision.title)
					.setContentText(decision.body)
					.setStyle(NotificationCompat.BigTextStyle().bigText(decision.body))
					.setCategory(NotificationCompat.CATEGORY_SOCIAL)
					.setWhen(decision.timestamp)
					.build(),
			)
		}
	}

	private fun withdraw(context: Context, decision: PushDecision.DismissNotification) {
		dismiss(context) { it.tag == TAPS_CHANNEL && it.id == decision.tapPostedId }
		active(context)
			.filter { it.tag == MESSAGES_CHANNEL }
			.forEach { ConversationNotification.withdraw(context, it, decision.dedupeKey) }
	}

	private fun openIntent(context: Context, requestCode: Int, deeplink: String): PendingIntent {
		val intent = Intent(context, MainActivity::class.java)
			.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK or Intent.FLAG_ACTIVITY_CLEAR_TOP)
			.putExtra(EXTRA_DEEPLINK, deeplink)
		return PendingIntent.getActivity(
			context,
			requestCode,
			intent,
			PendingIntent.FLAG_UPDATE_CURRENT or PendingIntent.FLAG_IMMUTABLE,
		)
	}

	private fun appNotificationIntents(activity: Activity): List<Intent> = listOf(
		Intent(Settings.ACTION_APP_NOTIFICATION_SETTINGS)
			.putExtra(Settings.EXTRA_APP_PACKAGE, activity.packageName),
		Intent(
			Settings.ACTION_APPLICATION_DETAILS_SETTINGS,
			Uri.fromParts("package", activity.packageName, null),
		),
	)

	private fun start(activity: Activity, intents: List<Intent>): Boolean =
		intents.any { intent -> runCatching { activity.startActivity(intent) }.isSuccess }

	private fun active(context: Context): List<StatusBarNotification> =
		context.getSystemService(NotificationManager::class.java).activeNotifications.toList()

	private fun dismiss(context: Context, matches: (StatusBarNotification) -> Boolean) {
		val manager = NotificationManagerCompat.from(context)
		active(context)
			.filter(matches)
			.forEach { manager.cancel(it.tag, it.id) }
	}
}
