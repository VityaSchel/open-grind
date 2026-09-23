package org.opengrind.push

import android.content.Context
import androidx.annotation.MainThread
import androidx.lifecycle.DefaultLifecycleObserver
import androidx.lifecycle.Lifecycle
import androidx.lifecycle.LifecycleOwner
import androidx.lifecycle.ProcessLifecycleOwner

object AppForeground : DefaultLifecycleObserver {
	private lateinit var context: Context

	private val lifecycle get() = ProcessLifecycleOwner.get().lifecycle

	fun visible(): Boolean = lifecycle.currentState.isAtLeast(Lifecycle.State.STARTED)

	@MainThread
	fun catchUpPollingOnLeave(context: Context) {
		this.context = context.applicationContext
		lifecycle.addObserver(this)
	}

	override fun onStop(owner: LifecycleOwner) = PushSchedule.catchUp(context)
}
