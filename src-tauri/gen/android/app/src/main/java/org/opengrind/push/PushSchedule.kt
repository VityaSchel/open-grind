package org.opengrind.push

import android.app.job.JobInfo
import android.app.job.JobScheduler
import android.content.ComponentName
import android.content.Context

object PushSchedule {
	private const val JOB_ID = 4712
	private const val PERIOD_MS = 15L * 60L * 1000L

	fun polls(context: Context, mode: PushMode = PushSettings.mode(context)): Boolean =
		mode == PushMode.Slow && PushSettings.notificationsEnabled(context)

	fun catchUp(context: Context) {
		if (polls(context)) {
			PushSettings.advanceWatermark(context, Watermark.seenAt(System.currentTimeMillis()))
		}
	}

	fun follow(context: Context, mode: PushMode) {
		val scheduler = context.getSystemService(JobScheduler::class.java)
		if (!polls(context, mode)) {
			PushSettings.setWatermark(context, Watermark.Unarmed)
			scheduler.cancel(JOB_ID)
			return
		}
		val stored = PushSettings.watermark(context)
		val seeded = stored.seeded(Watermark.seenAt(System.currentTimeMillis()))
		if (seeded != stored) PushSettings.setWatermark(context, seeded)
		val job = JobInfo.Builder(JOB_ID, ComponentName(context, PushPollService::class.java))
			.setRequiredNetworkType(JobInfo.NETWORK_TYPE_ANY)
			.setPeriodic(PERIOD_MS)
			.setPersisted(true)
			.build()
		if (scheduler.getPendingJob(JOB_ID) != job) scheduler.schedule(job)
	}
}
