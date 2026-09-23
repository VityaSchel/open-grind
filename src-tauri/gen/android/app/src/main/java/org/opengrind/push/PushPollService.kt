package org.opengrind.push

import android.app.job.JobParameters
import android.app.job.JobService
import io.crates.keyring.Keyring
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
			Keyring.initializeNdkContext(applicationContext)
			val poll = PushPoll.since(PushSettings.watermarks(this))
			val now = System.currentTimeMillis()
			if (!abandoned.get()) {
				val seen = PushSettings.watermarks(this)
				for (payload in poll.payloads) {
					val decision = PushPayload.decide(payload, now)
					if (decision is PushDecision.Notify && caughtUp(seen, decision)) continue
					PushNotifier.apply(this, decision)
				}
				PushSettings.advanceWatermarks(this, poll.watermarks)
			}
		}
		jobFinished(params, false)
	}

	private fun caughtUp(seen: Watermarks, decision: PushDecision.Notify): Boolean =
		AppForeground.visible() || seen.covers(decision.kind, decision.timestamp)
}
