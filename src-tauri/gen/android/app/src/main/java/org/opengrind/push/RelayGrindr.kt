package org.opengrind.push

object RelayGrindr {
	init {
		System.loadLibrary("open_grind_lib")
	}

	external fun nativeRegister(token: String, profileId: String): Int

	external fun nativeUnregister(token: String, profileId: String): Int
}
