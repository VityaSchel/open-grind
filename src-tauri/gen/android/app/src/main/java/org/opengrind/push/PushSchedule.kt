package org.opengrind.push

import android.app.job.JobInfo
import android.app.job.JobScheduler
import android.content.ComponentName
import android.content.Context

object PushSchedule {
	private const val JOB_ID = 4712
	private const val PERIOD_MS = 15L * 60L * 1000L

	fun follow(context: Context, mode: PushMode) {
		val scheduler = context.getSystemService(JobScheduler::class.java)
		if (mode != PushMode.Slow || !PushSettings.notificationsEnabled(context)) {
			scheduler.cancel(JOB_ID)
			return
		}
		if (PushSettings.watermark(context) == 0L) {
			PushSettings.setWatermark(context, System.currentTimeMillis())
		}
		scheduler.schedule(
			JobInfo.Builder(JOB_ID, ComponentName(context, PushPollService::class.java))
				.setRequiredNetworkType(JobInfo.NETWORK_TYPE_ANY)
				.setPeriodic(PERIOD_MS)
				.setPersisted(true)
				.build(),
		)
	}
}
