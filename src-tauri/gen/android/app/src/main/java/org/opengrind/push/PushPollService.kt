package org.opengrind.push

import android.app.job.JobParameters
import android.app.job.JobService
import androidx.lifecycle.Lifecycle
import androidx.lifecycle.ProcessLifecycleOwner
import io.crates.keyring.Keyring
import java.util.concurrent.atomic.AtomicBoolean

class PushPollService : JobService() {
	private val abandoned = AtomicBoolean(false)

	override fun onStartJob(params: JobParameters): Boolean {
		if (PushSettings.mode(this) != PushMode.Slow || appIsInForeground()) return false
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
			val poll = PushPoll.since(PushSettings.watermark(this))
			val now = System.currentTimeMillis()
			if (!abandoned.get()) {
				for (payload in poll.payloads) {
					PushNotifier.apply(this, PushPayload.decide(payload, now))
				}
				PushSettings.setWatermark(this, poll.watermark)
			}
		}
		jobFinished(params, false)
	}

	private fun appIsInForeground(): Boolean =
		ProcessLifecycleOwner.get().lifecycle.currentState.isAtLeast(Lifecycle.State.STARTED)
}
