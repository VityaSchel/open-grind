package org.opengrind.disguise

import android.app.Activity
import android.content.Intent
import android.os.Build
import android.os.Bundle
import android.os.Process

class RestartActivity : Activity() {
	override fun onCreate(savedInstanceState: Bundle?) {
		super.onCreate(savedInstanceState)
		Process.killProcess(intent.getIntExtra(EXTRA_PID, -1))
		target()?.let(::startActivity)
		finish()
		Runtime.getRuntime().exit(0)
	}

	private fun target(): Intent? =
		if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.TIRAMISU) {
			intent.getParcelableExtra(EXTRA_TARGET, Intent::class.java)
		} else {
			@Suppress("DEPRECATION")
			intent.getParcelableExtra(EXTRA_TARGET)
		}

	companion object {
		private const val EXTRA_TARGET = "org.opengrind.disguise.extra.TARGET"
		private const val EXTRA_PID = "org.opengrind.disguise.extra.PID"

		fun restart(activity: Activity, target: Intent) {
			activity.startActivity(
				Intent(activity, RestartActivity::class.java)
					.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK)
					.putExtra(
						EXTRA_TARGET,
						target.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK or Intent.FLAG_ACTIVITY_CLEAR_TASK),
					)
					.putExtra(EXTRA_PID, Process.myPid()),
			)
			activity.finishAndRemoveTask()
			Runtime.getRuntime().exit(0)
		}
	}
}
