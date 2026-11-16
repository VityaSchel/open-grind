package org.opengrind.push

enum class RelayBreak(val wire: String) {
	EndpointChanged("endpoint-changed"),
	Unregistered("unregistered"),
	DistributorGone("distributor-gone"),
	RelayKeyChanged("relay-key-changed"),
	AccountChanged("account-changed"),
	;

	companion object {
		fun of(wire: String?): RelayBreak? = entries.firstOrNull { it.wire == wire }
	}
}
