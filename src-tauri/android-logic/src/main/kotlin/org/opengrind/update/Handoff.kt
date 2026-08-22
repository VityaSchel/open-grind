package org.opengrind.update

open class Handoff<T> {
	private var waiting: ((T) -> Unit)? = null
	private var offered: T? = null

	@Synchronized
	fun offer(value: T) {
		val listener = waiting
		if (listener == null) {
			offered = value
		} else {
			waiting = null
			listener(value)
		}
	}

	@Synchronized
	fun onNext(listener: (T) -> Unit) {
		val pending = offered
		if (pending == null) {
			waiting = listener
		} else {
			offered = null
			listener(pending)
		}
	}

	@Synchronized
	fun forget() {
		waiting = null
		offered = null
	}
}
