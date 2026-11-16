package org.opengrind

import android.app.Application
import io.crates.keyring.Keyring
import org.opengrind.push.PushSettings

class OpenGrindApplication : Application() {
	override fun onCreate() {
		super.onCreate()
		Keyring.initializeNdkContext(this)
		if (Application.getProcessName() == packageName) runCatching { PushSettings.migrateFastSource(this) }
	}
}
