package org.opengrind.update

sealed interface TransferProgress {
	data class Percent(
		val value: Int,
	) : TransferProgress

	data object Indeterminate : TransferProgress

	companion object {
		fun of(percent: Int?): TransferProgress = percent?.let(::Percent) ?: Indeterminate
	}
}
