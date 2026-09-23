package org.opengrind.update

class TransferHolds {
	private val active = ArrayList<Transfer>()

	@Synchronized
	fun begin(transfer: Transfer) {
		active.add(transfer)
	}

	@Synchronized
	fun end(transfer: Transfer): Transfer? {
		active.remove(transfer)
		return active.lastOrNull()
	}
}
