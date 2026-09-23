package org.opengrind.update

class TransferHolds {
	private val active = ArrayList<Transfer>()

	@Synchronized
	fun begin(transfer: Transfer) {
		active.add(transfer)
	}

	@Synchronized
	fun end(transfer: Transfer) {
		active.remove(transfer)
	}

	@Synchronized
	fun newest(): Transfer? = active.lastOrNull()
}
