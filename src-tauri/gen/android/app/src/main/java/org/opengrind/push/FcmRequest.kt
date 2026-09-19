package org.opengrind.push

import android.content.ComponentName
import android.content.Context
import android.content.Intent
import android.content.ServiceConnection
import android.os.Handler
import android.os.IBinder
import android.os.Looper
import android.os.Message
import android.os.Messenger
import android.os.RemoteException
import java.util.concurrent.atomic.AtomicBoolean

sealed interface FcmOutcome {
	data class Token(val token: String) : FcmOutcome

	data object Deleted : FcmOutcome

	data class Failed(val marker: String, val detail: String?) : FcmOutcome
}

class FcmRequest(
	private val context: Context,
	private val what: Int,
	private val onOutcome: (FcmOutcome) -> Unit,
) : ServiceConnection {
	private val settled = AtomicBoolean(false)
	private val handler = Handler(Looper.getMainLooper())
	private val replies = Messenger(
		Handler(Looper.getMainLooper()) { reply ->
			settle(outcomeOf(reply))
			true
		},
	)
	private val expire = Runnable { settle(FcmOutcome.Failed(TIMED_OUT, null)) }

	fun send() {
		val intent = Intent(PushContract.ACTION_BIND).setPackage(PushContract.ADDON_PACKAGE)
		val bound = runCatching {
			context.bindService(intent, this, Context.BIND_AUTO_CREATE)
		}.getOrDefault(false)
		if (!bound) {
			settle(FcmOutcome.Failed(UNAVAILABLE, null))
			return
		}
		handler.postDelayed(expire, TIMEOUT_MS)
	}

	override fun onServiceConnected(name: ComponentName, service: IBinder) {
		val request = Message.obtain(null, what).apply { replyTo = replies }
		try {
			Messenger(service).send(request)
		} catch (e: RemoteException) {
			settle(FcmOutcome.Failed(UNAVAILABLE, e.javaClass.simpleName))
		}
	}

	override fun onServiceDisconnected(name: ComponentName) = settle(FcmOutcome.Failed(UNAVAILABLE, null))

	override fun onNullBinding(name: ComponentName) = settle(FcmOutcome.Failed(REFUSED, null))

	private fun outcomeOf(reply: Message): FcmOutcome {
		val data = reply.data
		data?.getString(PushContract.EXTRA_NONCE)?.let { PushSettings.setNonce(context, it) }
		val token = data?.getString(PushContract.EXTRA_TOKEN)
		return when {
			reply.what == PushContract.MSG_TOKEN && !token.isNullOrEmpty() -> FcmOutcome.Token(token)
			reply.what == PushContract.MSG_DELETED -> FcmOutcome.Deleted
			reply.what == PushContract.MSG_ERROR -> FcmOutcome.Failed(
				data?.getString(PushContract.EXTRA_ERROR) ?: UNAVAILABLE,
				data?.getString(PushContract.EXTRA_ERROR_DETAIL),
			)
			else -> FcmOutcome.Failed(UNAVAILABLE, null)
		}
	}

	private fun settle(outcome: FcmOutcome) {
		if (!settled.compareAndSet(false, true)) return
		handler.removeCallbacks(expire)
		runCatching { context.unbindService(this) }
		onOutcome(outcome)
	}

	private companion object {
		const val TIMEOUT_MS = 20_000L
		const val UNAVAILABLE = "fcm-unavailable"
		const val REFUSED = "fcm-refused"
		const val TIMED_OUT = "fcm-timed-out"
	}
}
