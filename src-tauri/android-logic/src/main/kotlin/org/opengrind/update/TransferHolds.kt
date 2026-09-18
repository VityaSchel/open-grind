package org.opengrind.update

class TransferHolds {
	private val active = ArrayList<TransferTitle>()

	@Synchronized
	fun begin(title: TransferTitle) {
		active.add(title)
	}

	@Synchronized
	fun end(title: TransferTitle): TransferTitle? {
		active.remove(title)
		return active.lastOrNull()
	}
}
