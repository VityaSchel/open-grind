package org.opengrind

import android.app.Application
import io.crates.keyring.Keyring

class OpenGrindApplication : Application() {
	override fun onCreate() {
		super.onCreate()
		Keyring.initializeNdkContext(this)
	}
}
