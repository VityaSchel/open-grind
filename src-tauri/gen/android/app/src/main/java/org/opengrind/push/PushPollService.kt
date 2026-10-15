package org.opengrind.push

import android.app.job.JobParameters
import android.app.job.JobService
import java.util.concurrent.atomic.AtomicBoolean

class PushPollService : JobService() {
	private val abandoned = AtomicBoolean(false)

	override fun onStartJob(params: JobParameters): Boolean {
		if (AppForeground.visible()) {
			PushSchedule.catchUp(this)
			return false
		}
		if (!PushSchedule.polls(this)) return false
		abandoned.set(false)
		Thread({ sweep(params) }, "opengrind-push-poll").start()
		return true
	}

	override fun onStopJob(params: JobParameters): Boolean {
		abandoned.set(true)
		return true
	}

	private fun sweep(params: JobParameters) {
		runCatching {
			val poll = PushPoll.since(PushSettings.watermark(this), PushNotifier.shownConversations(this))
			val now = System.currentTimeMillis()
			if (!abandoned.get()) {
				val seen = PushSettings.watermark(this)
				val decisions = poll.payloads
					.map { payload -> PushPayload.decide(payload, now) }
					.filterNot { decision -> decision is PushDecision.Notify && caughtUp(seen, decision) }
				PushNotifier.applyAll(this, decisions)
				PushSettings.advanceWatermark(this, poll.watermark)
			}
		}
		jobFinished(params, false)
	}

	private fun caughtUp(seen: Watermark, decision: PushDecision.Notify): Boolean =
		AppForeground.visible() || seen.covers(decision.timestamp)
}
