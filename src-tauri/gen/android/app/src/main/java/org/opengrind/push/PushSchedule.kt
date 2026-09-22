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
			PushSettings.advanceWatermarks(context, Watermarks.seenAt(System.currentTimeMillis()))
		}
	}

	fun follow(context: Context, mode: PushMode) {
		val scheduler = context.getSystemService(JobScheduler::class.java)
		if (!polls(context, mode)) {
			PushSettings.setWatermarks(context, Watermarks.Unarmed)
			scheduler.cancel(JOB_ID)
			return
		}
		val stored = PushSettings.watermarks(context)
		val seeded = stored.seeded(Watermarks.seenAt(System.currentTimeMillis()))
		if (seeded != stored) PushSettings.setWatermarks(context, seeded)
		val job = JobInfo.Builder(JOB_ID, ComponentName(context, PushPollService::class.java))
			.setRequiredNetworkType(JobInfo.NETWORK_TYPE_ANY)
			.setPeriodic(PERIOD_MS)
			.setPersisted(true)
			.build()
		if (scheduler.getPendingJob(JOB_ID) != job) scheduler.schedule(job)
	}
}
