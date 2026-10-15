package org.opengrind.update

class TransferHolds {
	private val active = ArrayList<Transfer>()
	private val progress = HashMap<Transfer, TransferProgress>()

	@Synchronized
	fun begin(transfer: Transfer) {
		active.add(transfer)
	}

	@Synchronized
	fun end(transfer: Transfer) {
		active.remove(transfer)
		if (transfer !in active) progress.remove(transfer)
	}

	@Synchronized
	fun report(
		transfer: Transfer,
		reached: TransferProgress,
	): Boolean {
		if (transfer !in active) return false
		progress[transfer] = reached
		return true
	}

	@Synchronized
	fun newest(): Transfer? = active.lastOrNull()

	@Synchronized
	fun progressOf(transfer: Transfer): TransferProgress? = progress[transfer]
}
