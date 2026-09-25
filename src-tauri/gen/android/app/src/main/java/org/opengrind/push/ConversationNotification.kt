package org.opengrind.push

import android.content.Context
import android.os.Bundle
import android.service.notification.StatusBarNotification
import androidx.core.app.NotificationCompat
import androidx.core.app.NotificationCompat.MessagingStyle
import androidx.core.app.NotificationManagerCompat
import androidx.core.app.Person
import org.opengrind.R
import org.opengrind.push.ConversationLines.Line

object ConversationNotification {
	private const val EXTRA_DEDUPE_KEY = "org.opengrind.push.extra.DEDUPE_KEY"
	private const val EXTRA_CONVERSATION_ID = "org.opengrind.push.extra.CONVERSATION_ID"

	fun post(
		context: Context,
		channel: String,
		id: Int,
		builder: NotificationCompat.Builder,
		decision: PushDecision.Notify,
		posted: StatusBarNotification?,
		withdrawn: Set<String>,
	) {
		val shown = posted
			?.let { MessagingStyle.extractMessagingStyleFromNotification(it.notification) }
			?.let(::linesOf)
			.orEmpty()
		val lines = ConversationLines.append(
			ConversationLines.remove(shown, withdrawn),
			Line(decision.dedupeKey, decision.body, decision.timestamp),
		)
		if (lines == shown) return
		val peer = Person.Builder().setName(decision.title).setKey(decision.senderId).build()
		val notification = builder
			.setStyle(style(context, peer, lines))
			.setCategory(NotificationCompat.CATEGORY_MESSAGE)
			.setWhen(lines.last().timestamp)
			.addExtras(Bundle().apply { putString(EXTRA_CONVERSATION_ID, decision.groupKey) })
			.build()
		NotificationManagerCompat.from(context).notify(channel, id, notification)
	}

	fun shown(posted: StatusBarNotification): PushPoll.ShownConversation? {
		val conversationId = posted.notification.extras.getString(EXTRA_CONVERSATION_ID) ?: return null
		val style = MessagingStyle.extractMessagingStyleFromNotification(posted.notification) ?: return null
		return PushPoll.ShownConversation(conversationId, linesOf(style).map(Line::dedupeKey))
	}

	fun withdraw(context: Context, posted: StatusBarNotification, dedupeKeys: Set<String>): Boolean {
		val style = MessagingStyle.extractMessagingStyleFromNotification(posted.notification) ?: return false
		val shown = linesOf(style)
		val lines = ConversationLines.remove(shown, dedupeKeys)
		if (lines == shown) return false
		val manager = NotificationManagerCompat.from(context)
		val peer = style.messages.firstNotNullOfOrNull { it.person }
		if (lines.isEmpty() || peer == null) {
			manager.cancel(posted.tag, posted.id)
			return true
		}
		val notification = NotificationCompat.Builder(context, posted.notification)
			.setStyle(style(context, peer, lines))
			.setWhen(lines.last().timestamp)
			.setOnlyAlertOnce(true)
			.build()
		manager.notify(posted.tag, posted.id, notification)
		return true
	}

	private fun linesOf(style: MessagingStyle): List<Line> = style.messages.mapNotNull { message ->
		message.extras.getString(EXTRA_DEDUPE_KEY)?.let { dedupeKey ->
			Line(dedupeKey, message.text?.toString().orEmpty(), message.timestamp)
		}
	}

	private fun style(context: Context, peer: Person, lines: List<Line>): MessagingStyle {
		val self = Person.Builder().setName(context.getString(R.string.push_self)).build()
		return lines.fold(MessagingStyle(self)) { style, line ->
			style.addMessage(
				MessagingStyle.Message(line.text, line.timestamp, peer).apply {
					extras.putString(EXTRA_DEDUPE_KEY, line.dedupeKey)
				},
			)
		}
	}
}
