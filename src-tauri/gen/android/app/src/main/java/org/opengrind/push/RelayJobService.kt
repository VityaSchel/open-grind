package org.opengrind.push

import android.app.job.JobInfo
import android.app.job.JobParameters
import android.app.job.JobScheduler
import android.app.job.JobService
import android.content.ComponentName
import android.content.Context

class RelayJobService : JobService() {
	override fun onStartJob(params: JobParameters): Boolean = when (params.jobId) {
		REGISTER_JOB_ID -> startRegistration(params)
		ORPHAN_JOB_ID -> startOrphanCleanup(params)
		else -> false
	}

	override fun onStopJob(params: JobParameters): Boolean = true

	private fun startRegistration(params: JobParameters): Boolean {
		if (!due(this)) return false
		val context = applicationContext
		RelayRegistration.later {
			val outcome = if (due(context)) RelayRegistration.register(context) else RelayOutcome.Done
			jobFinished(params, outcome == RelayOutcome.Failed)
		}
		return true
	}

	private fun startOrphanCleanup(params: JobParameters): Boolean {
		if (RelayPairing.orphans(this) == null) return false
		val context = applicationContext
		RelayRegistration.later {
			jobFinished(params, RelayRegistration.deleteOrphans(context) == RelayOutcome.Failed)
		}
		return true
	}

	companion object {
		private const val REGISTER_JOB_ID = 4713
		private const val ORPHAN_JOB_ID = 4714

		fun schedule(context: Context) = scheduleJob(context, REGISTER_JOB_ID)

		fun cancel(context: Context) = cancelJob(context, REGISTER_JOB_ID)

		fun scheduleOrphanCleanup(context: Context) = scheduleJob(context, ORPHAN_JOB_ID)

		fun cancelOrphanCleanup(context: Context) = cancelJob(context, ORPHAN_JOB_ID)

		private fun scheduleJob(context: Context, jobId: Int) {
			val job = JobInfo.Builder(jobId, ComponentName(context, RelayJobService::class.java))
				.setRequiredNetworkType(JobInfo.NETWORK_TYPE_ANY)
				.setPersisted(true)
				.build()
			context.getSystemService(JobScheduler::class.java).schedule(job)
		}

		private fun cancelJob(context: Context, jobId: Int) {
			context.getSystemService(JobScheduler::class.java).cancel(jobId)
		}

		private fun due(context: Context): Boolean {
			val token = RelayPairing.fcmToken(context) ?: return false
			return PushSettings.mode(context) == PushMode.Fast &&
				PushSettings.fastSource(context) == FastSource.Relay &&
				PushSettings.notificationsEnabled(context) &&
				RelayPairing.broken(context) == null &&
				token !in RelayPairing.registered(context)
		}
	}
}
